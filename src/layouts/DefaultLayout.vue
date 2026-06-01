<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import NotificationBell from '@/components/notifications/NotificationBell.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const notifications = useNotificationsStore()

onMounted(() => { notifications.start() })
onBeforeUnmount(() => { notifications.stop() })

const isDark = ref(false)

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : '')
}

const navItems = [
  { key: 'dashboard',        label: 'Dashboard', code: '01', to: 'dashboard' },
  { key: 'bookings',         label: 'Bookings',  code: '02', to: 'bookings' },
  { key: 'bookings-calendar',label: 'Calendar',  code: '03', to: 'bookings-calendar' },
  { key: 'enquiries',        label: 'Enquiries', code: '04', to: 'enquiries' },
  { key: 'reports',          label: 'Reports',   code: '05', to: 'reports' },
  { key: 'treasury',         label: 'Money',     code: '06', to: 'treasury' },
  { key: 'settings',         label: 'Settings',  code: '07', to: 'settings' },
]

// The mobile bottom bar can fit ~6 items legibly. Settings is admin-only
// and rarely-used, so it gets dropped from the bottom row and surfaced as
// a gear icon in the topbar instead (see the mobile-only topbar button).
const mobileNavItems = computed(() => navItems.filter(i => i.key !== 'settings'))

const activeRoot = computed(() => {
  const name = route.name as string
  if (name === 'booking-detail' || name === 'booking-create') return 'bookings'
  if (name === 'enquiry-detail' || name === 'enquiry-create') return 'enquiries'
  if (name?.startsWith('settings') || name === 'bill-categories' || name === 'expense-categories' || name === 'bank-accounts' || name === 'users') return 'settings'
  if (name === 'bookings-calendar') return 'bookings-calendar'
  return name
})

const breadcrumb = computed(() => {
  const name = route.name as string
  const map: Record<string, string> = {
    dashboard: 'Dashboard',
    bookings: 'Bookings',
    'booking-detail': `Bookings · ${route.params.id || ''}`,
    'booking-create': 'Bookings · New',
    'bookings-calendar': 'Calendar',
    enquiries: 'Enquiries',
    'enquiry-detail': `Enquiries · ${route.params.id || ''}`,
    'enquiry-create': 'Enquiries · New',
    reports: 'Reports',
    treasury: 'Money',
    settings: 'Settings',
    'bill-categories': 'Settings · Bill Categories',
    'expense-categories': 'Settings · Expense Categories',
    'bank-accounts': 'Settings · Bank Accounts',
    users: 'Settings · Users',
  }
  return map[name] || name
})

const today = new Date()
const todayStr = today.toLocaleDateString('en-IN', {
  weekday: 'short', day: '2-digit', month: 'short'
}).toUpperCase()

const userInitials = computed(() => {
  const name = authStore.profile?.full_name || 'Admin'
  return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
})

const userName = computed(() => authStore.profile?.full_name || 'Admin')
const userRole = computed(() => authStore.role || 'admin')

async function handleSignOut() {
  await authStore.logout()
  router.push({ name: 'login' })
}

// Centralised navigation: skips no-op pushes (NavigationDuplicated), surfaces
// real failures in the console, and never lets a rejected push silently
// swallow a click. Without this, an in-flight navigation getting aborted by a
// second click would leave the sidebar feeling unresponsive.
function navTo(name: string) {
  if (route.name === name) return
  router.push({ name }).catch(err => {
    // Aborted navigations are expected (e.g. fast double-click) — don't log.
    if (err && err.name !== 'NavigationDuplicated' && err.name !== 'NavigationAborted') {
      console.warn('[nav] push failed:', err)
    }
  })
}
</script>

<template>
  <div class="smb-shell">
    <!-- Sidebar -->
    <aside class="shell-sidebar">
      <div class="sidebar-top">
        <div class="monogram" @click="router.push({ name: 'dashboard' })" style="cursor:pointer">
          <span class="monogram-mark">S</span>
          <span>SMB Hall</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="t-eyebrow" style="padding: 0 16px 12px; color: var(--ash-2)">Workspace</div>
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          :class="['nav-item', activeRoot === item.key ? 'is-active' : '']"
          @click="navTo(item.to)"
        >
          <span class="nav-code">{{ item.code }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar-foot">
        <div class="sidebar-foot-content">
          <div class="t-eyebrow" style="margin-bottom: 8px; color: var(--ash-2)">Operator</div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="avatar">{{ userInitials }}</div>
            <div style="min-width:0">
              <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">{{ userName }}</div>
              <div style="font-size:10px; color:var(--ash); font-family:var(--font-mono); text-transform:uppercase">{{ userRole }} · Online</div>
            </div>
          </div>
          <button class="sign-out reveal-line" @click="handleSignOut">Sign out →</button>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="shell-main">
      <!-- Topbar -->
      <header class="shell-topbar">
        <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
          <span class="t-mono topbar-breadcrumb" style="color:var(--ash-2)">SMB / {{ breadcrumb }}</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
          <span class="t-mono topbar-date" style="color:var(--ash)">{{ todayStr }}</span>
          <NotificationBell />
          <button class="smb-nav-iconbtn" @click="toggleDark" :title="isDark ? 'Light mode' : 'Dark mode'">
            <svg v-if="isDark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a9 9 0 1 0 9 9c-3 0-9-2-9-9z"/></svg>
          </button>
          <!-- Mobile-only Settings gear (admin only). Sidebar already has this on desktop;
               on mobile the Settings item is dropped from the bottom nav for space. -->
          <button
            v-if="authStore.role === 'admin'"
            class="smb-nav-iconbtn smb-topbar-settings"
            type="button"
            @click="navTo('settings')"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          </button>
        </div>
      </header>

      <!-- Content -->
      <div class="shell-content">
        <router-view v-slot="{ Component }">
          <!-- No mode="out-in" — interrupted leaves can strand the UI in the
               leave-to state, which is exactly the "sometimes clicking does
               nothing, reload fixes it" symptom. Concurrent enter+leave keeps
               navigation reliable even with rapid clicks. -->
          <transition name="smb-fade">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <!-- Mobile bottom nav -->
    <nav class="smb-mobile-nav">
      <div class="smb-mobile-nav-items">
        <button
          v-for="item in mobileNavItems"
          :key="item.key"
          type="button"
          :class="['smb-mobile-nav-item', activeRoot === item.key ? 'is-active' : '']"
          @click="navTo(item.to)"
        >
          <!-- Dashboard -->
          <svg v-if="item.key === 'dashboard'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <!-- Bookings -->
          <svg v-else-if="item.key === 'bookings'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
          <!-- Calendar -->
          <svg v-else-if="item.key === 'bookings-calendar'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <!-- Enquiries -->
          <svg v-else-if="item.key === 'enquiries'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <!-- Reports -->
          <svg v-else-if="item.key === 'reports'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          <!-- Money / Treasury (wallet icon) -->
          <svg v-else-if="item.key === 'treasury'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h16v6"/><path d="M21 12h-4a2 2 0 0 0 0 4h4"/></svg>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<style>
.smb-fade-enter-active, .smb-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.smb-fade-enter-from { opacity: 0; transform: translateY(8px); }
.smb-fade-leave-to  { opacity: 0; transform: translateY(-4px); }

.topbar-breadcrumb {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 480px) {
  .topbar-date { display: none; }
}
</style>
