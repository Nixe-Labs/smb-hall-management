import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types/enums'

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    component: () => import('@/layouts/AuthLayout.vue'),
    meta: { requiresGuest: true },
    children: [
      {
        path: 'login',
        name: 'login',
        component: () => import('@/pages/auth/LoginPage.vue'),
      },
    ],
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/pages/dashboard/DashboardPage.vue'),
      },
      {
        path: 'bookings',
        name: 'bookings',
        component: () => import('@/pages/bookings/BookingListPage.vue'),
      },
      {
        path: 'bookings/calendar',
        name: 'bookings-calendar',
        component: () => import('@/pages/bookings/BookingCalendarPage.vue'),
      },
      {
        path: 'bookings/new',
        name: 'booking-create',
        component: () => import('@/pages/bookings/BookingCreatePage.vue'),
        meta: { roles: ['admin', 'staff'] as UserRole[] },
      },
      {
        path: 'bookings/:id',
        name: 'booking-detail',
        component: () => import('@/pages/bookings/BookingDetailPage.vue'),
      },
      {
        path: 'bookings/:id/edit',
        name: 'booking-edit',
        component: () => import('@/pages/bookings/BookingCreatePage.vue'),
        meta: { roles: ['admin', 'staff'] as UserRole[] },
      },
      {
        path: 'enquiries',
        name: 'enquiries',
        component: () => import('@/pages/enquiries/EnquiryListPage.vue'),
      },
      {
        path: 'enquiries/new',
        name: 'enquiry-create',
        component: () => import('@/pages/enquiries/EnquiryCreatePage.vue'),
        meta: { roles: ['admin', 'staff'] as UserRole[] },
      },
      {
        path: 'enquiries/:id',
        name: 'enquiry-detail',
        component: () => import('@/pages/enquiries/EnquiryDetailPage.vue'),
      },
      {
        path: 'reports',
        name: 'reports',
        component: () => import('@/pages/reports/ReportsPage.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/pages/settings/SettingsPage.vue'),
        meta: { roles: ['admin'] as UserRole[] },
      },
      {
        path: 'settings/bill-categories',
        name: 'bill-categories',
        component: () => import('@/pages/settings/BillCategoriesPage.vue'),
        meta: { roles: ['admin'] as UserRole[] },
      },
      {
        path: 'settings/expense-categories',
        name: 'expense-categories',
        component: () => import('@/pages/settings/ExpenseCategoriesPage.vue'),
        meta: { roles: ['admin'] as UserRole[] },
      },
      {
        path: 'settings/bank-accounts',
        name: 'bank-accounts',
        component: () => import('@/pages/settings/BankAccountsPage.vue'),
        meta: { roles: ['admin'] as UserRole[] },
      },
      {
        path: 'settings/users',
        name: 'users',
        component: () => import('@/pages/settings/UserManagementPage.vue'),
        meta: { roles: ['admin'] as UserRole[] },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (authStore.loading) {
    await authStore.initialize()
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }

  const requiredRoles = to.meta.roles as UserRole[] | undefined
  if (requiredRoles && !requiredRoles.includes(authStore.role)) {
    return { name: 'dashboard' }
  }
})

export default router
