<script setup lang="ts">
// Section de page : filet fin et étiquette en capitales espacées
defineProps<{ title?: string }>()
</script>

<template>
  <section class="border-t border-default pt-5">
    <div v-if="title || $slots.actions" class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 v-if="title" class="text-xs tracking-[0.2em] text-muted uppercase">
        {{ title }}
      </h2>
      <div v-if="$slots.actions" class="flex flex-wrap gap-2">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>
