<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from 'primevue/button'

const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const router = useRouter()
const authStore = useAuthStore()

async function handleLogout() {
  await authStore.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
    <div class="flex items-center gap-4">
      <Button
        icon="pi pi-bars"
        text
        rounded
        severity="secondary"
        @click="emit('toggle-sidebar')"
      />
    </div>
    <div class="flex items-center gap-4">
      <span class="text-sm text-gray-600">
        {{ authStore.profile?.full_name || authStore.profile?.email }}
      </span>
      <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 capitalize">
        {{ authStore.role }}
      </span>
      <Button
        icon="pi pi-sign-out"
        text
        rounded
        severity="secondary"
        @click="handleLogout"
      />
    </div>
  </header>
</template>
