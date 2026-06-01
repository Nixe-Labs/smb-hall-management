<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, toISODate } from '@/lib/utils/dates'
import type { BankAccount, AccountBalance, AccountMovement, AccountMovementType, AccountTransfer, AdvancePayment, Booking } from '@/types/database'
import {
  buildBookingTrail,
  trailTotalAmount,
  distributeByCurrentAccount,
  type TrailRow,
} from '@/lib/utils/treasury'

const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

const canWrite = computed(() => authStore.role === 'admin' || authStore.role === 'staff')

const accounts = ref<BankAccount[]>([])
const balances = ref<AccountBalance[]>([])
const movements = ref<AccountMovement[]>([])
const loading = ref(true)

// Filters
const filterAccountId = ref<string>('')
const filterType = ref<'all' | AccountMovementType>('all')

// ── Data load ───────────────────────────────────────────────
async function loadAll() {
  loading.value = true
  try {
    const [accRes, balRes, movRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').order('type').order('name'),
      supabase.from('account_balance').select('*'),
      supabase.from('account_movements').select('*').order('movement_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    ])
    accounts.value = (accRes.data as BankAccount[]) ?? []
    balances.value = (balRes.data as AccountBalance[]) ?? []
    movements.value = (movRes.data as AccountMovement[]) ?? []
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load Treasury'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    loading.value = false
  }
}

// ── Derived ─────────────────────────────────────────────────
const activeBalances = computed(() => balances.value.filter(b => b.is_active))
const grandTotal = computed(() => activeBalances.value.reduce((s, b) => s + Number(b.balance), 0))
const accountById = computed(() => {
  const m = new Map<string, BankAccount>()
  for (const a of accounts.value) m.set(a.id, a)
  return m
})
function accountName(id: string | null | undefined): string {
  if (!id) return '—'
  return accountById.value.get(id)?.name ?? 'Unknown'
}
function typePill(t: BankAccount['type']): string {
  return t === 'cash' ? 'Cash' : t === 'wallet' ? 'Wallet' : 'Bank'
}

const filteredMovements = computed(() => {
  return movements.value.filter(m => {
    if (filterAccountId.value && m.account_id !== filterAccountId.value) return false
    if (filterType.value !== 'all' && m.movement_type !== filterType.value) return false
    return true
  })
})

function movementSign(t: AccountMovementType): string {
  return t === 'inflow' || t === 'transfer_in' ? '+' : '−'
}
function movementClass(t: AccountMovementType): string {
  return t === 'inflow' || t === 'transfer_in' ? 'mv-pos' : 'mv-neg'
}
function movementLabel(m: AccountMovement): string {
  if (m.movement_type === 'inflow') return `${m.label}${m.method ? ' · ' + m.method : ''}`
  if (m.movement_type === 'transfer_in') return `From ${accountName(m.other_account_id)}`
  return `To ${accountName(m.other_account_id)}`
}
function gotoBooking(id: string | null) {
  if (id) router.push({ name: 'booking-detail', params: { id } })
}

// ── Transfer modal ──────────────────────────────────────────
const showTransfer = ref(false)
const savingTransfer = ref(false)
const transfer = ref<{ from_account_id: string; to_account_id: string; amount: string; transfer_date: string; notes: string }>({
  from_account_id: '',
  to_account_id: '',
  amount: '',
  transfer_date: toISODate(new Date()),
  notes: '',
})

function openTransfer() {
  transfer.value = {
    from_account_id: '',
    to_account_id: '',
    amount: '',
    transfer_date: toISODate(new Date()),
    notes: '',
  }
  showTransfer.value = true
}

const transferAmount = computed(() => Number(transfer.value.amount) || 0)
const fromBalance = computed(() => {
  const b = balances.value.find(x => x.account_id === transfer.value.from_account_id)
  return b ? Number(b.balance) : 0
})
const transferOverdraws = computed(() => transfer.value.from_account_id && transferAmount.value > fromBalance.value)
const transferValid = computed(() => {
  return !!transfer.value.from_account_id
    && !!transfer.value.to_account_id
    && transfer.value.from_account_id !== transfer.value.to_account_id
    && transferAmount.value > 0
    && !!transfer.value.transfer_date
})

async function saveTransfer() {
  if (!transferValid.value) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Pick distinct accounts, amount > 0, and a date.', life: 3000 })
    return
  }
  savingTransfer.value = true
  try {
    const { error } = await supabase.from('account_transfers').insert({
      from_account_id: transfer.value.from_account_id,
      to_account_id: transfer.value.to_account_id,
      amount: transferAmount.value,
      transfer_date: transfer.value.transfer_date,
      notes: transfer.value.notes || null,
      created_by: authStore.user?.id ?? null,
    })
    if (error) throw error
    showTransfer.value = false
    toast.add({ severity: 'success', summary: 'Recorded', detail: 'Transfer saved', life: 2500 })
    await loadAll()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    savingTransfer.value = false
  }
}

// ── Booking trail ───────────────────────────────────────────
// Searchable booking picker → fetch advances + tagged transfers for
// that booking → render each advance's "where it landed → where it is
// now" chain → per-advance Move action.
function escapeIlike(s: string): string {
  return s.replace(/[\\%_,()]/g, m => '\\' + m)
}

const bookingSearch = ref('')
const searchResults = ref<Booking[]>([])
const searching = ref(false)
const selectedBooking = ref<Booking | null>(null)
const bookingAdvances = ref<AdvancePayment[]>([])
const bookingTransfers = ref<AccountTransfer[]>([])
const loadingTrail = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

function onBookingSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runBookingSearch, 250)
}

async function runBookingSearch() {
  const term = bookingSearch.value.trim()
  if (term.length < 2) {
    searchResults.value = []
    return
  }
  searching.value = true
  try {
    const pat = `%${escapeIlike(term)}%`
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .or(`customer_name.ilike.${pat},customer_phone.ilike.${pat}`)
      .order('function_date', { ascending: false })
      .limit(20)
    searchResults.value = (data as Booking[]) ?? []
  } finally {
    searching.value = false
  }
}

async function selectBooking(b: Booking) {
  selectedBooking.value = b
  bookingSearch.value = ''
  searchResults.value = []
  loadingTrail.value = true
  try {
    const [advRes, xferRes] = await Promise.all([
      supabase.from('advance_payments').select('*').eq('booking_id', b.id).order('advance_number'),
      // pull every transfer tagged to this booking's advances
      supabase.from('account_transfers').select('*').not('source_advance_id', 'is', null),
    ])
    bookingAdvances.value = (advRes.data as AdvancePayment[]) ?? []
    const advIds = new Set(bookingAdvances.value.map(a => a.id))
    bookingTransfers.value = ((xferRes.data as AccountTransfer[]) ?? []).filter(t => t.source_advance_id && advIds.has(t.source_advance_id))
  } finally {
    loadingTrail.value = false
  }
}

function clearBookingSelection() {
  selectedBooking.value = null
  bookingAdvances.value = []
  bookingTransfers.value = []
}

// Chain math lives in @/lib/utils/treasury so it can be unit-tested.
const bookingTrail = computed<TrailRow[]>(() =>
  buildBookingTrail(bookingAdvances.value, bookingTransfers.value),
)
const trailTotal = computed(() => trailTotalAmount(bookingTrail.value))
const trailByCurrentAccount = computed(() =>
  distributeByCurrentAccount(bookingTrail.value).map(({ id, amount }) => ({
    id,
    name: accountName(id),
    amount,
  })),
)

// ── Per-advance Move modal ──────────────────────────────────
const showMove = ref(false)
const savingMove = ref(false)
const moveContext = ref<{
  advance: AdvancePayment
  fromAccountId: string
  toAccountId: string
  amount: string
  transferDate: string
  notes: string
} | null>(null)

function openMove(row: TrailRow) {
  if (!row.currentAccountId) {
    toast.add({ severity: 'warn', summary: 'No source account', detail: 'This advance has no landing account set — edit it on the booking first.', life: 4000 })
    return
  }
  moveContext.value = {
    advance: row.advance,
    fromAccountId: row.currentAccountId,
    toAccountId: '',
    amount: String(row.advance.amount),
    transferDate: toISODate(new Date()),
    notes: '',
  }
  showMove.value = true
}

async function saveMove() {
  const ctx = moveContext.value
  if (!ctx) return
  const amt = Number(ctx.amount) || 0
  if (!ctx.fromAccountId || !ctx.toAccountId || ctx.fromAccountId === ctx.toAccountId || amt <= 0) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Pick a destination account and a positive amount.', life: 3000 })
    return
  }
  savingMove.value = true
  try {
    const { error } = await supabase.from('account_transfers').insert({
      from_account_id: ctx.fromAccountId,
      to_account_id: ctx.toAccountId,
      amount: amt,
      transfer_date: ctx.transferDate,
      source_advance_id: ctx.advance.id,
      notes: ctx.notes || null,
      created_by: authStore.user?.id ?? null,
    })
    if (error) throw error
    showMove.value = false
    toast.add({ severity: 'success', summary: 'Moved', detail: 'Funds moved', life: 2500 })
    // Reload balances + this booking's trail
    await loadAll()
    if (selectedBooking.value) await selectBooking(selectedBooking.value)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to move funds'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    savingMove.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="screen">
    <!-- Header -->
    <div class="fade-in" style="margin-bottom:32px">
      <div class="t-eyebrow" style="margin-bottom:12px">06 — Money · Treasury</div>
      <div class="settings-header-row">
        <div class="settings-header-text">
          <h1 class="t-h1">Where the money lives.</h1>
          <p style="color:var(--ash);margin-top:12px;max-width:560px">
            Live balance per account, every inflow, and every movement between accounts. v1 covers
            inflows + transfers — expenses will follow.
          </p>
        </div>
        <div class="settings-header-action" v-if="canWrite">
          <button class="btn btn-primary" @click="openTransfer" type="button" :disabled="accounts.length < 2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            Record transfer
          </button>
        </div>
      </div>
    </div>

    <!-- Grand total -->
    <div style="display:flex;align-items:baseline;justify-content:space-between;border-top:1px solid var(--ink);border-bottom:1px solid var(--rule);padding:20px 0;margin-bottom:24px" class="fade-up">
      <div>
        <div class="t-mono" style="color:var(--ash);font-size:11px">TOTAL ACROSS ACCOUNTS</div>
        <div class="t-num" style="font-size:48px;margin-top:4px;line-height:1">{{ formatCurrency(grandTotal) }}</div>
      </div>
      <div style="text-align:right">
        <div class="t-mono" style="color:var(--ash);font-size:11px">ACCOUNTS</div>
        <div style="font-size:14px;margin-top:4px">{{ activeBalances.length }} active</div>
      </div>
    </div>

    <div v-if="loading" class="loading-center"><div class="smb-spinner"></div></div>

    <div v-else-if="accounts.length === 0" style="text-align:center;color:var(--ash);padding:60px">
      No accounts yet — add one in
      <button class="st-textbtn" @click="router.push({ name: 'bank-accounts' })" type="button">Settings · Bank Accounts</button>.
    </div>

    <template v-else>
      <!-- Balance cards -->
      <div class="treasury-grid fade-up">
        <div v-for="b in activeBalances" :key="b.account_id" class="treasury-card">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span class="t-mono" style="color:var(--ash);font-size:11px;letter-spacing:.08em">{{ typePill(b.type).toUpperCase() }}</span>
          </div>
          <h3 class="t-h3" style="margin-top:18px;margin-bottom:4px">{{ b.name }}</h3>
          <div class="t-num" style="font-size:36px;margin-top:16px;line-height:1">{{ formatCurrency(b.balance) }}</div>
          <dl class="treasury-meta" style="margin-top:20px">
            <div>
              <dt>Inflow</dt>
              <dd class="t-mono">+ {{ formatCurrency(b.inflow_total) }}</dd>
            </div>
            <div>
              <dt>Transfers in</dt>
              <dd class="t-mono">+ {{ formatCurrency(b.transfers_in_total) }}</dd>
            </div>
            <div>
              <dt>Transfers out</dt>
              <dd class="t-mono">− {{ formatCurrency(b.transfers_out_total) }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Movements ledger -->
      <div style="margin-top:48px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:16px">
          <h2 class="t-h2">Recent movements</h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <select class="input" style="min-width:180px" v-model="filterAccountId">
              <option value="">All accounts</option>
              <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <select class="input" style="min-width:160px" v-model="filterType">
              <option value="all">All types</option>
              <option value="inflow">Inflows</option>
              <option value="transfer_in">Transfers in</option>
              <option value="transfer_out">Transfers out</option>
            </select>
          </div>
        </div>

        <div class="treasury-table-wrap">
          <table class="treasury-table">
            <thead>
              <tr>
                <th style="width:120px">Date</th>
                <th>Account</th>
                <th>Type</th>
                <th>Description</th>
                <th style="text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredMovements.length === 0">
                <td colspan="5" style="text-align:center;color:var(--ash);padding:40px">No movements yet.</td>
              </tr>
              <tr v-for="m in filteredMovements" :key="m.movement_id" :class="m.booking_id ? 'is-clickable' : ''" @click="gotoBooking(m.booking_id)">
                <td>{{ m.movement_date ? formatDate(m.movement_date) : '—' }}</td>
                <td style="font-weight:600">{{ accountName(m.account_id) }}</td>
                <td>
                  <span class="mv-pill" :class="movementClass(m.movement_type)">
                    {{ m.movement_type === 'inflow' ? 'Inflow' : m.movement_type === 'transfer_in' ? 'Transfer in' : 'Transfer out' }}
                  </span>
                </td>
                <td style="color:var(--ash)">{{ movementLabel(m) }}<span v-if="m.notes"> · {{ m.notes }}</span></td>
                <td style="text-align:right;font-family:var(--font-display);font-weight:600" :class="movementClass(m.movement_type)">
                  {{ movementSign(m.movement_type) }} {{ formatCurrency(m.amount) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <!-- Booking trail -->
      <div style="margin-top:56px">
        <h2 class="t-h2" style="margin-bottom:8px">Booking trail</h2>
        <p style="color:var(--ash);font-size:13px;margin-bottom:16px;max-width:620px">
          Pick a booking to see every advance, where each payment landed, and where it sits now.
          Use <strong>Move</strong> to sweep an advance from one account to another — the trail stays attached to the booking.
        </p>

        <div v-if="!selectedBooking" class="booking-search-wrap" style="position:relative;max-width:520px">
          <input
            class="input"
            type="search"
            placeholder="Search by customer name or phone…"
            v-model="bookingSearch"
            @input="onBookingSearchInput"
          />
          <div v-if="searching" style="position:absolute;right:12px;top:12px;color:var(--ash);font-size:12px">Searching…</div>
          <div v-if="searchResults.length > 0" class="search-results-dropdown">
            <button
              v-for="b in searchResults"
              :key="b.id"
              type="button"
              class="search-result"
              @click="selectBooking(b)"
            >
              <div style="font-weight:600">{{ b.customer_name }}</div>
              <div style="font-size:12px;color:var(--ash)">{{ formatDate(b.function_date) }}<span v-if="b.customer_phone"> · {{ b.customer_phone }}</span></div>
            </button>
          </div>
          <div v-else-if="bookingSearch.length >= 2 && !searching" style="font-size:12px;color:var(--ash);margin-top:8px">No matches.</div>
        </div>

        <div v-else class="trail-panel">
          <div class="trail-header">
            <div>
              <div class="t-mono" style="font-size:11px;color:var(--ash);letter-spacing:.08em">SELECTED BOOKING</div>
              <h3 class="t-h3" style="margin-top:4px;margin-bottom:4px">{{ selectedBooking.customer_name }}</h3>
              <div style="font-size:12px;color:var(--ash)">
                {{ formatDate(selectedBooking.function_date) }}
                <span v-if="selectedBooking.customer_phone"> · {{ selectedBooking.customer_phone }}</span>
                · Rent {{ formatCurrency(selectedBooking.rent) }}
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="st-textbtn" type="button" @click="router.push({ name: 'booking-detail', params: { id: selectedBooking.id } })">Open booking</button>
              <button class="st-textbtn" type="button" @click="clearBookingSelection">Clear</button>
            </div>
          </div>

          <div v-if="loadingTrail" class="loading-center" style="padding:32px"><div class="smb-spinner"></div></div>

          <template v-else>
            <!-- Distribution summary -->
            <div class="trail-distribution">
              <div>
                <div class="t-mono" style="font-size:11px;color:var(--ash)">TOTAL COLLECTED</div>
                <div class="t-num" style="font-size:28px;margin-top:4px">{{ formatCurrency(trailTotal) }}</div>
              </div>
              <div v-if="trailByCurrentAccount.length > 0" style="flex:1;display:flex;flex-wrap:wrap;gap:14px;justify-content:flex-end">
                <div v-for="b in trailByCurrentAccount" :key="b.id" class="trail-balance-chip">
                  <div style="font-size:11px;color:var(--ash)">{{ b.name }}</div>
                  <div class="t-mono" style="font-weight:600">{{ formatCurrency(b.amount) }}</div>
                </div>
              </div>
            </div>

            <!-- Per-advance rows -->
            <div v-if="bookingTrail.length === 0" style="text-align:center;color:var(--ash);padding:32px">
              No advances recorded for this booking yet.
            </div>
            <div v-else class="trail-rows">
              <div v-for="row in bookingTrail" :key="row.advance.id" class="trail-row">
                <div class="trail-row-head">
                  <div>
                    <span class="t-mono" style="font-size:11px;color:var(--ash)">ADV-{{ String(row.advance.advance_number).padStart(2,'0') }}</span>
                    <span style="margin-left:10px;font-size:13px;text-transform:capitalize;color:var(--ash)">{{ row.advance.payment_method ?? '—' }}</span>
                    <span style="margin-left:10px;font-size:13px;color:var(--ash)">{{ row.advance.payment_date ? formatDate(row.advance.payment_date) : '—' }}</span>
                  </div>
                  <div class="t-num" style="font-size:18px;font-weight:600">{{ formatCurrency(row.advance.amount) }}</div>
                </div>
                <div class="trail-chain">
                  <div class="trail-step">
                    <span class="trail-dot"></span>
                    <span class="trail-step-label">Landed in <strong>{{ accountName(row.advance.deposit_account_id) }}</strong></span>
                  </div>
                  <div v-for="t in row.chain" :key="t.id" class="trail-step">
                    <span class="trail-dot trail-dot-move"></span>
                    <span class="trail-step-label">
                      Moved to <strong>{{ accountName(t.to_account_id) }}</strong> on {{ formatDate(t.transfer_date) }}
                      <span v-if="t.notes" style="color:var(--ash)"> — {{ t.notes }}</span>
                    </span>
                  </div>
                </div>
                <div class="trail-footer">
                  <div style="font-size:12px;color:var(--ash)">
                    Current: <strong style="color:var(--ink)">{{ accountName(row.currentAccountId) }}</strong>
                  </div>
                  <button v-if="canWrite && row.currentAccountId" class="btn" type="button" @click="openMove(row)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    Move
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Per-advance Move modal -->
    <Teleport to="body">
      <div v-if="showMove && moveContext" class="smb-modal-overlay" @click.self="showMove = false">
        <div class="smb-modal">
          <div class="smb-modal-header">
            <h3 class="t-h3">Move funds</h3>
            <button class="smb-nav-iconbtn" @click="showMove = false" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <p style="font-size:12px;color:var(--ash);margin-bottom:14px">
              {{ selectedBooking?.customer_name }} · ADV-{{ String(moveContext.advance.advance_number).padStart(2,'0') }} · {{ formatCurrency(moveContext.advance.amount) }}
            </p>
            <div class="form-stack">
              <div>
                <label class="field-label">From</label>
                <input class="input" :value="accountName(moveContext.fromAccountId)" disabled />
              </div>
              <div>
                <label class="field-label">To *</label>
                <select class="input" v-model="moveContext.toAccountId">
                  <option value="">— Pick destination —</option>
                  <option v-for="a in accounts.filter(x => x.is_active && x.id !== moveContext!.fromAccountId)" :key="a.id" :value="a.id">{{ a.name }} ({{ typePill(a.type) }})</option>
                </select>
              </div>
              <div>
                <label class="field-label">Amount (₹)</label>
                <input type="number" class="input" :value="moveContext.amount" disabled />
                <div style="font-size:11px;color:var(--ash);margin-top:6px">A move sweeps the full advance so the trail stays accurate. For partial sweeps, use <strong>Record transfer</strong> on the main page above.</div>
              </div>
              <div>
                <label class="field-label">Date *</label>
                <input type="date" class="input" v-model="moveContext.transferDate" />
              </div>
              <div>
                <label class="field-label">Notes</label>
                <textarea class="input" v-model="moveContext.notes" placeholder="e.g. Counter cash deposit"></textarea>
              </div>
            </div>
          </div>
          <div class="smb-modal-footer">
            <button class="btn" @click="showMove = false" type="button">Cancel</button>
            <button class="btn btn-primary" @click="saveMove" :disabled="savingMove" type="button">{{ savingMove ? 'Moving…' : 'Move funds' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Transfer modal -->
    <Teleport to="body">
      <div v-if="showTransfer" class="smb-modal-overlay" @click.self="showTransfer = false">
        <div class="smb-modal">
          <div class="smb-modal-header">
            <h3 class="t-h3">Record a transfer</h3>
            <button class="smb-nav-iconbtn" @click="showTransfer = false" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div class="form-stack">
              <div>
                <label class="field-label">From *</label>
                <select class="input" v-model="transfer.from_account_id">
                  <option value="">— Pick source —</option>
                  <option v-for="a in accounts.filter(x => x.is_active)" :key="a.id" :value="a.id">{{ a.name }} ({{ typePill(a.type) }})</option>
                </select>
                <div v-if="transfer.from_account_id" style="font-size:11px;color:var(--ash);margin-top:6px">
                  Current balance: <strong>{{ formatCurrency(fromBalance) }}</strong>
                </div>
              </div>
              <div>
                <label class="field-label">To *</label>
                <select class="input" v-model="transfer.to_account_id">
                  <option value="">— Pick destination —</option>
                  <option v-for="a in accounts.filter(x => x.is_active && x.id !== transfer.from_account_id)" :key="a.id" :value="a.id">{{ a.name }} ({{ typePill(a.type) }})</option>
                </select>
              </div>
              <div>
                <label class="field-label">Amount (₹) *</label>
                <input type="number" class="input" v-model="transfer.amount" placeholder="0" min="0" />
                <div v-if="transferOverdraws" style="color:var(--signal-red,#c0392b);font-size:12px;margin-top:6px">
                  This exceeds the source account's current balance ({{ formatCurrency(fromBalance) }}). You can still save — useful for back-dated entries — but double-check.
                </div>
              </div>
              <div>
                <label class="field-label">Date *</label>
                <input type="date" class="input" v-model="transfer.transfer_date" />
              </div>
              <div>
                <label class="field-label">Notes</label>
                <textarea class="input" v-model="transfer.notes" placeholder="e.g. End-of-day cash deposit"></textarea>
              </div>
            </div>
          </div>
          <div class="smb-modal-footer">
            <button class="btn" @click="showTransfer = false" type="button">Cancel</button>
            <button class="btn btn-primary" @click="saveTransfer" :disabled="savingTransfer || !transferValid" type="button">
              {{ savingTransfer ? 'Saving…' : 'Save transfer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.treasury-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.treasury-card {
  border: 1px solid var(--rule);
  padding: 24px;
  background: var(--paper, #fff);
}
.treasury-meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin: 0;
}
.treasury-meta > div {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.treasury-meta dt {
  color: var(--ash);
  margin: 0;
}
.treasury-meta dd {
  margin: 0;
  color: var(--ink);
}
.treasury-table-wrap { border: 1px solid var(--rule); overflow-x: auto; }
.treasury-table { width: 100%; border-collapse: collapse; min-width: 720px; }
.treasury-table th, .treasury-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--hair); font-size: 13px; }
.treasury-table thead th { background: var(--cream, #faf8f3); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ash); }
.treasury-table tbody tr.is-clickable { cursor: pointer; }
.treasury-table tbody tr.is-clickable:hover { background: var(--cream, #faf8f3); }
.mv-pill { display: inline-block; padding: 2px 8px; font-size: 11px; border-radius: 2px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.mv-pill.mv-pos { background: rgba(46, 125, 50, 0.1); color: #2e7d32; }
.mv-pill.mv-neg { background: rgba(192, 57, 43, 0.1); color: #c0392b; }
.mv-pos { color: #2e7d32; }
.mv-neg { color: #c0392b; }
@media (max-width: 640px) {
  .treasury-card { padding: 16px; }
}

/* Booking trail */
.search-results-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--paper, #fff); border: 1px solid var(--rule);
  max-height: 320px; overflow-y: auto; z-index: 10;
}
.search-result {
  display: block; width: 100%; text-align: left;
  padding: 12px 16px; background: transparent; border: 0; border-bottom: 1px solid var(--hair);
  cursor: pointer; font: inherit; color: inherit;
}
.search-result:last-child { border-bottom: 0; }
.search-result:hover { background: var(--cream, #faf8f3); }
.trail-panel { border: 1px solid var(--rule); padding: 24px; background: var(--paper, #fff); }
.trail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--hair); margin-bottom: 20px; }
.trail-distribution { display: flex; align-items: center; gap: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--hair); margin-bottom: 20px; flex-wrap: wrap; }
.trail-balance-chip { padding: 8px 14px; border: 1px solid var(--rule); border-radius: 2px; min-width: 140px; }
.trail-rows { display: flex; flex-direction: column; gap: 14px; }
.trail-row { border: 1px solid var(--hair); padding: 16px; }
.trail-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.trail-chain { margin-top: 14px; padding-left: 6px; }
.trail-step { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 13px; }
.trail-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ash); flex-shrink: 0; }
.trail-dot.trail-dot-move { background: #2e7d32; }
.trail-step-label { color: var(--ink); }
.trail-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--hair); }
@media (max-width: 640px) {
  .trail-panel { padding: 16px; }
  .trail-row { padding: 12px; }
  .trail-footer { flex-direction: column; align-items: stretch; gap: 10px; }
}
</style>
