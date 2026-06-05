<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/composables/usePermissions'
import { useToast } from 'primevue/usetoast'
import { formatDate } from '@/lib/utils/dates'
import { formatRange } from '@/lib/utils/slots'
import { allPhones, telHref, waHref } from '@/lib/utils/phones'
import type { Enquiry, EnquiryDate } from '@/types/database'
import type { EnquiryStatus } from '@/types/enums'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { canEdit, canDelete } = usePermissions()

const enquiryId = computed(() => route.params.id as string)
const enquiry = ref<Enquiry | null>(null)
const contactPhones = computed(() => allPhones(enquiry.value?.customer_phone, enquiry.value?.customer_phones))
const eventTypeLabel = computed(() => {
  const e = enquiry.value
  if (!e?.event_type) return ''
  return e.event_type_other ? `${e.event_type} · ${e.event_type_other}` : e.event_type
})
const dates = ref<EnquiryDate[]>([])
const loading = ref(true)
const showDelete = ref(false)
const deleting = ref(false)
const updatingStatus = ref(false)
const lostReason = ref('')
const savingReason = ref(false)

const statusLabels: Record<EnquiryStatus, string> = {
  new: 'New', converted: 'Converted', lost: 'Lost',
}
const statusOrder: EnquiryStatus[] = ['new', 'converted', 'lost']

const primaryDate = computed(() => dates.value.find(d => d.is_primary) ?? dates.value[0] ?? null)
const altDates = computed(() => dates.value.filter(d => !d.is_primary))

async function fetchEnquiry() {
  loading.value = true
  try {
    const [{ data: enqData }, { data: dateData }] = await Promise.all([
      supabase.from('enquiries').select('*').eq('id', enquiryId.value).single(),
      supabase.from('enquiry_dates').select('*').eq('enquiry_id', enquiryId.value).order('is_primary', { ascending: false }),
    ])
    enquiry.value = enqData as Enquiry
    lostReason.value = enquiry.value?.lost_reason ?? ''
    dates.value = (dateData as EnquiryDate[]) ?? []
  } finally {
    loading.value = false
  }
}

async function setStatus(newStatus: EnquiryStatus) {
  if (!enquiry.value) return
  updatingStatus.value = true
  try {
    // Clear any lost reason when the enquiry is no longer lost
    const patch: { status: EnquiryStatus; lost_reason?: string | null } = { status: newStatus }
    if (newStatus !== 'lost') patch.lost_reason = null
    const { error } = await supabase.from('enquiries').update(patch).eq('id', enquiryId.value)
    if (error) throw error
    enquiry.value.status = newStatus
    if (newStatus !== 'lost') {
      enquiry.value.lost_reason = null
      lostReason.value = ''
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: `Status: ${statusLabels[newStatus]}`, life: 2500 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to update status'
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    updatingStatus.value = false
  }
}

async function saveLostReason() {
  if (!enquiry.value) return
  savingReason.value = true
  try {
    const reason = lostReason.value.trim() || null
    const { error } = await supabase.from('enquiries').update({ lost_reason: reason }).eq('id', enquiryId.value)
    if (error) throw error
    enquiry.value.lost_reason = reason
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Reason saved', life: 2500 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to save reason'
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    savingReason.value = false
  }
}

async function deleteEnquiry() {
  deleting.value = true
  try {
    // enquiry_dates cascade-delete via FK
    const { error } = await supabase.from('enquiries').delete().eq('id', enquiryId.value)
    if (error) throw error
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Enquiry removed', life: 3000 })
    router.push({ name: 'enquiries' })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to delete'
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    deleting.value = false
    showDelete.value = false
  }
}

function convertToBooking() {
  router.push({ name: 'booking-create', query: { from_enquiry: enquiryId.value } })
}

function openConvertedBooking() {
  if (enquiry.value?.converted_booking_id) {
    router.push({ name: 'booking-detail', params: { id: enquiry.value.converted_booking_id } })
  }
}

onMounted(fetchEnquiry)
</script>

<template>
  <div class="screen">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-top:24px" class="fade-in">
      <button class="smb-nav-iconbtn" @click="router.push({ name: 'enquiries' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
      </button>
      <span class="t-mono" style="color:var(--ash)">04 / ENQUIRIES / {{ enquiryId }}</span>
    </div>

    <div v-if="loading" class="loading-center"><div class="smb-spinner"></div></div>

    <template v-else-if="enquiry">
      <!-- Hero -->
      <div class="detail-hero fade-up">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:24px;flex-wrap:wrap">
          <div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
              <span :class="['enq-tag', 'enq-' + enquiry.status]">{{ statusLabels[enquiry.status] }}</span>
              <span v-if="enquiry.source" class="t-mono" style="color:var(--ash)">via {{ enquiry.source }}</span>
              <span class="t-mono" style="color:var(--ash)">Logged {{ formatDate(enquiry.created_at) }}</span>
            </div>
            <h1 class="t-h1" style="max-width:800px">{{ enquiry.customer_name }}.</h1>
            <div v-if="enquiry.notes" style="color:var(--ash);margin-top:12px;font-size:14px;max-width:680px">{{ enquiry.notes }}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button v-if="canEdit && enquiry.status !== 'converted'" class="btn btn-primary btn-sm" @click="convertToBooking">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12l5 5L20 7"/></svg>
              Convert to booking
            </button>
            <button v-if="enquiry.status === 'converted' && enquiry.converted_booking_id" class="btn btn-sm" @click="openConvertedBooking">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              Open booking
            </button>
            <button v-if="canDelete" class="btn btn-sm btn-danger" @click="showDelete = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Status changer -->
      <div class="fade-up delay-2" style="margin-top:24px;border-top:1px solid var(--hair);padding-top:18px">
        <div class="t-eyebrow" style="margin-bottom:12px">Update status</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button
            v-for="s in statusOrder"
            :key="s"
            :disabled="updatingStatus || enquiry.status === s"
            :class="['smb-filter-pill', enquiry.status === s ? 'is-active' : '']"
            @click="setStatus(s)"
          >{{ statusLabels[s] }}</button>
        </div>

        <!-- Reason, shown only when lost -->
        <div v-if="enquiry.status === 'lost'" class="fade-up" style="margin-top:16px;max-width:520px">
          <label class="field-label">Reason lost (optional)</label>
          <textarea
            class="input"
            v-model="lostReason"
            rows="2"
            placeholder="e.g. chose another hall, budget too high, date already taken"
          ></textarea>
          <div style="margin-top:8px">
            <button class="btn btn-sm" :disabled="savingReason" @click="saveLostReason">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12l5 5L20 7"/></svg>
              {{ savingReason ? 'Saving…' : 'Save reason' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Customer + Dates -->
      <div class="dash-grid fade-up delay-3" style="margin-top:24px;min-height:0">
        <div style="min-height:0">
          <div class="t-eyebrow" style="margin-bottom:8px">Customer</div>
          <h2 class="t-h2" style="margin-bottom:24px">Contact</h2>
          <div class="form-grid-2" style="gap:24px">
            <div>
              <div class="t-eyebrow" style="margin-bottom:8px">{{ contactPhones.length > 1 ? 'Phone numbers' : 'Phone' }}</div>
              <div v-if="contactPhones.length === 0" style="font-size:16px">—</div>
              <div v-for="p in contactPhones" :key="p" style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <a :href="telHref(p)!" style="font-size:16px;color:var(--ink);text-decoration:none">{{ p }}</a>
                <a :href="waHref(p)!" target="_blank" rel="noopener" title="WhatsApp" style="font-family:var(--font-mono);font-size:11px;color:#1a8a4a;text-decoration:none">wa</a>
              </div>
            </div>
            <div>
              <div class="t-eyebrow" style="margin-bottom:8px">Email</div>
              <div style="font-size:14px">{{ enquiry.customer_email || '—' }}</div>
            </div>
            <div v-if="eventTypeLabel">
              <div class="t-eyebrow" style="margin-bottom:8px">Event type</div>
              <div style="font-size:14px">{{ eventTypeLabel }}</div>
            </div>
            <div style="grid-column:1 / -1">
              <div class="t-eyebrow" style="margin-bottom:8px">Address</div>
              <div style="font-size:14px;line-height:1.5">{{ enquiry.customer_address || '—' }}</div>
            </div>
          </div>
        </div>

        <div style="min-height:0">
          <div class="t-eyebrow" style="margin-bottom:8px">Requested dates</div>
          <h2 class="t-h2" style="margin-bottom:24px">Interest</h2>
          <div v-if="primaryDate" class="enq-date-row is-primary">
            <div>
              <div class="t-eyebrow" style="margin-bottom:4px">Function date</div>
              <div style="font-weight:600">{{ formatDate(primaryDate.function_date) }}</div>
              <div class="t-mono" style="margin-top:6px;color:var(--ash);font-size:11px">Hall use · {{ formatRange(primaryDate) }}</div>
            </div>
            <span class="t-mono" style="font-size:11px;color:var(--accent-ink);align-self:start">PRIMARY</span>
          </div>
          <div v-for="d in altDates" :key="d.id" class="enq-date-row">
            <div>
              <div class="t-eyebrow" style="margin-bottom:4px">Function date</div>
              <div style="font-weight:500">{{ formatDate(d.function_date) }}</div>
              <div class="t-mono" style="margin-top:6px;color:var(--ash);font-size:11px">Hall use · {{ formatRange(d) }}</div>
            </div>
            <span class="t-mono" style="font-size:11px;color:var(--ash);align-self:start">ALT</span>
          </div>
          <div v-if="dates.length === 0" style="color:var(--ash);padding:16px 0">No dates recorded</div>
        </div>
      </div>

      <!-- Delete modal -->
      <teleport to="body">
        <div v-if="showDelete" class="smb-modal-overlay" @click.self="showDelete = false">
          <div class="smb-modal">
            <div class="smb-modal-head">
              <h3 class="t-h3">Delete enquiry?</h3>
              <button class="smb-nav-iconbtn" @click="showDelete = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
              </button>
            </div>
            <div class="smb-modal-body">
              <p style="color:var(--ash);line-height:1.6">
                Permanently remove <strong style="color:var(--ink)">{{ enquiry.customer_name }}</strong>'s enquiry. This cannot be undone.
              </p>
            </div>
            <div class="smb-modal-foot">
              <button class="btn" @click="showDelete = false">Keep</button>
              <button class="btn btn-primary btn-danger" :disabled="deleting" @click="deleteEnquiry">
                {{ deleting ? 'Deleting…' : 'Delete enquiry' }}
              </button>
            </div>
          </div>
        </div>
      </teleport>
    </template>

    <div v-else style="padding:80px 0;text-align:center;color:var(--ash)">Enquiry not found</div>
  </div>
</template>
