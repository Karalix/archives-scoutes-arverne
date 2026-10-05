<script setup lang="ts">
// Entrée de l'index des années : purement typographique (pas d'illustration d'année)
defineProps<{
  year: { startYear: number, label: string, count: number, locked: boolean }
}>()
</script>

<template>
  <NuxtLink
    :to="`/annee/${year.startYear}`"
    class="group flex h-full flex-col justify-between gap-10 border-t border-(--ui-border-accented) pt-4 pb-6 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 px-1"
    :aria-label="`${year.label}, ${year.count} documents${year.locked ? ', accès réservé' : ''}`"
  >
    <span class="flex items-baseline justify-between gap-4">
      <span class="label whitespace-nowrap">{{ year.count }}<span class="hidden sm:inline"> {{ year.count > 1 ? 'documents' : 'document' }}</span><span class="sm:hidden"> doc.</span></span>
      <span v-if="year.locked" class="label whitespace-nowrap inline-flex items-center gap-1.5">
        <UIcon name="i-lucide-lock" class="size-3" aria-hidden="true" /><span class="hidden sm:inline">Accès réservé</span><span class="sm:hidden">Réservé</span>
      </span>
    </span>
    <span class="text-4xl sm:text-5xl font-light tracking-[-0.03em] tabular-nums leading-none">
      {{ year.startYear }}<span class="text-dimmed transition-colors group-hover:text-default">–{{ String(year.startYear + 1).slice(2) }}</span>
    </span>
  </NuxtLink>
</template>
