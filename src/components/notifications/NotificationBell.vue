<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useNotificationsStore } from '@/stores/notifications'
import type { AppNotification } from '@/types/database'

const router = useRouter()
const store = useNotificationsStore()
const { items, unreadCount } = storeToRefs(store)

const open = ref(false)
const wrapEl = ref<HTMLElement | null>(null)

function toggle() { open.value = !open.value }
function close() { open.value = false }

function onDocPointerDown(e: PointerEvent) {
  if (wrapEl.value && !wrapEl.value.contains(e.target as Node)) close()
}
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') close() }

watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

function onRowClick(n: AppNotification) {
  store.markRead(n.id)
  close()
  if (n.action_route) {
    if (n.entity_id) router.push({ name: n.action_route, params: { id: n.entity_id } })
    else router.push({ name: n.action_route })
  }
}
</script>

<template>
  <div ref="wrapEl" class="nb-wrap">
    <button class="smb-nav-iconbtn nb-btn" :aria-expanded="open" title="Notifications" @click="toggle">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span v-if="unreadCount > 0" class="nb-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <transition name="nb-fade">
      <div v-if="open" class="nb-panel" role="dialog">
        <div class="nb-head">
          <span class="nb-title">Notifications</span>
          <button v-if="unreadCount > 0" class="nb-markall" @click="store.markAllRead()">Mark all read</button>
        </div>

        <div v-if="items.length === 0" class="nb-empty">
          You're all caught up.
        </div>

        <div v-else class="nb-list">
          <button
            v-for="n in items"
            :key="n.id"
            class="nb-item"
            :class="{ 'is-unread': !store.isRead(n.id) }"
            @click="onRowClick(n)"
          >
            <span class="nb-dot" :class="'sev-' + n.severity"></span>
            <span class="nb-body">
              <span class="nb-item-title">{{ n.title }}</span>
              <span v-if="n.body" class="nb-item-sub">{{ n.body }}</span>
              <span class="nb-item-time">{{ timeAgo(n.created_at) }}</span>
            </span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.nb-wrap { position: relative; }
.nb-btn { position: relative; }
.nb-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--signal-red, #c0392b);
  color: #fff;
  font: 600 9px/16px var(--font-mono, monospace);
  text-align: center;
}

.nb-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 60;
  width: 340px;
  max-width: min(90vw, 360px);
  background: var(--paper, #fff);
  border: 1px solid var(--ash-2, #c8c2b8);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}
.nb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hair, #eee);
}
.nb-title {
  font: 600 11px/1 var(--font-mono, monospace);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink);
}
.nb-markall {
  appearance: none;
  background: transparent;
  border: 0;
  font: 500 11px/1 var(--font-mono, monospace);
  letter-spacing: 0.04em;
  color: var(--accent-ink, #b5651d);
  cursor: pointer;
}
.nb-markall:hover { text-decoration: underline; }

.nb-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--ash, #888);
  font-size: 13px;
}

.nb-list { max-height: 380px; overflow-y: auto; }
.nb-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 11px 14px;
  border: 0;
  border-bottom: 1px solid var(--hair, #f0f0f0);
  background: transparent;
  cursor: pointer;
  transition: background-color 110ms ease;
}
.nb-item:last-child { border-bottom: none; }
.nb-item:hover { background: var(--paper-2, rgba(0,0,0,0.03)); }
.nb-item.is-unread { background: var(--accent-soft, rgba(181,101,29,0.06)); }

.nb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  background: var(--ash, #888);
}
.nb-dot.sev-urgent { background: var(--signal-red, #c0392b); }
.nb-dot.sev-warning { background: var(--accent-ink, #b5651d); }
.nb-dot.sev-info { background: var(--ash-2, #aaa); }

.nb-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.nb-item-title { font-size: 13px; font-weight: 600; color: var(--ink); }
.nb-item-sub { font-size: 12px; color: var(--ash); line-height: 1.4; }
.nb-item-time {
  font: 500 10px/1 var(--font-mono, monospace);
  letter-spacing: 0.04em;
  color: var(--ash-2, #aaa);
  margin-top: 2px;
}

.nb-fade-enter-active, .nb-fade-leave-active {
  transition: opacity 130ms ease, transform 130ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.nb-fade-enter-from, .nb-fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 640px) {
  /* Full-width sheet under the topbar so it stays on-screen */
  .nb-panel {
    position: fixed;
    top: 56px;
    left: 10px;
    right: 10px;
    width: auto;
    max-width: none;
  }
  .nb-list { max-height: 70vh; }
}
</style>
