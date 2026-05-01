<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { BillCategory } from '@/types/database'

const router = useRouter()
const toast = useToast()

const categories = ref<BillCategory[]>([])
const loading = ref(true)
const showModal = ref(false)
const editingItem = ref<Partial<BillCategory>>({})
const saving = ref(false)

const activeCount = computed(() => categories.value.filter(c => c.is_active).length)
const retiredCount = computed(() => categories.value.filter(c => !c.is_active).length)

async function fetchCategories() {
  loading.value = true
  const { data } = await supabase.from('bill_categories').select('*').order('sort_order')
  categories.value = (data as BillCategory[]) ?? []
  loading.value = false
}

function openAdd() {
  editingItem.value = { name: '', is_active: true, sort_order: categories.value.length + 1 }
  showModal.value = true
}

function openEdit(item: BillCategory) {
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
      is_active: editingItem.value.is_active ?? true,
      sort_order: editingItem.value.sort_order ?? 0,
    }
    if (editingItem.value.id) {
      const { error } = await supabase.from('bill_categories').update(payload).eq('id', editingItem.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('bill_categories').insert(payload)
      if (error) throw error
    }
    showModal.value = false
    await fetchCategories()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    saving.value = false
  }
}

async function toggleActive(item: BillCategory) {
  await supabase.from('bill_categories').update({ is_active: !item.is_active }).eq('id', item.id)
  await fetchCategories()
}

onMounted(fetchCategories)
</script>

<template>
  <div class="screen">
    <!-- Header -->
    <div class="fade-in" style="margin-bottom:32px">
      <button class="settings-back" @click="router.push({ name: 'settings' })" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
        Back to Settings
      </button>
      <div class="t-eyebrow" style="margin-bottom:12px;margin-top:24px">05 / 01 — Bill Categories</div>
      <div class="settings-header-row">
        <div class="settings-header-text">
          <h1 class="t-h1">Bill catalogue.</h1>
          <p style="color:var(--ash);margin-top:12px;max-width:560px">The line items that compose every invoice. Edit rates, retire the obsolete, add new.</p>
        </div>
        <div class="settings-header-action">
          <button class="btn btn-primary" @click="openAdd" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
            New category
          </button>
        </div>
      </div>
    </div>

    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin-bottom:32px" class="fade-up">
      <div style="background:var(--paper);padding:20px 24px">
        <div class="t-mono" style="color:var(--ash);font-size:11px">ACTIVE</div>
        <div class="t-num" style="font-size:36px;margin-top:8px">{{ activeCount }}</div>
      </div>
      <div style="background:var(--paper);padding:20px 24px">
        <div class="t-mono" style="color:var(--ash);font-size:11px">DEFAULT</div>
        <div class="t-num" style="font-size:36px;margin-top:8px">{{ categories.filter(c => c.is_default).length }}</div>
      </div>
      <div style="background:var(--paper);padding:20px 24px">
        <div class="t-mono" style="color:var(--ash);font-size:11px">RETIRED</div>
        <div class="t-num" style="font-size:36px;margin-top:8px;color:var(--ash)">{{ retiredCount }}</div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-center"><div class="smb-spinner"></div></div>

    <!-- Table -->
    <div v-else class="settings-table fade-up delay-2">
      <div class="st-row st-head">
        <div class="st-cell" style="flex:1 1 0">Item</div>
        <div class="st-cell col-hide-narrow" style="flex:0 0 80px;text-align:center">Default</div>
        <div class="st-cell" style="flex:0 0 110px;text-align:center">Status</div>
        <div class="st-cell st-actions">Actions</div>
      </div>
      <div v-if="categories.length === 0" class="st-row">
        <div class="st-cell" style="flex:1;color:var(--ash);padding:40px 0">No categories yet.</div>
      </div>
      <div v-for="item in categories" :key="item.id" class="st-row">
        <div class="st-cell" data-label="Item" style="flex:1 1 0;font-weight:500">{{ item.name }}</div>
        <div class="st-cell col-hide-narrow" data-label="Default" style="flex:0 0 80px;text-align:center">
          <span v-if="item.is_default" class="pill pill-on">Yes</span>
          <span v-else style="color:var(--ash)">—</span>
        </div>
        <div class="st-cell" data-label="Status" style="flex:0 0 110px;text-align:center">
          <button
            :class="['pill', item.is_active ? 'pill-on' : 'pill-off']"
            @click="toggleActive(item)"
            type="button"
          >{{ item.is_active ? 'Active' : 'Retired' }}</button>
        </div>
        <div class="st-cell st-actions">
          <button class="st-textbtn" @click="openEdit(item)" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="smb-modal-overlay" @click.self="showModal = false">
        <div class="smb-modal">
          <div class="smb-modal-header">
            <h3 class="t-h3">{{ editingItem.id ? 'Edit' : 'New' }} Category</h3>
            <button class="smb-nav-iconbtn" @click="showModal = false" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="smb-modal-body">
            <div class="form-stack">
              <div>
                <label class="field-label">Name *</label>
                <input class="input" v-model="editingItem.name" placeholder="Category name" />
              </div>
              <div>
                <label class="field-label">Sort Order</label>
                <input type="number" class="input" v-model.number="editingItem.sort_order" min="0" />
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <input type="checkbox" id="is_active" :checked="editingItem.is_active" @change="e => editingItem.is_active = (e.target as HTMLInputElement).checked" style="width:16px;height:16px" />
                <label for="is_active" class="field-label" style="margin-bottom:0">Active</label>
              </div>
            </div>
          </div>
          <div class="smb-modal-footer">
            <button class="btn" @click="showModal = false" type="button">Cancel</button>
            <button class="btn btn-primary" @click="save" :disabled="saving" type="button">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
