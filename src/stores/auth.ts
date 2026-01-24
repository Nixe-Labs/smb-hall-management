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

  async function initialize() {
    loading.value = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      user.value = session?.user ?? null
      if (user.value) {
        await fetchProfile()
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        user.value = session?.user ?? null
        if (user.value) {
          await fetchProfile()
        } else {
          profile.value = null
        }
      })
    } finally {
      loading.value = false
    }
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
