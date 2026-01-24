<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  collapsed: boolean
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
</script>

<template>
  <aside
    class="fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-30 transition-all duration-300"
    :class="collapsed ? 'w-16' : 'w-64'"
  >
    <div class="p-4 border-b border-gray-200">
      <h2 v-if="!collapsed" class="text-lg font-bold text-gray-800 truncate">SMB Hall</h2>
      <h2 v-else class="text-lg font-bold text-gray-800 text-center">S</h2>
    </div>
    <nav class="mt-4">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        :class="{ 'bg-blue-50 text-blue-700 border-r-2 border-blue-700': isActive(item.to) }"
      >
        <i :class="item.icon" class="text-lg"></i>
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>
