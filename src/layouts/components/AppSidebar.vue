<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  collapsed: boolean
  mobileOpen: boolean
}>()

const emit = defineEmits<{
  'close-mobile': []
}>()

const route = useRoute()
const authStore = useAuthStore()

interface NavItem {
  label: string
  icon: string
  to: string
  roles?: string[]
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { label: 'Dashboard', icon: 'pi pi-home', to: '/dashboard' },
    { label: 'Bookings', icon: 'pi pi-calendar', to: '/bookings' },
    { label: 'Calendar', icon: 'pi pi-calendar-plus', to: '/bookings/calendar' },
    { label: 'Reports', icon: 'pi pi-chart-bar', to: '/reports' },
  ]

  if (authStore.isAdmin) {
    items.push({ label: 'Settings', icon: 'pi pi-cog', to: '/settings', roles: ['admin'] })
  }

  return items
})

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

function handleNavClick() {
  emit('close-mobile')
}
</script>

<template>
  <!-- Mobile backdrop -->
  <div
    v-if="mobileOpen"
    class="fixed inset-0 bg-black/50 z-30 md:hidden"
    @click="emit('close-mobile')"
  ></div>

  <aside
    class="fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40 transition-all duration-300"
    :class="[
      collapsed ? 'md:w-16' : 'md:w-64',
      mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      'w-64'
    ]"
  >
    <div class="p-4 border-b border-gray-200 flex items-center justify-between">
      <h2 v-if="!collapsed || mobileOpen" class="text-lg font-bold text-gray-800 truncate">SMB Hall</h2>
      <h2 v-if="collapsed && !mobileOpen" class="text-lg font-bold text-gray-800 text-center hidden md:block">S</h2>
      <button class="md:hidden text-gray-500 hover:text-gray-800" @click="emit('close-mobile')">
        <i class="pi pi-times text-lg"></i>
      </button>
    </div>
    <nav class="mt-4">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        :class="{ 'bg-blue-50 text-blue-700 border-r-2 border-blue-700': isActive(item.to) }"
        @click="handleNavClick"
      >
        <i :class="item.icon" class="text-lg"></i>
        <span v-if="!collapsed || mobileOpen" class="truncate">{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>
