<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const settingsItems = [
  { label: 'Bill Categories', description: 'Manage bill item categories (GST, Cleaning, EB, etc.)', icon: 'pi pi-list', route: 'bill-categories' },
  { label: 'Expense Categories', description: 'Manage expense categories (Ladies cleaning, Tractor, etc.)', icon: 'pi pi-wallet', route: 'expense-categories' },
  { label: 'Bank Accounts', description: 'Manage deposit accounts (SMB AC, Niranjana AC, etc.)', icon: 'pi pi-building-columns', route: 'bank-accounts' },
  { label: 'User Management', description: 'Manage users and their roles', icon: 'pi pi-users', route: 'users' },
]
</script>

<template>
  <div>
    <h1 class="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Settings</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
      <div
        v-for="item in settingsItems"
        :key="item.route"
        class="bg-white rounded-lg shadow p-4 md:p-6 cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push({ name: item.route })"
      >
        <div class="flex items-start gap-3 md:gap-4">
          <i :class="item.icon" class="text-xl md:text-2xl text-blue-600 mt-1"></i>
          <div>
            <h3 class="text-base md:text-lg font-semibold text-gray-800">{{ item.label }}</h3>
            <p class="text-xs md:text-sm text-gray-500 mt-1">{{ item.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
