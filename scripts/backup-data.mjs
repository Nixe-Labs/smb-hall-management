#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-shot data backup for the SMB hall-management Supabase project.
//
// Dumps every core business table to backups/backup-<timestamp>.json so you
// have a restore point before applying migrations or trying new features.
//
//   npm run backup            (or)   node scripts/backup-data.mjs
//
// Row-level security blocks anonymous reads, so the script needs ONE of:
//   * a service-role key (bypasses RLS — cleanest), or
//   * an app login (email + password).
//
// If neither is set in the environment / .env, the script PROMPTS for it
// interactively (input hidden) — nothing is written to disk or shell history.
//
// Non-interactive use (CI etc.):
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/backup-data.mjs
//   SUPABASE_EMAIL=you@x.com SUPABASE_PASSWORD=... node scripts/backup-data.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import readline from 'node:readline'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Minimal .env parser (no extra dependency).
function loadEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnv(join(root, '.env')), ...process.env }
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY

if (!url) {
  console.error('✗ Missing VITE_SUPABASE_URL (in .env).')
  process.exit(1)
}

// ── interactive prompts ────────────────────────────────────────────────────
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl.stdoutMuted = hidden
    // Suppress echo of typed characters when hidden.
    rl._writeToOutput = (str) => { if (!rl.stdoutMuted) rl.output.write(str) }
    rl.question('', (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

// Tables worth preserving. Views (balances, payment_status, etc.) are derived
// and intentionally skipped — they rebuild from these base tables.
const TABLES = [
  'profiles',
  'bookings',
  'booking_slots',
  'advance_payments',
  'bill_items',
  'bill_categories',
  'expenses',
  'expense_categories',
  'deposits',
  'bank_accounts',
  'account_transfers',
  'enquiries',
  'enquiry_dates',
  'event_types',
  'notifications',
  'notification_reads',
]

async function getClient() {
  // 1) service-role key from env/.env
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('• Auth: service-role key (RLS bypassed)')
    return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  }
  // 2) email + password from env/.env
  if (env.SUPABASE_EMAIL && env.SUPABASE_PASSWORD) {
    const sb = createClient(url, anon, { auth: { persistSession: false } })
    const { error } = await sb.auth.signInWithPassword({ email: env.SUPABASE_EMAIL, password: env.SUPABASE_PASSWORD })
    if (error) { console.error('✗ Login failed:', error.message); process.exit(1) }
    console.log(`• Auth: signed in as ${env.SUPABASE_EMAIL}`)
    return sb
  }
  // 3) interactive
  console.log('\nNo credentials found. Reading data needs auth (RLS blocks the anon key).')
  console.log('Get a service-role key from: Supabase dashboard → Project Settings → API → service_role.\n')
  const key = await ask('Paste service_role key (hidden), or press Enter to use email/password login: ', { hidden: true })
  if (key) {
    console.log('• Auth: service-role key (RLS bypassed)')
    return createClient(url, key, { auth: { persistSession: false } })
  }
  const email = await ask('Email: ')
  const password = await ask('Password (hidden): ', { hidden: true })
  if (!email || !password) { console.error('✗ No credentials provided.'); process.exit(1) }
  const sb = createClient(url, anon, { auth: { persistSession: false } })
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) { console.error('✗ Login failed:', error.message); process.exit(1) }
  console.log(`• Auth: signed in as ${email}`)
  return sb
}

async function main() {
  const supabase = await getClient()

  const dump = { exported_at: new Date().toISOString(), project_url: url, tables: {} }
  let grandTotal = 0
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) {
      console.warn(`  · ${table}: skipped (${error.message})`)
      dump.tables[table] = { error: error.message }
      continue
    }
    dump.tables[table] = data
    grandTotal += data.length
    console.log(`  · ${table}: ${data.length} rows`)
  }

  if (grandTotal === 0) {
    console.error('\n✗ 0 rows read — credentials may lack access (RLS). Nothing written.')
    process.exit(1)
  }

  const dir = join(root, 'backups')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `backup-${stamp}.json`)
  writeFileSync(file, JSON.stringify(dump, null, 2))
  console.log(`\n✓ ${grandTotal} rows → ${file}`)
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
