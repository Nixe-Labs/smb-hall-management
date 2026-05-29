<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import SlotRangePicker from '@/components/booking/SlotRangePicker.vue'
import type { DaySlot } from '@/types/enums'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const loading = ref(false)

interface RangeValue {
  function_date: string
  start_date: string
  start_slot: DaySlot
  end_date: string
  end_slot: DaySlot
}

function emptyRange(): RangeValue {
  return { function_date: '', start_date: '', start_slot: 'morning', end_date: '', end_slot: 'evening' }
}

const form = ref({
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  customer_email: '',
  source: '',
  notes: '',
})

const primary = ref<RangeValue>(emptyRange())
const alternates = ref<RangeValue[]>([])

function addAlternate() {
  alternates.value.push(emptyRange())
}
function removeAlternate(i: number) {
  alternates.value.splice(i, 1)
}

const sourceOptions = ['Phone', 'WhatsApp', 'Walk-in', 'Referral', 'Ad / Social', 'Other']

function rangeFilled(r: RangeValue): boolean {
  return Boolean(r.function_date && r.start_date && r.end_date)
}

async function handleSubmit() {
  if (!form.value.customer_name) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Customer name is needed', life: 3000 })
    return
  }
  if (!rangeFilled(primary.value)) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Primary requested date + range is needed', life: 3000 })
    return
  }
  loading.value = true
  try {
    const { data: enq, error: enqErr } = await supabase
      .from('enquiries')
      .insert({
        customer_name: form.value.customer_name,
        customer_phone: form.value.customer_phone || null,
        customer_address: form.value.customer_address || null,
        customer_email: form.value.customer_email || null,
        source: form.value.source || null,
        notes: form.value.notes || null,
        status: 'new',
        created_by: authStore.user?.id,
      })
      .select()
      .single()
    if (enqErr) throw enqErr

    const dateRows = [
      {
        enquiry_id: enq.id,
        function_date: primary.value.function_date,
        start_date: primary.value.start_date,
        start_slot: primary.value.start_slot,
        end_date: primary.value.end_date,
        end_slot: primary.value.end_slot,
        is_primary: true,
      },
      ...alternates.value
        .filter(rangeFilled)
        .map(a => ({
          enquiry_id: enq.id,
          function_date: a.function_date,
          start_date: a.start_date,
          start_slot: a.start_slot,
          end_date: a.end_date,
          end_slot: a.end_slot,
          is_primary: false,
        })),
    ]
    const { error: datesErr } = await supabase.from('enquiry_dates').insert(dateRows)
    if (datesErr) throw datesErr

    toast.add({ severity: 'success', summary: 'Saved', detail: 'Enquiry recorded', life: 3000 })
    router.push({ name: 'enquiry-detail', params: { id: enq.id } })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to save enquiry'
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="screen" style="max-width:760px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-top:24px" class="fade-in">
      <button class="smb-nav-iconbtn" @click="router.push({ name: 'enquiries' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
      </button>
      <span class="t-mono" style="color:var(--ash)">04 / ENQUIRIES / NEW</span>
    </div>

    <div style="padding-top:8px;padding-bottom:32px" class="fade-up">
      <div class="t-eyebrow" style="margin-bottom:12px">New entry</div>
      <h1 class="t-h1">Capture an enquiry.</h1>
      <p style="color:var(--ash);margin-top:12px;max-width:520px">
        Record every interested caller — even if the date is taken. If the booking falls through, this is your callback list.
      </p>
    </div>

    <form class="form-stack fade-up delay-2" @submit.prevent="handleSubmit">
      <div class="form-grid-2">
        <div>
          <label class="field-label">Customer name *</label>
          <input class="input" v-model="form.customer_name" placeholder="Full name" required />
        </div>
        <div>
          <label class="field-label">Phone</label>
          <input class="input" v-model="form.customer_phone" placeholder="+91 …" />
        </div>
      </div>
      <div class="form-grid-2">
        <div>
          <label class="field-label">Email</label>
          <input class="input" v-model="form.customer_email" placeholder="optional" />
        </div>
        <div>
          <label class="field-label">Source</label>
          <select class="input" v-model="form.source">
            <option value="">— Pick —</option>
            <option v-for="s in sourceOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>
      <div>
        <label class="field-label">Address</label>
        <textarea class="input" v-model="form.customer_address" placeholder="optional"></textarea>
      </div>

      <!-- Primary range -->
      <div style="border-top:1px solid var(--hair);padding-top:18px">
        <div class="t-eyebrow" style="margin-bottom:12px">Primary requested range</div>
        <SlotRangePicker v-model="primary" :check-availability="false" />
      </div>

      <!-- Alternate ranges -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="t-eyebrow">Alternate ranges ({{ alternates.length }})</div>
          <button type="button" class="smb-filter-pill" @click="addAlternate">+ Add alternate</button>
        </div>
        <p v-if="alternates.length === 0" style="color:var(--ash);font-size:13px;margin-bottom:0">
          Optional. Add other ranges the customer is OK with — used for matching against future cancellations.
        </p>
        <div v-for="(_, i) in alternates" :key="i" class="enq-alt-block">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div class="t-mono" style="color:var(--ash);font-size:11px">ALT #{{ i + 1 }}</div>
            <button type="button" class="smb-nav-iconbtn" @click="removeAlternate(i)" title="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          </div>
          <SlotRangePicker v-model="alternates[i]!" :check-availability="false" />
        </div>
      </div>

      <div>
        <label class="field-label">Notes</label>
        <textarea class="input" v-model="form.notes" placeholder="Anything specific — guest count, budget, special requests"></textarea>
      </div>

      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12l5 5L20 7"/></svg>
          {{ loading ? 'Saving…' : 'Save enquiry' }}
        </button>
        <button type="button" class="btn" @click="router.push({ name: 'enquiries' })">Cancel</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.enq-alt-block {
  margin-top: 18px;
  padding: 16px;
  border: 1px dashed var(--hair);
  border-radius: 6px;
  background: var(--paper-2);
}
</style>
