<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { BankAccount } from '@/types/database'

const router = useRouter()
const toast = useToast()

const accounts = ref<BankAccount[]>([])
const loading = ref(true)
const showModal = ref(false)
const editingItem = ref<Partial<BankAccount>>({})
const saving = ref(false)

const activeAccounts = computed(() => accounts.value.filter(a => a.is_active))

async function fetchAccounts() {
  loading.value = true
  const { data } = await supabase.from('bank_accounts').select('*').order('created_at')
  accounts.value = (data as BankAccount[]) ?? []
  loading.value = false
}

function openAdd() {
  editingItem.value = { name: '', account_number: '', bank_name: '', is_active: true }
  showModal.value = true
}

function openEdit(item: BankAccount) {
  editingItem.value = { ...item }
  showModal.value = true
}

async function save() {
  if (!editingItem.value.name?.trim()) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Name is required', life: 3000 })
    return
  }
  saving.value = true
  try {
    const payload = {
      name: editingItem.value.name,
      account_number: editingItem.value.account_number || null,
      bank_name: editingItem.value.bank_name || null,
      is_active: editingItem.value.is_active ?? true,
    }
    if (editingItem.value.id) {
      const { error } = await supabase.from('bank_accounts').update(payload).eq('id', editingItem.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('bank_accounts').insert(payload)
      if (error) throw error
    }
    showModal.value = false
    await fetchAccounts()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    saving.value = false
  }
}

onMounted(fetchAccounts)
</script>

<template>
  <div class="screen">
    <div class="fade-in" style="margin-bottom:32px">
      <button class="settings-back" @click="router.push({ name: 'settings' })" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
        Back to Settings
      </button>
      <div class="t-eyebrow" style="margin-bottom:12px;margin-top:24px">05 / 03 — Bank Accounts</div>
      <div class="settings-header-row">
        <div class="settings-header-text">
          <h1 class="t-h1">Where the money lives.</h1>
          <p style="color:var(--ash);margin-top:12px;max-width:560px">Deposit destinations for every booking, and the cash drawer in the office.</p>
        </div>
        <div class="settings-header-action">
          <button class="btn btn-primary" @click="openAdd" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
            Add account
          </button>
        </div>
      </div>
    </div>

    <!-- Stats bar -->
    <div style="display:flex;align-items:baseline;justify-content:space-between;border-top:1px solid var(--ink);border-bottom:1px solid var(--rule);padding:20px 0;margin-bottom:32px" class="fade-up">
      <div>
        <div class="t-mono" style="color:var(--ash);font-size:11px">TOTAL ACCOUNTS</div>
        <div class="t-num" style="font-size:48px;margin-top:4px;line-height:1">{{ activeAccounts.length }}</div>
      </div>
      <div style="text-align:right">
        <div class="t-mono" style="color:var(--ash);font-size:11px">ACTIVE</div>
        <div style="font-size:14px;margin-top:4px">{{ activeAccounts.length }} of {{ accounts.length }}</div>
      </div>
    </div>

    <div v-if="loading" class="loading-center"><div class="smb-spinner"></div></div>

    <div v-else-if="accounts.length === 0" style="text-align:center;color:var(--ash);padding:60px">
      No bank accounts added yet.
    </div>

    <div v-else class="bank-grid fade-up delay-2">
      <div
        v-for="a in accounts"
        :key="a.id"
        :class="['bank-card', !a.is_active ? 'is-retired' : '']"
      >
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="t-mono" style="color:var(--ash);font-size:11px;letter-spacing:.08em">ACCOUNT</span>
          <span v-if="!a.is_active" class="pill pill-off">Retired</span>
          <span v-else class="pill pill-on">Active</span>
        </div>
        <div style="margin-top:20px">
          <h3 class="t-h3" style="margin-bottom:4px">{{ a.name }}</h3>
          <div v-if="a.bank_name" style="color:var(--ash);font-size:13px">{{ a.bank_name }}</div>
        </div>
        <dl class="bank-meta" style="margin-top:24px">
          <div v-if="a.account_number">
            <dt>Account No.</dt>
            <dd class="t-mono">{{ a.account_number }}</dd>
          </div>
        </dl>
        <div class="bank-actions">
          <button class="st-textbtn" @click="openEdit(a)" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit details
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="smb-modal-overlay" @click.self="showModal = false">
        <div class="smb-modal">
          <div class="smb-modal-header">
            <h3 class="t-h3">{{ editingItem.id ? 'Edit' : 'Add' }} Account</h3>
            <button class="smb-nav-iconbtn" @click="showModal = false" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div class="form-stack">
              <div>
                <label class="field-label">Account Name *</label>
                <input class="input" v-model="editingItem.name" placeholder="e.g. IOB Current Account" />
              </div>
              <div>
                <label class="field-label">Bank Name</label>
                <input class="input" v-model="editingItem.bank_name" placeholder="e.g. Indian Overseas Bank" />
              </div>
              <div>
                <label class="field-label">Account Number</label>
                <input class="input" v-model="editingItem.account_number" placeholder="Account number" />
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <input type="checkbox" id="bank_active" :checked="editingItem.is_active" @change="e => editingItem.is_active = (e.target as HTMLInputElement).checked" style="width:16px;height:16px" />
                <label for="bank_active" class="field-label" style="margin-bottom:0">Active</label>
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
