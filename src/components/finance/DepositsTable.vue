<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { Deposit, BankAccount } from '@/types/database'

const props = defineProps<{
  bookingId: string
  deposits: Deposit[]
  bankAccounts: BankAccount[]
  canEdit: boolean
  canDelete?: boolean
}>()

const emit = defineEmits<{ updated: [] }>()

const toast = useToast()

interface DepositForm {
  id?: string
  bank_account_id?: string
  amount?: number
  deposit_date?: string
  notes?: string | null
}

const showModal = ref(false)
const editing = ref<DepositForm>({})
const saving = ref(false)
const confirmDeleteId = ref<string | null>(null)
const deleting = ref(false)

function accountName(id: string): string {
  return props.bankAccounts.find(a => a.id === id)?.name ?? 'Unknown'
}

function openAdd() {
  editing.value = { amount: 0, bank_account_id: '' }
  showModal.value = true
}

function openEdit(item: Deposit) {
  editing.value = {
    id: item.id,
    bank_account_id: item.bank_account_id,
    amount: item.amount,
    deposit_date: item.deposit_date ?? '',
    notes: item.notes,
  }
  showModal.value = true
}

async function save() {
  if (!editing.value.bank_account_id || !editing.value.amount) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Account and amount are required', life: 3000 })
    return
  }
  saving.value = true
  try {
    const payload = {
      booking_id: props.bookingId,
      bank_account_id: editing.value.bank_account_id,
      amount: editing.value.amount,
      deposit_date: editing.value.deposit_date || null,
      notes: editing.value.notes || null,
    }
    if (editing.value.id) {
      const { error } = await supabase.from('deposits').update(payload).eq('id', editing.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('deposits').insert(payload)
      if (error) throw error
    }
    showModal.value = false
    emit('updated')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!confirmDeleteId.value) return
  deleting.value = true
  try {
    const { error } = await supabase.from('deposits').delete().eq('id', confirmDeleteId.value)
    if (error) throw error
    emit('updated')
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 })
  } finally {
    deleting.value = false
    confirmDeleteId.value = null
  }
}

const total = () => props.deposits.reduce((s, i) => s + i.amount, 0)
</script>

<template>
  <div>
    <div style="display:flex;justify-content:flex-end;padding:12px 0">
      <button v-if="canEdit" class="btn" style="font-size:13px;padding:8px 14px" @click="openAdd" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
        Add deposit
      </button>
    </div>

    <div class="smb-table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Notes</th>
            <th style="text-align:right">Amount</th>
            <th v-if="canEdit || canDelete" style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="deposits.length === 0">
            <td :colspan="(canEdit || canDelete) ? 5 : 4" style="text-align:center;color:var(--ash);padding:40px">No deposits recorded.</td>
          </tr>
          <tr v-for="item in deposits" :key="item.id">
            <td>{{ item.deposit_date ? formatDate(item.deposit_date) : '—' }}</td>
            <td style="font-weight:600">{{ accountName(item.bank_account_id) }}</td>
            <td style="color:var(--ash)">{{ item.notes ?? '—' }}</td>
            <td style="text-align:right;font-family:var(--font-display);font-weight:600">{{ formatCurrency(item.amount) }}</td>
            <td v-if="canEdit || canDelete" style="text-align:right">
              <div style="display:flex;gap:6px;justify-content:flex-end">
                <button v-if="canEdit" class="st-textbtn" @click="openEdit(item)" type="button">Edit</button>
                <button v-if="canDelete" class="st-textbtn st-textbtn-danger" @click="confirmDeleteId = item.id" type="button">Del</button>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="deposits.length > 0">
          <tr>
            <td colspan="3" style="font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ash)">Total</td>
            <td style="text-align:right;font-family:var(--font-display);font-weight:700">{{ formatCurrency(total()) }}</td>
            <td v-if="canEdit || canDelete"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="smb-modal-overlay" @click.self="showModal = false">
        <div class="smb-modal">
          <div class="smb-modal-header">
            <h3 class="t-h3">{{ editing.id ? 'Edit' : 'Add' }} Deposit</h3>
            <button class="smb-nav-iconbtn" @click="showModal = false" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div class="form-stack">
              <div>
                <label class="field-label">Bank Account *</label>
                <select class="input" v-model="editing.bank_account_id">
                  <option value="">— Select account —</option>
                  <option v-for="a in bankAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </div>
              <div>
                <label class="field-label">Amount (₹) *</label>
                <input type="number" class="input" v-model.number="editing.amount" placeholder="0" min="0" />
              </div>
              <div>
                <label class="field-label">Deposit Date</label>
                <input type="date" class="input" v-model="editing.deposit_date" />
              </div>
              <div>
                <label class="field-label">Notes</label>
                <input class="input" v-model="editing.notes" placeholder="Optional notes" />
              </div>
            </div>
          </div>
          <div class="smb-modal-footer">
            <button class="btn" @click="showModal = false" type="button">Cancel</button>
            <button class="btn btn-primary" @click="save" :disabled="saving" type="button">{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
      </div>

      <div v-if="confirmDeleteId" class="smb-modal-overlay" @click.self="confirmDeleteId = null">
        <div class="smb-modal" style="max-width:400px">
          <div class="smb-modal-header">
            <h3 class="t-h3">Delete deposit?</h3>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.6">This will permanently remove this deposit. This action cannot be undone.</p>
          </div>
          <div class="smb-modal-footer">
            <button class="btn" @click="confirmDeleteId = null" type="button">Keep</button>
            <button class="btn btn-danger" @click="confirmDelete" :disabled="deleting" type="button">{{ deleting ? 'Deleting…' : 'Delete' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
