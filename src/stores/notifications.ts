import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { dueInDays } from '@/lib/utils/forecast'
import { formatDate, toISODate } from '@/lib/utils/dates'
import type { AppNotification, BookingAdvanceForecast, BookingPaymentStatus } from '@/types/database'

function fmt(n: number): string {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (Math.abs(n) >= 1000) return `₹${Math.round(n / 1000)}K`
  return `₹${Math.round(n)}`
}

type NewNotification = Omit<AppNotification, 'id' | 'created_at'>

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const readIds = ref<Set<string>>(new Set())
  const loading = ref(false)
  let channel: RealtimeChannel | null = null
  let started = false

  const unreadCount = computed(() => items.value.filter(n => !readIds.value.has(n.id)).length)
  const isRead = (id: string) => readIds.value.has(id)

  async function fetchAll() {
    const auth = useAuthStore()
    const [notifRes, readRes] = await Promise.all([
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
      auth.user
        ? supabase.from('notification_reads').select('notification_id').eq('user_id', auth.user.id)
        : Promise.resolve({ data: [] as { notification_id: string }[] }),
    ])
    items.value = (notifRes.data as AppNotification[]) ?? []
    readIds.value = new Set(((readRes.data as { notification_id: string }[]) ?? []).map(r => r.notification_id))
  }

  async function markRead(id: string) {
    const auth = useAuthStore()
    if (!auth.user || readIds.value.has(id)) return
    readIds.value = new Set(readIds.value).add(id) // optimistic
    await supabase
      .from('notification_reads')
      .upsert({ notification_id: id, user_id: auth.user.id }, { onConflict: 'notification_id,user_id', ignoreDuplicates: true })
  }

  async function markAllRead() {
    const auth = useAuthStore()
    if (!auth.user) return
    const uid = auth.user.id
    const unread = items.value.filter(n => !readIds.value.has(n.id))
    if (unread.length === 0) return
    const next = new Set(readIds.value)
    unread.forEach(n => next.add(n.id))
    readIds.value = next
    await supabase
      .from('notification_reads')
      .upsert(unread.map(n => ({ notification_id: n.id, user_id: uid })), { onConflict: 'notification_id,user_id', ignoreDuplicates: true })
  }

  // ── Client-side generation from existing data (staff/admin only) ──────
  async function generate() {
    const auth = useAuthStore()
    if (!auth.isStaffOrAdmin) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = toISODate(today)
    const in7 = new Date(today)
    in7.setDate(in7.getDate() + 7)
    const in7Str = toISODate(in7)

    const desired: NewNotification[] = []

    // 1. Advance forecast — overdue / due soon
    const { data: fcData } = await supabase
      .from('bookings_advance_forecast')
      .select('*')
      .neq('status', 'cancelled')
      .gte('function_date', todayStr)
    for (const r of (fcData as BookingAdvanceForecast[]) ?? []) {
      if (r.expected_advance_amount == null) continue
      const owed = Number(r.advance_owed)
      if (owed <= 0) continue
      const d = dueInDays(r.advance_due_date)
      if (d == null) continue
      if (d < 0) {
        desired.push({
          type: 'advance_overdue', severity: 'urgent', title: 'Advance overdue',
          body: `${fmt(owed)} owed by ${r.customer_name} · ${-d}d overdue`,
          entity_type: 'booking', entity_id: r.id, action_route: 'booking-detail',
          dedupe_key: `advance_overdue:${r.id}`,
        })
      } else if (d <= 7) {
        desired.push({
          type: 'advance_due', severity: 'warning', title: 'Advance due soon',
          body: `${fmt(owed)} from ${r.customer_name} · due in ${d}d`,
          entity_type: 'booking', entity_id: r.id, action_route: 'booking-detail',
          dedupe_key: `advance_due:${r.id}`,
        })
      }
    }

    // 2. Upcoming functions (today … +7d)
    const { data: upData } = await supabase
      .from('bookings')
      .select('id, customer_name, function_date')
      .neq('status', 'cancelled')
      .gte('function_date', todayStr)
      .lte('function_date', in7Str)
    for (const b of (upData as { id: string; customer_name: string; function_date: string }[]) ?? []) {
      desired.push({
        type: 'upcoming_function', severity: 'info', title: 'Upcoming function',
        body: `${b.customer_name} · ${formatDate(b.function_date)}`,
        entity_type: 'booking', entity_id: b.id, action_route: 'booking-detail',
        dedupe_key: `upcoming:${b.id}`,
      })
    }

    // 3. Pending balance after a past event
    const { data: psData } = await supabase
      .from('bookings_payment_status')
      .select('booking_id, function_date, pending, booking_status')
      .neq('booking_status', 'cancelled')
      .lt('function_date', todayStr)
      .gt('pending', 0)
    const psRows = (psData as BookingPaymentStatus[]) ?? []
    if (psRows.length) {
      const ids = psRows.map(p => p.booking_id)
      const { data: names } = await supabase.from('bookings').select('id, customer_name').in('id', ids)
      const nameById = new Map(((names as { id: string; customer_name: string }[]) ?? []).map(n => [n.id, n.customer_name]))
      for (const p of psRows) {
        desired.push({
          type: 'payment_pending', severity: 'warning', title: 'Payment pending',
          body: `${nameById.get(p.booking_id) ?? 'Customer'} owes ${fmt(Number(p.pending))}`,
          entity_type: 'booking', entity_id: p.booking_id, action_route: 'booking-detail',
          dedupe_key: `payment_pending:${p.booking_id}`,
        })
      }
    }

    // 4. Open enquiries with an upcoming primary date
    const { data: enqData } = await supabase
      .from('enquiries')
      .select('id, customer_name')
      .neq('status', 'converted')
      .neq('status', 'lost')
    const enqRows = (enqData as { id: string; customer_name: string }[]) ?? []
    if (enqRows.length) {
      const ids = enqRows.map(e => e.id)
      const { data: edData } = await supabase
        .from('enquiry_dates')
        .select('enquiry_id, function_date')
        .in('enquiry_id', ids)
        .eq('is_primary', true)
        .gte('function_date', todayStr)
      const nameById = new Map(enqRows.map(e => [e.id, e.customer_name]))
      for (const d of (edData as { enquiry_id: string; function_date: string }[]) ?? []) {
        desired.push({
          type: 'enquiry_open', severity: 'info', title: 'Open enquiry',
          body: `${nameById.get(d.enquiry_id) ?? 'Enquiry'} · ${formatDate(d.function_date)}`,
          entity_type: 'enquiry', entity_id: d.enquiry_id, action_route: 'enquiry-detail',
          dedupe_key: `enquiry_open:${d.enquiry_id}`,
        })
      }
    }

    if (desired.length) {
      // Upsert merging on dedupe_key: refresh title/body/severity on existing
      // rows (so "5d overdue" doesn't stay stale). `created_at` isn't in the
      // payload so the original creation time is preserved; read state lives
      // in notification_reads and is unaffected.
      await supabase.from('notifications').upsert(desired, { onConflict: 'dedupe_key' })
      await fetchAll()
    }
  }

  function subscribe() {
    if (channel) return
    channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => { void fetchAll() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, () => { void fetchAll() })
      .subscribe()
  }

  async function start() {
    if (started) return
    started = true
    loading.value = true
    try {
      await fetchAll()
      subscribe()
      void generate()
    } finally {
      loading.value = false
    }
  }

  function stop() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    started = false
  }

  return {
    items, readIds, loading, unreadCount,
    isRead, fetchAll, markRead, markAllRead, generate, start, stop,
  }
})
