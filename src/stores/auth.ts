import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'
import type { UserRole } from '@/types/enums'
import type { User } from '@supabase/supabase-js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const role = computed<UserRole>(() => profile.value?.role ?? 'viewer')
  const isAdmin = computed(() => role.value === 'admin')
  const isStaffOrAdmin = computed(() => ['admin', 'staff'].includes(role.value))

  async function fetchProfile() {
    if (!user.value) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    if (data) {
      profile.value = data as Profile
    }
  }

  // Guard so initialize() runs exactly once even though both App.vue (on
  // mount) and the router guard call it — otherwise we'd register the auth
  // listener twice.
  let initPromise: Promise<void> | null = null

  async function initialize() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        user.value = session?.user ?? null
        if (user.value) {
          // Don't let a transient profile fetch failure brick the whole
          // initialize() — log and continue. The router guard will treat the
          // user as authenticated (which they are) with viewer role until the
          // setTimeout fetch below succeeds.
          try { await fetchProfile() } catch (e) { console.warn('[auth] fetchProfile failed during init', e) }
        }

        // IMPORTANT: keep this callback synchronous. Making an async Supabase
        // call (e.g. fetchProfile → supabase.from) *inside* onAuthStateChange
        // deadlocks supabase-js's auth lock — every subsequent query then
        // hangs until a full page reload. This fires on token refresh
        // (~hourly) and tab refocus, which is why the app "sometimes" froze.
        // Workaround per Supabase docs: defer Supabase work with setTimeout.
        supabase.auth.onAuthStateChange((_event, session) => {
          user.value = session?.user ?? null
          if (session?.user) {
            setTimeout(() => { void fetchProfile() }, 0)
          } else {
            profile.value = null
          }
        })
      } catch (err) {
        // A failed init MUST be retryable — otherwise initPromise stays a
        // rejected promise forever and every router guard rethrows it, which
        // is exactly the "click does nothing" symptom we're hunting.
        console.warn('[auth] initialize failed; will retry on next call', err)
        initPromise = null
        throw err
      } finally {
        loading.value = false
      }
    })()
    return initPromise
  }

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
    profile.value = null
  }

  return {
    user,
    profile,
    loading,
    isAuthenticated,
    role,
    isAdmin,
    isStaffOrAdmin,
    initialize,
    login,
    logout,
    fetchProfile,
  }
})
