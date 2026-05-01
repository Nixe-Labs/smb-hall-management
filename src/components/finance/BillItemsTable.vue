<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { formatCurrency } from '@/lib/utils/currency'
import type { BillItem, BillCategory } from '@/types/database'

const props = defineProps<{
  bookingId: string
  billItems: BillItem[]
  categories: BillCategory[]
  canEdit: boolean
  canDelete?: boolean
}>()

const emit = defineEmits<{ updated: [] }>()

const toast = useToast()
const showModal = ref(false)
const editing = ref<Partial<BillItem>>({})
const saving = ref(false)
const confirmDeleteId = ref<string | null>(null)
const deleting = ref(false)

function categoryName(id: string): string {
  return props.categories.find(c => c.id === id)?.name ?? 'Unknown'
}

function openAdd() {
  editing.value = { amount: 0, category_id: '' }
  showModal.value = true
}

function openEdit(item: BillItem) {
  editing.value = { ...item }
  showModal.value = true
}

async function save() {
  if (!editing.value.category_id || !editing.value.amount) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Category and amount are required', life: 3000 })
    return
  }
  saving.value = true
  try {
    const payload = {
      booking_id: props.bookingId,
      category_id: editing.value.category_id,
      amount: editing.value.amount,
      notes: editing.value.notes || null,
    }
    if (editing.value.id) {
      const { error } = await supabase.from('bill_items').update(payload).eq('id', editing.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('bill_items').insert(payload)
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
    const { error } = await supabase.from('bill_items').delete().eq('id', confirmDeleteId.value)
    if (error) throw error
    emit('updated')
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 })
  } finally {
    deleting.value = false
    confirmDeleteId.value = null
  }
}

const total = () => props.billItems.reduce((s, i) => s + i.amount, 0)
</script>

<template>
  <div>
    <div style="display:flex;justify-content:flex-end;padding:12px 0">
      <button v-if="canEdit" class="btn" style="font-size:13px;padding:8px 14px" @click="openAdd" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
        Add line item
      </button>
    </div>

    <div class="smb-table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Notes</th>
            <th style="text-align:right">Amount</th>
            <th v-if="canEdit || canDelete" style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="billItems.length === 0">
            <td :colspan="(canEdit || canDelete) ? 4 : 3" style="text-align:center;color:var(--ash);padding:40px">No bill items.</td>
          </tr>
          <tr v-for="item in billItems" :key="item.id">
            <td style="font-weight:600">{{ categoryName(item.category_id) }}</td>
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
        <tfoot v-if="billItems.length > 0">
          <tr>
            <td colspan="2" style="font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ash)">Total</td>
            <td style="text-align:right;font-family:var(--font-display);font-weight:700">{{ formatCurrency(total()) }}</td>
            <td v-if="canEdit || canDelete"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Add/Edit modal -->
    <Teleport to="body">
      <div v-if="showModal" class="smb-modal-overlay" @click.self="showModal = false">
        <div class="smb-modal">
          <div class="smb-modal-header">
            <h3 class="t-h3">{{ editing.id ? 'Edit' : 'Add' }} Bill Item</h3>
            <button class="smb-nav-iconbtn" @click="showModal = false" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div class="form-stack">
              <div>
                <label class="field-label">Category *</label>
                <select class="input" v-model="editing.category_id">
                  <option value="">— Select —</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div>
                <label class="field-label">Amount (₹) *</label>
                <input type="number" class="input" v-model.number="editing.amount" placeholder="0" min="0" />
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

      <!-- Delete confirm -->
      <div v-if="confirmDeleteId" class="smb-modal-overlay" @click.self="confirmDeleteId = null">
        <div class="smb-modal" style="max-width:400px">
          <div class="smb-modal-header">
            <h3 class="t-h3">Delete item?</h3>
          </div>
          <div class="smb-modal-body">
            <p style="color:var(--ash);line-height:1.6">This will permanently remove this bill item. This action cannot be undone.</p>
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
