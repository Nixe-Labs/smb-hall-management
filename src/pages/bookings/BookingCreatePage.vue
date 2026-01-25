<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DatePicker from 'primevue/datepicker'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import { toISODate } from '@/lib/utils/dates'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const loading = ref(false)
const form = ref({
  function_date: null as Date | null,
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  rent: 0,
  notes: '',
})

async function handleSubmit() {
  if (!form.value.function_date || !form.value.customer_name || !form.value.rent) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please fill in date, customer name, and rent', life: 3000 })
    return
  }

  // Check availability
  const dateStr = toISODate(form.value.function_date)
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('function_date', dateStr)
    .neq('status', 'cancelled')
    .limit(1)

  if (existing && existing.length > 0) {
    toast.add({ severity: 'warn', summary: 'Date Unavailable', detail: 'A booking already exists for this date', life: 5000 })
    return
  }

  loading.value = true
  try {
    const { error } = await supabase.from('bookings').insert({
      function_date: dateStr,
      customer_name: form.value.customer_name,
      customer_phone: form.value.customer_phone || null,
      customer_address: form.value.customer_address || null,
      rent: form.value.rent,
      notes: form.value.notes || null,
      status: 'upcoming',
      created_by: authStore.user?.id,
    })

    if (error) throw error

    toast.add({ severity: 'success', summary: 'Success', detail: 'Booking created successfully', life: 3000 })
    router.push({ name: 'bookings' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create booking'
    toast.add({ severity: 'error', summary: 'Error', detail: message, life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <div class="flex items-center gap-3 mb-6">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="text-3xl font-bold text-[#1F2937]">New Booking</h1>
    </div>

    <div class="card p-6">
      <form @submit.prevent="handleSubmit" class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#1F2937]">Function Date *</label>
          <DatePicker
            v-model="form.function_date"
            date-format="dd/mm/yy"
            show-icon
            class="w-full"
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#1F2937]">Customer Name *</label>
          <InputText v-model="form.customer_name" placeholder="Enter customer name" class="w-full" />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#1F2937]">Phone</label>
          <InputText v-model="form.customer_phone" placeholder="Enter phone number" class="w-full" />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#1F2937]">Address</label>
          <Textarea v-model="form.customer_address" placeholder="Enter address" rows="2" class="w-full" />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#1F2937]">Rent Amount *</label>
          <InputNumber
            v-model="form.rent"
            mode="currency"
            currency="INR"
            locale="en-IN"
            class="w-full"
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[#1F2937]">Notes</label>
          <Textarea v-model="form.notes" placeholder="Any additional notes" rows="3" class="w-full" />
        </div>

        <div class="flex gap-3 mt-2">
          <Button type="submit" label="Create Booking" icon="pi pi-check" :loading="loading" />
          <Button type="button" label="Cancel" severity="secondary" @click="router.back()" />
        </div>
      </form>
    </div>
  </div>
</template>
