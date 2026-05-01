<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const loading = ref(false)
const form = ref({
  function_date: '',
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  rent: '',
  notes: '',
})

async function handleSubmit() {
  if (!form.value.function_date || !form.value.customer_name || !form.value.rent) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please fill in date, customer name, and rent', life: 3000 })
    return
  }

  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('function_date', form.value.function_date)
    .neq('status', 'cancelled')
    .limit(1)

  if (existing && existing.length > 0) {
    toast.add({ severity: 'warn', summary: 'Date Unavailable', detail: 'A booking already exists for this date', life: 5000 })
    return
  }

  loading.value = true
  try {
    const { error } = await supabase.from('bookings').insert({
      function_date: form.value.function_date,
      customer_name: form.value.customer_name,
      customer_phone: form.value.customer_phone || null,
      customer_address: form.value.customer_address || null,
      rent: Number(form.value.rent),
      notes: form.value.notes || null,
      status: 'upcoming',
      created_by: authStore.user?.id,
    })
    if (error) throw error
    toast.add({ severity: 'success', summary: 'Created', detail: 'Booking created successfully', life: 3000 })
    router.push({ name: 'bookings' })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to create booking'
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="screen" style="max-width:760px">
    <!-- Back -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-top:24px" class="fade-in">
      <button class="smb-nav-iconbtn" @click="router.push({ name: 'bookings' })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
      </button>
      <span class="t-mono" style="color:var(--ash)">02 / BOOKINGS / NEW</span>
    </div>

    <div style="padding-top:8px;padding-bottom:32px" class="fade-up">
      <div class="t-eyebrow" style="margin-bottom:12px">New entry</div>
      <h1 class="t-h1">Book a date.</h1>
      <p style="color:var(--ash);margin-top:12px;max-width:520px">
        Confirm a function with the customer's details. Bills and advances can be added once the booking is created.
      </p>
    </div>

    <form class="form-stack fade-up delay-2" @submit.prevent="handleSubmit">
      <div>
        <label class="field-label">Function Date *</label>
        <input type="date" class="input" v-model="form.function_date" required />
      </div>
      <div class="form-grid-2">
        <div>
          <label class="field-label">Customer Name *</label>
          <input class="input" v-model="form.customer_name" placeholder="Full name" required />
        </div>
        <div>
          <label class="field-label">Phone</label>
          <input class="input" v-model="form.customer_phone" placeholder="+91 …" />
        </div>
      </div>
      <div>
        <label class="field-label">Address</label>
        <textarea class="input" v-model="form.customer_address" placeholder="Full address"></textarea>
      </div>
      <div>
        <label class="field-label">Rent Amount (₹) *</label>
        <input type="number" class="input" v-model="form.rent" placeholder="0" min="0" required />
      </div>
      <div>
        <label class="field-label">Notes</label>
        <textarea class="input" v-model="form.notes" placeholder="Anything specific to this function"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12l5 5L20 7"/></svg>
          {{ loading ? 'Creating…' : 'Create booking' }}
        </button>
        <button type="button" class="btn" @click="router.push({ name: 'bookings' })">Cancel</button>
      </div>
    </form>
  </div>
</template>
