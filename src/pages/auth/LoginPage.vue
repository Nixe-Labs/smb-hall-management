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
  <div class="card p-8 w-full">
    <div class="text-center mb-8">
      <div class="w-16 h-16 rounded-xl bg-[#10B981] flex items-center justify-center mx-auto mb-4">
        <span class="font-bold text-white text-2xl">S</span>
      </div>
      <h2 class="text-2xl font-bold text-[#1F2937] mb-2">Sign In</h2>
      <p class="text-[#6B7280] text-sm">Welcome back! Please sign in to continue.</p>
    </div>
    <form @submit.prevent="handleLogin" class="flex flex-col gap-5">
      <div class="flex flex-col gap-2">
        <label for="email" class="text-sm font-medium text-[#1F2937]">Email</label>
        <InputText
          id="email"
          v-model="email"
          type="email"
          placeholder="Enter your email"
          class="w-full"
        />
      </div>
      <div class="flex flex-col gap-2">
        <label for="password" class="text-sm font-medium text-[#1F2937]">Password</label>
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
