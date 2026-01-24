import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export function usePermissions() {
  const authStore = useAuthStore()

  const canEdit = computed(() => authStore.isStaffOrAdmin)
  const canDelete = computed(() => authStore.isAdmin)
  const canManageSettings = computed(() => authStore.isAdmin)
  const canManageUsers = computed(() => authStore.isAdmin)

  return { canEdit, canDelete, canManageSettings, canManageUsers }
}
