<script setup lang="ts">
import FloatingNavBar from './components/FloatingNavBar.vue'
</script>

<template>
  <div class="min-h-screen bg-[#F9FAFB] relative font-sans">
    
    <!-- Top Mask: Hides content scrolling above the navbar -->
    <div class="fixed top-0 left-0 right-0 h-6 bg-[#F9FAFB] z-40"></div>

    <!-- Floating Navigation Bar -->
    <FloatingNavBar />
    
    <!-- Main Content Area -->
    <main class="container mx-auto px-4 pb-12 pt-32 transition-all duration-300 ease-out max-w-6xl">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- Bottom Blur: Fades content at the bottom -->
    <div class="fixed bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#F9FAFB] to-transparent pointer-events-none z-40"></div>
    
  </div>
</template>

<style>
/* Page Transitions - Subtle and smooth */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
