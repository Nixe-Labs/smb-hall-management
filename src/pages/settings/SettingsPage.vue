<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const items = [
  { label: 'Bill Categories',    desc: 'Manage bill items — Hall Rent, GST, Cleaning, EB charges.', code: '01', route: 'bill-categories' },
  { label: 'Expense Categories', desc: 'Track operational costs — Cleaning, Decoration, Watchman.',  code: '02', route: 'expense-categories' },
  { label: 'Bank Accounts',      desc: 'Deposit destinations — IOB, Canara, Petty Cash.',           code: '03', route: 'bank-accounts' },
  { label: 'User Management',    desc: 'Roles and permissions — Admin, Staff, Viewer.',             code: '04', route: 'users' },
]
</script>

<template>
  <div class="screen">
    <div class="fade-in" style="padding-top:32px;margin-bottom:24px">
      <div class="t-eyebrow" style="margin-bottom:12px">05 / Settings</div>
      <h1 class="t-h1">Configuration.</h1>
      <p style="color:var(--ash);margin-top:12px;max-width:520px">
        Catalogues, accounts and people. The plumbing behind every booking.
      </p>
    </div>

    <div class="set-grid fade-up delay-2">
      <button
        v-for="it in items"
        :key="it.route"
        class="set-cell"
        @click="router.push({ name: it.route })"
        type="button"
      >
        <div class="set-cell-top">
          <span class="t-mono" style="color:var(--ash)">{{ it.code }}</span>
          <span class="set-cell-cta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </div>
        <div style="margin-top:16px">
          <h3 class="t-h3" style="display:inline-block">{{ it.label }}</h3>
          <p style="color:var(--ash);margin-top:8px;font-size:14px;line-height:1.5">{{ it.desc }}</p>
        </div>
        <span class="set-cell-action">
          Open
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </span>
      </button>
    </div>
  </div>
</template>
