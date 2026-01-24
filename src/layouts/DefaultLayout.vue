<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppHeader from './components/AppHeader.vue'

const sidebarCollapsed = ref(false)
const mobileOpen = ref(false)

function toggleSidebar() {
  // On mobile: toggle the overlay drawer
  if (window.innerWidth < 768) {
    mobileOpen.value = !mobileOpen.value
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
}

function closeMobileSidebar() {
  mobileOpen.value = false
}
</script>

<template>
  <div class="min-h-screen flex bg-gray-50">
    <AppSidebar :collapsed="sidebarCollapsed" :mobile-open="mobileOpen" @close-mobile="closeMobileSidebar" />
    <div
      class="flex-1 flex flex-col transition-all duration-300"
      :class="[
        sidebarCollapsed ? 'md:ml-16' : 'md:ml-64',
        'ml-0'
      ]"
    >
      <AppHeader @toggle-sidebar="toggleSidebar" />
      <main class="flex-1 p-4 md:p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
