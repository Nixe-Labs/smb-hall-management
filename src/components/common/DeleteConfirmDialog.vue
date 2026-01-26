<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const props = withDefaults(defineProps<{
  visible: boolean
  itemName?: string
  loading?: boolean
  confirmWord?: string
  title?: string
  message?: string
  buttonLabel?: string
  severity?: 'danger' | 'warn'
}>(), {
  confirmWord: 'DELETE',
  title: 'Confirm Deletion',
  buttonLabel: 'Delete Permanently',
  severity: 'danger'
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm'): void
}>()

const confirmText = ref('')
const canConfirm = computed(() => confirmText.value === props.confirmWord)

// Reset input when dialog opens/closes
watch(() => props.visible, (newVal) => {
  if (!newVal) {
    confirmText.value = ''
  }
})

function handleConfirm() {
  if (canConfirm.value) {
    emit('confirm')
  }
}

const iconBgClass = computed(() => props.severity === 'warn' ? 'bg-orange-100' : 'bg-red-100')
const iconTextClass = computed(() => props.severity === 'warn' ? 'text-orange-500' : 'text-red-500')
const badgeBgClass = computed(() => props.severity === 'warn' ? 'bg-orange-50' : 'bg-red-50')
const badgeTextClass = computed(() => props.severity === 'warn' ? 'text-orange-600' : 'text-red-600')

function handleClose() {
  confirmText.value = ''
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="handleClose"
    modal
    :header="title"
    :style="{ width: '400px' }"
    :closable="!loading"
    :close-on-escape="!loading"
  >
    <div class="space-y-4">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" :class="iconBgClass">
          <i class="pi pi-exclamation-triangle text-lg" :class="iconTextClass"></i>
        </div>
        <div>
          <p class="text-[#1F2937] font-medium mb-1">This action cannot be undone</p>
          <p v-if="message" class="text-sm text-[#6B7280]">{{ message }}</p>
          <p v-else class="text-sm text-[#6B7280]">
            You are about to permanently delete
            <strong class="text-[#1F2937]">{{ itemName || 'this item' }}</strong>.
          </p>
        </div>
      </div>
      <div class="pt-2">
        <label class="text-sm font-medium text-[#1F2937] block mb-2">
          Type <span class="font-mono px-1.5 py-0.5 rounded text-xs" :class="[badgeBgClass, badgeTextClass]">{{ confirmWord }}</span> to confirm
        </label>
        <InputText
          v-model="confirmText"
          :placeholder="`Type ${confirmWord}`"
          class="w-full"
          :disabled="loading"
          @keyup.enter="canConfirm && handleConfirm()"
        />
      </div>
    </div>
    <template #footer>
      <div class="flex gap-2 justify-end">
        <Button
          label="Go Back"
          severity="secondary"
          @click="handleClose"
          :disabled="loading"
        />
        <Button
          :label="buttonLabel"
          :severity="severity"
          :icon="severity === 'warn' ? 'pi pi-times' : 'pi pi-trash'"
          :disabled="!canConfirm || loading"
          :loading="loading"
          @click="handleConfirm"
        />
      </div>
    </template>
  </Dialog>
</template>
