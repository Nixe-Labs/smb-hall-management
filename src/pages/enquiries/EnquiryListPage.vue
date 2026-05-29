<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { formatDate, toISODate } from '@/lib/utils/dates'
import { formatRange } from '@/lib/utils/slots'
import type { Enquiry, EnquiryDate } from '@/types/database'
import type { EnquiryStatus } from '@/types/enums'

const router = useRouter()

interface EnquiryRow extends Enquiry {
  primary: EnquiryDate | null
  alt_count: number
}

const enquiries = ref<EnquiryRow[]>([])
const loading = ref(true)
const search = ref('')
const statusFilter = ref<EnquiryStatus | 'all'>('new')

const statusLabels: Record<string, string> = {
  all: 'All', new: 'New', converted: 'Converted', lost: 'Lost',
}

const filtered = computed(() => {
  return enquiries.value.filter(e => {
    if (statusFilter.value !== 'all' && e.status !== statusFilter.value) return false
    if (search.value) {
      const q = search.value.toLowerCase()
      const inName = e.customer_name.toLowerCase().includes(q)
      const inPhone = (e.customer_phone ?? '').toLowerCase().includes(q)
      if (!inName && !inPhone) return false
    }
    return true
  })
})

async function fetchEnquiries() {
  loading.value = true
  try {
    const { data: enquiryData } = await supabase
      .from('enquiries')
      .select('*')
      .order('created_at', { ascending: false })

    const list = (enquiryData as Enquiry[]) ?? []
    if (list.length === 0) {
      enquiries.value = []
      return
    }

    const ids = list.map(e => e.id)
    const { data: dateData } = await supabase
      .from('enquiry_dates')
      .select('*')
      .in('enquiry_id', ids)

    const dates = (dateData as EnquiryDate[]) ?? []
    const byEnq: Record<string, EnquiryDate[]> = {}
    for (const d of dates) {
      if (!byEnq[d.enquiry_id]) byEnq[d.enquiry_id] = []
      byEnq[d.enquiry_id]!.push(d)
    }

    enquiries.value = list.map(e => {
      const ds = byEnq[e.id] ?? []
      const primary = ds.find(d => d.is_primary) ?? ds[0] ?? null
      return {
        ...e,
        primary,
        alt_count: Math.max(ds.length - 1, 0),
      }
    })
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  const headers = ['Customer', 'Phone', 'Email', 'Address', 'Function Date', 'Hall Use Range', 'Alt count', 'Status', 'Source', 'Notes', 'Created']
  const rows = filtered.value.map(e => [
    e.customer_name,
    e.customer_phone ?? '',
    e.customer_email ?? '',
    (e.customer_address ?? '').replace(/\n/g, ' '),
    e.primary?.function_date ?? '',
    e.primary ? formatRange(e.primary) : '',
    e.alt_count,
    e.status,
    e.source ?? '',
    (e.notes ?? '').replace(/\n/g, ' '),
    e.created_at,
  ])
  const escape = (v: unknown) => {
    let s = String(v ?? '')
    // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `smb-enquiries-${toISODate(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(fetchEnquiries)
</script>

<template>
  <div class="screen">
    <!-- Header -->
    <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:32px;padding-top:32px;flex-wrap:wrap;gap:16px" class="fade-in">
      <div>
        <div class="t-eyebrow" style="margin-bottom:12px">04 / Enquiries · {{ filtered.length }} of {{ enquiries.length }}</div>
        <h1 class="t-h1">Enquiries.</h1>
        <p style="color:var(--ash);margin-top:8px;max-width:520px;font-size:14px">
          Every interested caller. If a date opens up, this is your callback list.
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" @click="exportCSV" :disabled="filtered.length === 0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Export CSV
        </button>
        <button class="btn btn-primary" @click="router.push({ name: 'enquiry-create' })">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
          New enquiry
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="smb-table-toolbar fade-up">
      <div class="smb-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input v-model="search" placeholder="Search name or phone…" />
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button
          v-for="s in (['all', 'new', 'converted', 'lost'] as const)"
          :key="s"
          :class="['smb-filter-pill', statusFilter === s ? 'is-active' : '']"
          @click="statusFilter = s"
        >{{ statusLabels[s] }}</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-center"><div class="smb-spinner"></div></div>

    <!-- Table -->
    <div v-else class="smb-table-wrap fade-up delay-2">
      <table class="table table-cards">
        <thead>
          <tr>
            <th>Customer</th>
            <th style="width:160px">Phone</th>
            <th style="width:130px">Function date</th>
            <th>Hall use</th>
            <th style="width:90px">Alt</th>
            <th style="width:130px">Source</th>
            <th style="width:130px">Status</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filtered.length === 0">
            <td colspan="8" style="text-align:center;color:var(--ash);padding:60px">No enquiries match.</td>
          </tr>
          <tr
            v-for="e in filtered"
            :key="e.id"
            @click="router.push({ name: 'enquiry-detail', params: { id: e.id } })"
          >
            <td data-label="Customer" style="font-weight:600">{{ e.customer_name }}</td>
            <td data-label="Phone" style="font-family:var(--font-mono);font-size:12px;color:var(--ash)">{{ e.customer_phone || '—' }}</td>
            <td data-label="Function date">{{ e.primary ? formatDate(e.primary.function_date) : '—' }}</td>
            <td data-label="Hall use" style="font-family:var(--font-mono);font-size:11px;color:var(--ash)">{{ e.primary ? formatRange(e.primary) : '—' }}</td>
            <td data-label="Alt" style="color:var(--ash);font-size:12px">{{ e.alt_count > 0 ? `+${e.alt_count}` : '—' }}</td>
            <td data-label="Source" style="color:var(--ash);font-size:12px">{{ e.source || '—' }}</td>
            <td data-label="Status">
              <span :class="['enq-tag', 'enq-' + e.status]">{{ statusLabels[e.status] }}</span>
            </td>
            <td>
              <span class="row-arrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
