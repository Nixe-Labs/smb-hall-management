<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { Profile } from '@/types/database'
import type { UserRole } from '@/types/enums'

const router = useRouter()
const toast = useToast()

const users = ref<Profile[]>([])
const loading = ref(true)

const ROLE_CAP: Record<string, number | null> = { admin: 2, staff: 5, viewer: null }
const roleLabels: Record<string, string> = { admin: 'Admin', staff: 'Staff', viewer: 'Viewer' }

const roleSpec = [
  { role: 'admin',  perms: ['Bookings', 'Reports', 'Settings', 'Manage users'] },
  { role: 'staff',  perms: ['Bookings', 'Collect payments', 'Calendar'] },
  { role: 'viewer', perms: ['Read-only — Reports', 'Read-only — Bookings'] },
]

const roleCounts = (role: string) => users.value.filter(u => u.role === role).length

const atAdminCap = computed(() => roleCounts('admin') >= (ROLE_CAP.admin ?? Infinity))
const atStaffCap = computed(() => roleCounts('staff') >= (ROLE_CAP.staff ?? Infinity))

// Option is blocked when its cap is full — unless the row already has that role.
function roleOptionDisabled(role: UserRole, current?: UserRole): boolean {
  if (role === 'admin') return atAdminCap.value && current !== 'admin'
  if (role === 'staff') return atStaffCap.value && current !== 'staff'
  return false
}

// A throwaway client with no session persistence, so creating a user never
// swaps out the admin's own logged-in session.
const signupClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const showCreate = ref(false)
const creating = ref(false)
const newUser = ref<{ full_name: string; email: string; password: string; role: UserRole }>({
  full_name: '', email: '', password: '', role: 'viewer',
})

function openCreate() {
  newUser.value = { full_name: '', email: '', password: '', role: 'viewer' }
  showCreate.value = true
}

async function createUser() {
  const u = newUser.value
  if (!u.full_name.trim() || !u.email.trim() || !u.password) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Name, email and password are required', life: 3000 })
    return
  }
  if (u.password.length < 6) {
    toast.add({ severity: 'warn', summary: 'Weak password', detail: 'Use at least 6 characters', life: 3000 })
    return
  }
  creating.value = true
  try {
    const { error } = await signupClient.auth.signUp({
      email: u.email.trim(),
      password: u.password,
      options: { data: { full_name: u.full_name.trim(), role: u.role } },
    })
    if (error) throw error
    toast.add({ severity: 'success', summary: 'Account created', detail: `${u.full_name.trim()} added as ${roleLabels[u.role]}`, life: 4000 })
    showCreate.value = false
    await fetchUsers()
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to create account'
    toast.add({ severity: 'error', summary: 'Could not create account', detail: message, life: 6000 })
  } finally {
    creating.value = false
  }
}

async function fetchUsers() {
  loading.value = true
  const { data } = await supabase.from('profiles').select('*').order('created_at')
  users.value = (data as Profile[]) ?? []
  loading.value = false
}

function initials(name: string | null): string {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

const avatarColors = ['#C5705D', '#3D4A5C', '#7B6240', '#5A7A52', '#8B5A8C', '#5C7A8C', '#7A7A7A']
function avatarColor(id: string): string {
  let n = 0
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i)
  return avatarColors[n % avatarColors.length] ?? '#7A7A7A'
}

async function changeRole(user: Profile, role: UserRole) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id)
  if (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } else {
    await fetchUsers()
  }
}

onMounted(fetchUsers)
</script>

<template>
  <div class="screen">
    <div class="fade-in" style="margin-bottom:32px">
      <button class="settings-back" @click="router.push({ name: 'settings' })" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
        Back to Settings
      </button>
      <div class="t-eyebrow" style="margin-bottom:12px;margin-top:24px">05 / 04 — User Management</div>
      <div class="settings-header-row">
        <div class="settings-header-text">
          <h1 class="t-h1">Who can do what.</h1>
          <p style="color:var(--ash);margin-top:12px;max-width:560px">The team and what they can touch. Roles cascade across all screens. Limits: 2 admins, 5 staff, unlimited viewers.</p>
        </div>
        <button class="btn btn-primary" @click="openCreate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
          Add user
        </button>
      </div>
    </div>

    <!-- Role cards -->
    <div style="margin-bottom:40px" class="fade-up">
      <div class="t-eyebrow" style="margin-bottom:16px">Roles & permissions</div>
      <div class="role-grid">
        <div v-for="r in roleSpec" :key="r.role" class="role-card">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h4 class="t-h4" style="text-transform:capitalize">{{ r.role }}</h4>
            <span class="t-num" style="font-size:22px;color:var(--ash)">
              {{ roleCounts(r.role) }}<span style="font-size:14px;color:var(--ash-2)"> / {{ ROLE_CAP[r.role] ?? '∞' }}</span>
            </span>
          </div>
          <ul class="role-perms">
            <li v-for="p in r.perms" :key="p">{{ p }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-center"><div class="smb-spinner"></div></div>

    <!-- Users table -->
    <template v-else>
      <div class="t-eyebrow" style="margin-bottom:16px">Team — {{ users.length }} member{{ users.length !== 1 ? 's' : '' }}</div>
      <div class="settings-table fade-up delay-2">
        <div class="st-row st-head">
          <div class="st-cell" style="flex:1 1 0">Name</div>
          <div class="st-cell" style="flex:0 0 110px">Role</div>
          <div class="st-cell col-hide-narrow" style="flex:0 0 110px;text-align:center">Status</div>
          <div class="st-cell st-actions">Actions</div>
        </div>
        <div v-if="users.length === 0" class="st-row">
          <div class="st-cell" style="flex:1;color:var(--ash);padding:40px 0">No users found.</div>
        </div>
        <div v-for="u in users" :key="u.id" class="st-row">
          <div class="st-cell" data-label="Name" style="flex:1 1 0;display:flex;align-items:center;gap:12px">
            <div class="user-avatar" :style="{ background: avatarColor(u.id) }">{{ initials(u.full_name) }}</div>
            <div>
              <div style="font-weight:500">{{ u.full_name ?? '—' }}</div>
              <div style="color:var(--ash);font-size:12px">{{ u.email }}</div>
            </div>
          </div>
          <div class="st-cell" data-label="Role" style="flex:0 0 110px">
            <span class="pill pill-role">{{ roleLabels[u.role] ?? u.role }}</span>
          </div>
          <div class="st-cell col-hide-narrow" data-label="Status" style="flex:0 0 110px;text-align:center">
            <span :class="['pill', u.is_active ? 'pill-on' : 'pill-off']">{{ u.is_active ? 'Active' : 'Inactive' }}</span>
          </div>
          <div class="st-cell st-actions">
            <select
              :value="u.role"
              @change="changeRole(u, ($event.target as HTMLSelectElement).value as UserRole)"
              style="font-family:var(--font-mono);font-size:11px;padding:4px 8px;border:1px solid var(--hair);background:var(--paper);color:var(--ink);cursor:pointer"
            >
              <option value="admin" :disabled="roleOptionDisabled('admin', u.role)">Admin{{ roleOptionDisabled('admin', u.role) ? ' · full' : '' }}</option>
              <option value="staff" :disabled="roleOptionDisabled('staff', u.role)">Staff{{ roleOptionDisabled('staff', u.role) ? ' · full' : '' }}</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
        </div>
      </div>
    </template>

    <!-- Create user modal -->
    <teleport to="body">
      <div v-if="showCreate" class="smb-modal-overlay" @click.self="showCreate = false">
        <div class="smb-modal">
          <div class="smb-modal-head">
            <h3 class="t-h3">Add user</h3>
            <button class="smb-nav-iconbtn" @click="showCreate = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div style="display:flex;flex-direction:column;gap:14px">
              <div>
                <label class="field-label">Full name *</label>
                <input class="input" v-model="newUser.full_name" placeholder="Full name" />
              </div>
              <div>
                <label class="field-label">Email *</label>
                <input class="input" type="email" v-model="newUser.email" placeholder="name@example.com" />
              </div>
              <div>
                <label class="field-label">Temporary password *</label>
                <input class="input" type="text" v-model="newUser.password" placeholder="min 6 characters" />
                <p style="margin-top:6px;font-size:12px;color:var(--ash)">Share this with the user — they sign in with the email + password.</p>
              </div>
              <div>
                <label class="field-label">Role</label>
                <select class="input" v-model="newUser.role">
                  <option value="viewer">Viewer (unlimited)</option>
                  <option value="staff" :disabled="atStaffCap">Staff {{ atStaffCap ? '· limit reached (5)' : `(${roleCounts('staff')}/5)` }}</option>
                  <option value="admin" :disabled="atAdminCap">Admin {{ atAdminCap ? '· limit reached (2)' : `(${roleCounts('admin')}/2)` }}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="smb-modal-foot">
            <button class="btn" @click="showCreate = false">Cancel</button>
            <button class="btn btn-primary" :disabled="creating" @click="createUser">
              {{ creating ? 'Creating…' : 'Create account' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>
