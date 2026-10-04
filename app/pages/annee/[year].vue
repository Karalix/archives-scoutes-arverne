<script setup lang="ts">
const route = useRoute()
const { data: site } = await useSite()
const year = computed(() => Number(route.params.year))
const { data: page, error } = await useFetch(() => `/api/public/years/${year.value}`, { key: `year-${year.value}` })

const kind = ref<string>('all')
const branch = ref<string>('all')

const kindItems = computed(() => {
  const kinds = [...new Set(page.value?.documents.map(d => d.kind) ?? [])]
  return [{ label: 'Tous les types', value: 'all' }, ...kinds.map(k => ({ label: KIND_LABELS[k] ?? k, value: k }))]
})
const branchItems = computed(() => {
  const used = new Set(page.value?.documents.map(d => d.branch).filter(Boolean))
  return [{ label: 'Toutes les branches', value: 'all' }, ...(site.value?.branches ?? []).filter(b => used.has(b.key)).map(b => ({ label: b.label, value: b.key }))]
})

const filtered = computed(() => (page.value?.documents ?? []).filter(d =>
  (kind.value === 'all' || d.kind === kind.value) && (branch.value === 'all' || d.branch === branch.value)))

// F-04 : par événement, puis par unité/branche
const sections = computed(() => {
  const events = page.value?.events ?? []
  const order = site.value?.branches.map(b => b.key) ?? []
  const groupByBranch = (docs: typeof filtered.value) => {
    const m = new Map<string, typeof docs>()
    for (const d of docs) {
      const k = d.branch ?? ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(d)
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] ? order.indexOf(a[0]) : 99) - (b[0] ? order.indexOf(b[0]) : 99))
      .map(([key, docs]) => ({ key, label: key ? branchLabel(site.value, key) : '', docs }))
  }
  const out = events.map(e => ({ id: e.id, event: e, branches: groupByBranch(filtered.value.filter(d => d.eventId === e.id)) }))
  const loose = filtered.value.filter(d => !d.eventId || !events.some(e => e.id === d.eventId))
  if (loose.length) out.push({ id: 'autres', event: null as any, branches: groupByBranch(loose) })
  return out.filter(s => s.branches.length)
})

const hasVideos = computed(() => page.value?.documents.some(d => d.kind === 'video'))

useHead(() => ({
  title: page.value?.label ?? scoutYearLabel(year.value),
  meta: page.value && !page.value.public ? [{ name: 'robots', content: 'noindex, nofollow' }] : [],
}))

function eventDates(e: { startDate: string | null, endDate: string | null }) {
  const f = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  if (e.startDate && e.endDate && e.endDate !== e.startDate) return `du ${f(e.startDate)} au ${f(e.endDate)}`
  return e.startDate ? f(e.startDate) : ''
}
</script>

<template>
  <PublicWall class="pt-14 sm:pt-20 space-y-16">
    <div v-if="error" class="border-t border-default pt-8 space-y-6">
      <p class="text-2xl font-light">
        {{ apiError(error) }}
      </p>
      <UButton to="/" color="neutral" variant="outline">
        Toutes les années
      </UButton>
    </div>

    <template v-else-if="page">
      <header class="grid gap-8 md:grid-cols-12 items-end">
        <div class="md:col-span-8">
          <p class="label mb-4">
            Année scoute{{ page.public ? '' : ' · accès réservé' }}
          </p>
          <h1 class="text-6xl sm:text-8xl font-light tracking-[-0.04em] leading-none tabular-nums">
            {{ page.label.replace('-', '–') }}
          </h1>
        </div>
        <nav class="md:col-span-4 flex md:justify-end gap-6 text-sm" aria-label="Années voisines">
          <NuxtLink v-if="page.prev !== null" :to="`/annee/${page.prev}`" class="text-muted hover:text-default">
            ← {{ scoutYearLabel(page.prev).replace('-', '–') }}
          </NuxtLink>
          <NuxtLink v-if="page.next !== null" :to="`/annee/${page.next}`" class="text-muted hover:text-default">
            {{ scoutYearLabel(page.next).replace('-', '–') }} →
          </NuxtLink>
        </nav>
      </header>

      <p v-if="page.description" class="max-w-2xl text-lg text-muted leading-relaxed whitespace-pre-line">
        {{ page.description }}
      </p>

      <PublicLockPanel v-if="page.locked && !page.documents.length" :label="page.label" :count="page.count" :not-covered="!!site?.family" />

      <template v-else>
        <div class="flex flex-wrap gap-3 items-center border-y border-default py-3">
          <USelect v-model="kind" :items="kindItems" variant="none" class="w-44" aria-label="Filtrer par type" />
          <USelect v-model="branch" :items="branchItems" variant="none" class="w-56" aria-label="Filtrer par branche" />
          <span v-if="page.hiddenCount" class="label">
            {{ page.hiddenCount }} protégé{{ page.hiddenCount > 1 ? 's' : '' }}
          </span>
          <UButton v-if="hasVideos" :to="`/soiree/${page.startYear}`" color="neutral" variant="link" class="ml-auto">
            Mode soirée →
          </UButton>
        </div>

        <section v-for="s in sections" :key="s.id" class="grid gap-8 lg:grid-cols-12">
          <div class="lg:col-span-3 lg:sticky lg:top-8 self-start space-y-2">
            <h2 class="text-2xl font-light tracking-tight">
              {{ s.event?.title ?? 'Autres documents' }}
            </h2>
            <p v-if="s.event" class="cartel-meta">
              {{ [s.event.type !== s.event.title ? s.event.type : '', s.event.place, eventDates(s.event)].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <div class="lg:col-span-9 space-y-12">
            <div v-for="b in s.branches" :key="b.key" class="space-y-6">
              <h3 v-if="b.label" class="label flex items-center gap-2">
                <span class="inline-block size-1.5" :style="{ background: site?.branches.find(x => x.key === b.key)?.color ?? 'currentColor' }" />
                {{ b.label }}
              </h3>
              <ul class="grid gap-x-6 gap-y-10 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                <li v-for="d in b.docs" :key="d.id">
                  <PublicDocCard :doc="d" />
                </li>
              </ul>
            </div>
          </div>
        </section>
        <p v-if="!sections.length" class="text-muted">
          Aucun document ne correspond à ces filtres.
        </p>
      </template>
    </template>
  </PublicWall>
</template>
