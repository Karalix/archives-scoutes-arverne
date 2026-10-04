<script setup lang="ts">
defineProps<{
  year: { startYear: number, label: string, count: number, locked: boolean, coverUrl: string | null }
}>()
</script>

<template>
  <NuxtLink
    :to="`/annee/${year.startYear}`"
    class="group block"
    :aria-label="`${year.label}, ${year.count} documents${year.locked ? ', accès réservé' : ''}`"
  >
    <div class="relative aspect-[4/3] bg-accented overflow-hidden">
      <img
        v-if="year.coverUrl"
        :src="year.coverUrl"
        alt=""
        loading="lazy"
        class="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.015]"
      >
      <div v-else class="absolute inset-0 flex items-end p-5">
        <span class="label">{{ year.locked ? 'Accès réservé' : 'Sans visuel' }}</span>
      </div>
    </div>
    <div class="pt-4 flex items-baseline justify-between gap-4 border-b border-transparent group-hover:border-(--ui-border-accented) pb-2 transition-colors">
      <span class="text-2xl sm:text-3xl font-light tracking-tight tabular-nums">{{ year.label.replace('-', '–') }}</span>
      <span class="label shrink-0">{{ year.count }} {{ year.count > 1 ? 'documents' : 'document' }}</span>
    </div>
  </NuxtLink>
</template>
