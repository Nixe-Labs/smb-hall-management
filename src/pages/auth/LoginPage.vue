<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid credentials'
    toast.add({ severity: 'error', summary: 'Sign in failed', detail: message, life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-stage fade-in">
    <!-- Art panel -->
    <div class="login-art">
      <div>
        <div class="monogram">
          <span class="monogram-mark" style="background: var(--paper); color: var(--ink)">S</span>
          <span style="color: var(--paper)">SMB Hall</span>
        </div>
        <div class="t-mono" style="margin-top: 12px; opacity: 0.5; color: var(--paper)">Management Operating System</div>
      </div>
      <div>
        <div class="login-art-num">SMB</div>
        <div class="t-mono" style="opacity: 0.5; color: var(--paper); margin-top: 8px">Est. 1996 · Tirunelveli</div>
        <div style="font-size: 16px; margin-top: 32px; max-width: 380px; line-height: 1.55; opacity: 0.85; color: var(--paper)">
          Every booking, advance and balance — in one editorial-clean ledger.
        </div>
      </div>
      <div class="t-mono" style="opacity: 0.4; color: var(--paper)">© 2026 · NIXE LABS</div>
    </div>

    <!-- Form -->
    <div class="login-form-wrap">
      <div>
        <div class="t-eyebrow" style="margin-bottom: 12px">Sign in · Step 01 of 01</div>
        <h1 class="t-h1" style="margin-bottom: 16px">Welcome back.</h1>
        <p style="color: var(--ash); margin-bottom: 32px">Use your SMB Hall credentials to continue.</p>

        <form class="form-stack" @submit.prevent="handleLogin">
          <div>
            <label class="field-label">Email</label>
            <input
              class="input"
              type="email"
              v-model="email"
              placeholder="you@smbhall.in"
              required
              autocomplete="email"
            />
          </div>
          <div>
            <label class="field-label">Password</label>
            <input
              class="input"
              type="password"
              v-model="password"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="loading"
            style="justify-content: center; border-radius: 0; padding: 14px 18px; width: 100%"
          >
            <span v-if="loading">Signing in…</span>
            <span v-else>Sign in →</span>
          </button>
        </form>

        <div style="margin-top: 24px; font-size: 12px; color: var(--ash)">
          Trouble signing in? <span class="reveal-line" style="cursor: pointer; color: var(--ink)">Contact your admin</span>
        </div>
      </div>
    </div>
  </div>
</template>
