<script setup lang="ts">
import { ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppHeader from './components/AppHeader.vue'

const sidebarCollapsed = ref(false)

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>

<template>
  <div class="min-h-screen flex bg-gray-50">
    <AppSidebar :collapsed="sidebarCollapsed" />
    <div class="flex-1 flex flex-col" :class="sidebarCollapsed ? 'ml-16' : 'ml-64'">
      <AppHeader @toggle-sidebar="toggleSidebar" />
      <main class="flex-1 p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
