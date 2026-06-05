<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { AdvancePayment, BankAccount } from '@/types/database'
import type { PaymentMethod } from '@/types/enums'
import { paymentMethodLabel, paymentMethodOptions } from '@/lib/utils/payments'

const props = defineProps<{
  bookingId: string
  advances: AdvancePayment[]
  bankAccounts: BankAccount[]
  canEdit: boolean
}>()

const emit = defineEmits<{ updated: [] }>()

interface AdvanceForm {
  id?: string
  advance_number?: number
  amount?: number
  payment_date?: string
  payment_method?: PaymentMethod | null
  deposit_date?: string
  deposit_account_id?: string | null
}

const toast = useToast()
const showModal = ref(false)
const editing = ref<AdvanceForm>({})
const saving = ref(false)

// Standard methods, plus the row's current value if it's a legacy one (online)
// so editing an old advance never drops it.
const methodOptions = computed(() => paymentMethodOptions(editing.value.payment_method))
const cashAccountId = computed(() => props.bankAccounts.find(a => a.type === 'cash')?.id ?? '')

// Default cash receipts to the Cash on hand account; when switching away from
// cash, clear the auto-set value so the user explicitly picks the bank/wallet.
watch(() => editing.value.payment_method, (m) => {
  if (!showModal.value) return
  if (m === 'cash' && !editing.value.deposit_account_id) {
    editing.value.deposit_account_id = cashAccountId.value
  } else if (m !== 'cash' && editing.value.deposit_account_id === cashAccountId.value) {
    editing.value.deposit_account_id = ''
  }
})

function openAdd() {
  const next = (props.advances.length ?? 0) + 1
  if (next > 3) {
    toast.add({ severity: 'warn', summary: 'Limit', detail: 'Maximum 3 advance payments allowed', life: 3000 })
    return
  }
  editing.value = {
    advance_number: next,
    payment_method: 'cash' as PaymentMethod,
    deposit_account_id: cashAccountId.value,
  }
  showModal.value = true
}

function openEdit(adv: AdvancePayment) {
  editing.value = {
    id: adv.id,
    advance_number: adv.advance_number,
    amount: adv.amount,
    payment_method: adv.payment_method,
    payment_date: adv.payment_date ?? '',
    deposit_date: adv.deposit_date ?? '',
    deposit_account_id: adv.deposit_account_id,
  }
  showModal.value = true
}

async function save() {
  if (!editing.value.amount) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Amount is required', life: 3000 })
    return
  }
  if (!editing.value.deposit_account_id) {
    toast.add({ severity: 'warn', summary: 'Pick an account', detail: 'Choose which account the payment landed in — needed for the Treasury balance.', life: 4000 })
    return
  }
  saving.value = true
  try {
    const payload = {
      booking_id: props.bookingId,
      advance_number: editing.value.advance_number,
      amount: editing.value.amount,
      payment_date: editing.value.payment_date || null,
      payment_method: editing.value.payment_method || null,
      deposit_date: editing.value.deposit_date || null,
      deposit_account_id: editing.value.deposit_account_id || null,
    }
    if (editing.value.id) {
      const { error } = await supabase.from('advance_payments').update(payload).eq('id', editing.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('advance_payments').insert(payload)
      if (error) throw error
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Advance payment saved', life: 3000 })
    showModal.value = false
    emit('updated')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    saving.value = false
  }
}

async function remove(adv: AdvancePayment) {
  const { error } = await supabase.from('advance_payments').delete().eq('id', adv.id)
  if (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  } else {
    emit('updated')
  }
}

function accountName(id: string | null): string {
  if (!id) return '—'
  return props.bankAccounts.find(a => a.id === id)?.name ?? '—'
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:flex-end;padding:12px 0">
      <button v-if="canEdit && advances.length < 3" class="btn" style="font-size:13px;padding:8px 14px" @click="openAdd" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
        Add advance
      </button>
    </div>

    <div class="smb-table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Date</th>
            <th>Method</th>
            <th>Account</th>
            <th style="text-align:right">Amount</th>
            <th v-if="canEdit" style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="advances.length === 0">
            <td :colspan="canEdit ? 6 : 5" style="text-align:center;color:var(--ash);padding:40px">No advances recorded.</td>
          </tr>
          <tr v-for="adv in advances" :key="adv.id">
            <td style="font-family:var(--font-mono);font-size:12px">ADV-{{ String(adv.advance_number).padStart(2,'0') }}</td>
            <td>{{ adv.payment_date ? formatDate(adv.payment_date) : '—' }}</td>
            <td style="color:var(--ash)">{{ paymentMethodLabel(adv.payment_method) }}</td>
            <td style="color:var(--ash)">{{ accountName(adv.deposit_account_id) }}</td>
            <td style="text-align:right;font-family:var(--font-display);font-weight:600">{{ formatCurrency(adv.amount) }}</td>
            <td v-if="canEdit" style="text-align:right">
              <div style="display:flex;gap:6px;justify-content:flex-end">
                <button class="st-textbtn" @click="openEdit(adv)" type="button">Edit</button>
                <button class="st-textbtn st-textbtn-danger" @click="remove(adv)" type="button">Del</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="smb-modal-overlay" @click.self="showModal = false">
        <div class="smb-modal">
          <div class="smb-modal-header">
            <h3 class="t-h3">{{ editing.id ? 'Edit' : 'Add' }} Advance</h3>
            <button class="smb-nav-iconbtn" @click="showModal = false" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div class="form-stack">
              <div>
                <label class="field-label">Amount (₹) *</label>
                <input type="number" class="input" v-model.number="editing.amount" placeholder="0" min="0" />
              </div>
              <div>
                <label class="field-label">Payment Method</label>
                <select class="input" v-model="editing.payment_method">
                  <option v-for="m in methodOptions" :key="m" :value="m">{{ paymentMethodLabel(m) }}</option>
                </select>
              </div>
              <div>
                <label class="field-label">Payment Date</label>
                <input type="date" class="input" v-model="editing.payment_date" />
              </div>
              <div>
                <label class="field-label">Received in account *</label>
                <select class="input" v-model="editing.deposit_account_id">
                  <option value="">— Pick an account —</option>
                  <option v-for="a in bankAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <div style="color:var(--ash);font-size:11px;margin-top:6px">Where the money landed — drives the Treasury balance for this account.</div>
              </div>
            </div>
          </div>
          <div class="smb-modal-footer">
            <button class="btn" @click="showModal = false" type="button">Cancel</button>
            <button class="btn btn-primary" @click="save" :disabled="saving" type="button">{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
