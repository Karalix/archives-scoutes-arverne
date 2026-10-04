<script setup lang="ts">
const props = defineProps<{
  doc: { id: string, kind: string, title: string, thumbUrl: string | null, duration: number | null, branch: string | null, place?: string, date?: string | null, yearStart?: number }
  showYear?: boolean
}>()
const { data: site } = useSite()
const branch = computed(() => site.value?.branches.find(b => b.key === props.doc.branch))
const meta = computed(() => [
  KIND_LABELS[props.doc.kind],
  props.doc.duration ? formatDuration(props.doc.duration) : '',
  branch.value?.label,
  props.showYear && props.doc.yearStart ? scoutYearLabel(props.doc.yearStart).replace('-', '–') : '',
  props.doc.place,
].filter(Boolean).join(' · '))
</script>

<template>
  <NuxtLink :to="`/document/${doc.id}`" class="group block">
    <div class="relative aspect-[4/3] bg-accented overflow-hidden">
      <img v-if="doc.thumbUrl" :src="doc.thumbUrl" alt="" loading="lazy" class="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.015]">
      <div v-else class="absolute inset-0 flex items-end p-4">
        <span class="label">{{ KIND_LABELS[doc.kind] }}</span>
      </div>
      <span v-if="doc.kind === 'video'" class="absolute left-3 bottom-3 bg-default/90 px-2 py-1 label text-default! opacity-0 group-hover:opacity-100 transition-opacity">
        Lire
      </span>
    </div>
    <!-- Cartel -->
    <div class="pt-3 space-y-1">
      <p class="cartel-title line-clamp-2 group-hover:underline underline-offset-4 decoration-1">
        {{ doc.title }}
      </p>
      <p class="cartel-meta">
        {{ meta }}
      </p>
    </div>
  </NuxtLink>
</template>
