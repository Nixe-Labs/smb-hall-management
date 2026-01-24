<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const email = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!email.value || !password.value) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please enter email and password', life: 3000 })
    return
  }

  loading.value = true
  try {
    await authStore.login(email.value, password.value)
    router.push({ name: 'dashboard' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed'
    toast.add({ severity: 'error', summary: 'Login Failed', detail: message, life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="bg-white rounded-lg shadow-md p-8">
    <h2 class="text-xl font-semibold text-gray-800 mb-6">Sign In</h2>
    <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <label for="email" class="text-sm font-medium text-gray-700">Email</label>
        <InputText
          id="email"
          v-model="email"
          type="email"
          placeholder="Enter your email"
          class="w-full"
        />
      </div>
      <div class="flex flex-col gap-2">
        <label for="password" class="text-sm font-medium text-gray-700">Password</label>
        <Password
          id="password"
          v-model="password"
          placeholder="Enter your password"
          :feedback="false"
          toggle-mask
          class="w-full"
          input-class="w-full"
        />
      </div>
      <Button
        type="submit"
        label="Sign In"
        :loading="loading"
        class="w-full mt-2"
      />
    </form>
  </div>
</template>
