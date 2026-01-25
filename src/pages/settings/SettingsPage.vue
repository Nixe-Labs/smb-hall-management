<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const settingsItems = [
  { label: 'Bill Categories', description: 'Manage bill item categories (GST, Cleaning, EB, etc.)', icon: 'pi pi-list', route: 'bill-categories', color: 'bg-[#10B981]' },
  { label: 'Expense Categories', description: 'Manage expense categories (Ladies cleaning, Tractor, etc.)', icon: 'pi pi-wallet', route: 'expense-categories', color: 'bg-blue-500' },
  { label: 'Bank Accounts', description: 'Manage deposit accounts (SMB AC, Niranjana AC, etc.)', icon: 'pi pi-building-columns', route: 'bank-accounts', color: 'bg-purple-500' },
  { label: 'User Management', description: 'Manage users and their roles', icon: 'pi pi-users', route: 'users', color: 'bg-orange-500' },
]
</script>

<template>
  <div class="text-[#1F2937]">
    <h1 class="text-3xl font-bold text-[#1F2937] mb-6">Settings</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div
        v-for="item in settingsItems"
        :key="item.route"
        class="card p-6 cursor-pointer hover:shadow-lg transition-all"
        @click="router.push({ name: item.route })"
      >
        <div class="flex items-start gap-4">
          <div :class="[item.color, 'w-12 h-12 rounded-lg flex items-center justify-center']">
            <i :class="[item.icon, 'text-white text-xl']"></i>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-[#1F2937] mb-1">{{ item.label }}</h3>
            <p class="text-sm text-[#6B7280]">{{ item.description }}</p>
          </div>
          <i class="pi pi-chevron-right text-[#9CA3AF]"></i>
        </div>
      </div>
    </div>
  </div>
</template>
