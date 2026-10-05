<script setup lang="ts">
// Entrée de l'index des années : purement typographique (pas d'illustration d'année).
// Mobile : une ligne (année · compteur) ; écran large : l'année puis ses informations juste dessous.
defineProps<{
  year: { startYear: number, label: string, count: number, locked: boolean }
}>()
</script>

<template>
  <NuxtLink
    :to="`/annee/${year.startYear}`"
    class="group flex items-baseline justify-between gap-4 border-t border-(--ui-border-accented) px-1 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 sm:flex-col sm:items-start sm:justify-start sm:gap-3 sm:pt-5 sm:pb-8"
    :aria-label="`${year.label}, ${year.count} documents${year.locked ? ', accès réservé' : ''}`"
  >
    <span class="text-4xl sm:text-5xl font-light tracking-[-0.03em] tabular-nums leading-none">
      {{ year.startYear }}<span class="text-dimmed transition-colors group-hover:text-default">–{{ String(year.startYear + 1).slice(2) }}</span>
    </span>
    <span class="flex flex-col items-end gap-1 sm:flex-row sm:items-baseline sm:gap-4">
      <span class="label whitespace-nowrap">{{ year.count }} {{ year.count > 1 ? 'documents' : 'document' }}</span>
      <span v-if="year.locked" class="label whitespace-nowrap inline-flex items-center gap-1.5">
        <UIcon name="i-lucide-lock" class="size-3" aria-hidden="true" />Accès réservé
      </span>
    </span>
  </NuxtLink>
</template>
