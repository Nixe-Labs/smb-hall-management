<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const sidebarOpen = ref(true)
const isDark = ref(false)

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : '')
}

const navItems = [
  { key: 'dashboard',        label: 'Dashboard', code: '01', to: 'dashboard' },
  { key: 'bookings',         label: 'Bookings',  code: '02', to: 'bookings' },
  { key: 'bookings-calendar',label: 'Calendar',  code: '03', to: 'bookings-calendar' },
  { key: 'reports',          label: 'Reports',   code: '04', to: 'reports' },
  { key: 'settings',         label: 'Settings',  code: '05', to: 'settings' },
]

const activeRoot = computed(() => {
  const name = route.name as string
  if (name === 'booking-detail' || name === 'booking-create') return 'bookings'
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
    reports: 'Reports',
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
</script>

<template>
  <div :class="['smb-shell', !sidebarOpen && 'sidebar-collapsed']">
    <!-- Sidebar -->
    <aside :class="['shell-sidebar', !sidebarOpen && 'is-collapsed']">
      <div class="sidebar-top">
        <div class="monogram" @click="router.push({ name: 'dashboard' })" style="cursor:pointer">
          <span class="monogram-mark">S</span>
          <span v-if="sidebarOpen">SMB Hall</span>
        </div>
        <button class="smb-nav-iconbtn" @click="sidebarOpen = !sidebarOpen">
          <svg v-if="sidebarOpen" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
          <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>

      <nav class="sidebar-nav">
        <div v-if="sidebarOpen" class="t-eyebrow" style="padding: 0 16px 12px; color: var(--ash-2)">Workspace</div>
        <a
          v-for="item in navItems"
          :key="item.key"
          :class="['nav-item', activeRoot === item.key ? 'is-active' : '']"
          @click="router.push({ name: item.to })"
        >
          <span class="nav-code">{{ item.code }}</span>
          <span v-if="sidebarOpen" class="nav-label">{{ item.label }}</span>
        </a>
      </nav>

      <div class="sidebar-foot">
        <div v-if="sidebarOpen" class="sidebar-foot-content">
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
        <div v-else>
          <div class="avatar" @click="handleSignOut" style="cursor:pointer">{{ userInitials }}</div>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="shell-main">
      <!-- Topbar -->
      <header class="shell-topbar">
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="t-mono" style="color:var(--ash-2)">SMB / {{ breadcrumb }}</span>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <span class="t-mono" style="color:var(--ash)">{{ todayStr }}</span>
          <button class="smb-nav-iconbtn" @click="toggleDark" :title="isDark ? 'Light mode' : 'Dark mode'">
            <svg v-if="isDark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a9 9 0 1 0 9 9c-3 0-9-2-9-9z"/></svg>
          </button>
        </div>
      </header>

      <!-- Content -->
      <div class="shell-content">
        <router-view v-slot="{ Component }">
          <transition name="smb-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <!-- Mobile bottom nav -->
    <nav class="smb-mobile-nav">
      <div class="smb-mobile-nav-items">
        <a
          v-for="item in navItems.slice(0, 5)"
          :key="item.key"
          :class="['smb-mobile-nav-item', activeRoot === item.key ? 'is-active' : '']"
          @click="router.push({ name: item.to })"
        >
          <span>{{ item.code }}</span>
          <span>{{ item.label }}</span>
        </a>
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
</style>
