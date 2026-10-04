<script setup lang="ts">
defineProps<{ title: string, description?: string, wide?: boolean }>()
const { data: site } = await useSite()
</script>

<template>
  <div class="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
    <div class="w-full" :class="wide ? 'max-w-2xl' : 'max-w-md'">
      <header class="mb-8 space-y-3">
        <div class="flex items-center gap-3 text-xs tracking-[0.2em] text-muted uppercase">
          <img v-if="site?.logoUrl" :src="site.logoUrl" alt="" class="size-6 object-contain">
          <span>{{ site?.name ?? 'Archives' }}</span>
        </div>
        <h1 class="text-4xl font-light tracking-tight">
          {{ title }}
        </h1>
        <p v-if="description" class="text-sm text-muted">
          {{ description }}
        </p>
      </header>
      <div class="border-t border-default pt-6">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="mt-8 border-t border-default pt-4">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
