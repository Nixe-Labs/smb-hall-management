<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from 'primevue/button'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const mobileMenuOpen = ref(false)
const navRef = ref<HTMLElement | null>(null)

const navItems = computed(() => {
  const items = [
    { label: 'Dashboard', to: '/dashboard', icon: 'pi pi-home' },
    { label: 'Bookings', to: '/bookings', icon: 'pi pi-calendar' },
    { label: 'Calendar', to: '/bookings/calendar', icon: 'pi pi-calendar-plus' },
    { label: 'Reports', to: '/reports', icon: 'pi pi-chart-bar' },
  ]

  if (authStore.isAdmin) {
    items.push({ label: 'Settings', to: '/settings', icon: 'pi pi-cog' })
  }

  return items
})

function isActive(path: string): boolean {
  // Exact match
  if (route.path === path) return true

  // For /bookings, only match if NOT on /bookings/calendar
  if (path === '/bookings') {
    return route.path.startsWith('/bookings/') && !route.path.startsWith('/bookings/calendar')
  }

  // For other routes, check if path starts with the nav item path
  return route.path.startsWith(path + '/')
}

async function handleLogout() {
  await authStore.logout()
  router.push({ name: 'login' })
}

// Click outside to close mobile menu
function handleClickOutside(event: MouseEvent) {
  if (navRef.value && !navRef.value.contains(event.target as Node)) {
    mobileMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="navRef" class="fixed top-4 md:top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
    <div class="w-full max-w-6xl relative pointer-events-auto">
      <!-- Main Navbar -->
      <nav class="glass-pill px-3 py-2 flex items-center justify-between gap-3 shadow-lg/5 transition-all duration-300">
        
        <!-- Logo -->
        <router-link to="/dashboard" class="flex items-center gap-3 pl-2 cursor-pointer hover:opacity-80 transition-opacity">
          <div class="w-9 h-9 rounded-xl bg-[#10B981] flex items-center justify-center shrink-0 shadow-sm">
            <span class="font-bold text-white text-lg">S</span>
          </div>
          <span class="font-bold text-[#1F2937] text-lg tracking-tight">SMB Hall</span>
        </router-link>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex items-center gap-1 bg-[#F3F4F6]/80 p-1.5 rounded-full border border-white/50 backdrop-blur-sm">
          <router-link
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2"
            :class="isActive(item.to) ? 'bg-white text-[#10B981] shadow-sm ring-1 ring-black/5' : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-white/60'"
          >
            <i :class="item.icon"></i>
            {{ item.label }}
          </router-link>
        </div>

        <!-- Right Side Actions -->
        <div class="flex items-center gap-2 pr-1">
          <!-- User Profile -->
          <div class="flex items-center gap-3 pl-3 md:border-l md:border-[#E5E7EB]">
            <div class="hidden lg:block text-right leading-tight">
              <div class="text-sm font-semibold text-[#1F2937]">{{ authStore.profile?.full_name || 'User' }}</div>
              <div class="text-[10px] text-[#6B7280] uppercase tracking-wider font-medium">{{ authStore.role }}</div>
            </div>
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-[#10B981] to-[#34D399] flex items-center justify-center text-white font-semibold shadow-sm ring-2 ring-white cursor-pointer transition-transform hover:scale-105">
              {{ authStore.profile?.full_name?.charAt(0) || 'U' }}
            </div>
          </div>

          <!-- Mobile Menu Toggle -->
          <button 
            class="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-[#6B7280] transition-colors" 
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <i :class="mobileMenuOpen ? 'pi pi-times' : 'pi pi-bars'" class="text-xl"></i>
          </button>

          <!-- Logout (Desktop) -->
          <Button 
            icon="pi pi-sign-out" 
            text 
            rounded 
            severity="secondary" 
            class="hidden md:flex !w-9 !h-9 !text-[#6B7280] hover:!text-red-500 hover:!bg-red-50"
            v-tooltip.bottom="'Sign Out'"
            @click="handleLogout"
          />
        </div>
      </nav>

      <!-- Mobile Menu Dropdown -->
      <transition
        enter-active-class="transition duration-200 ease-out origin-top-right"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-150 ease-in origin-top-right"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div 
          v-if="mobileMenuOpen" 
          class="absolute top-[calc(100%+0.5rem)] right-0 w-64 bg-white/90 backdrop-blur-xl border border-white/20 rounded-2xl shadow-xl flex flex-col p-2 md:hidden ring-1 ring-black/5"
        >
          <div class="px-4 py-3 border-b border-gray-100 mb-1">
            <div class="text-sm font-semibold text-[#1F2937]">{{ authStore.profile?.full_name || 'User' }}</div>
            <div class="text-xs text-[#6B7280] uppercase tracking-wider">{{ authStore.role }}</div>
          </div>
          
          <router-link
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-3"
            :class="isActive(item.to) ? 'bg-[#F0FDF4] text-[#10B981]' : 'text-[#6B7280] hover:bg-gray-50 hover:text-[#1F2937]'"
            @click="mobileMenuOpen = false"
          >
            <i :class="item.icon" class="text-lg"></i>
            {{ item.label }}
          </router-link>
          
          <div class="h-px bg-gray-100 my-1 mx-2"></div>
          
          <button 
            class="px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors flex items-center gap-3 w-full text-left"
            @click="handleLogout"
          >
            <i class="pi pi-sign-out text-lg"></i>
            Sign Out
          </button>
        </div>
      </transition>
    </div>
  </div>
</template>
