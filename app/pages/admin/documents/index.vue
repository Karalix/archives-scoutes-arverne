<script setup lang="ts">
import type { AdminDoc, AdminEvent, AdminYear } from '~/composables/useAdmin'

// A-05 / A-07 : catalogue complet, filtres synchronisés avec l'URL
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Documents' })

const route = useRoute()
const router = useRouter()
const { data: site } = await useSite()

const ALL = '__all'
const q = (k: string) => (typeof route.query[k] === 'string' ? route.query[k] as string : '')
const filters = reactive({
  q: q('q'),
  year: q('year') || ALL,
  status: q('status') || ALL,
  kind: q('kind') || ALL,
  branch: q('branch') || ALL,
})

let timer: ReturnType<typeof setTimeout> | undefined
watch(filters, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const query: Record<string, string> = {}
    for (const [k, v] of Object.entries(filters)) if (v && v !== ALL) query[k] = v
    router.replace({ query })
  }, 250)
})
watch(() => route.query, (rq) => {
  for (const k of Object.keys(filters) as (keyof typeof filters)[]) {
    const v = typeof rq[k] === 'string' ? rq[k] as string : ''
    filters[k] = v || (k === 'q' ? '' : ALL)
  }
})

const apiQuery = computed(() => {
  const o: Record<string, string | number> = { limit: 500 }
  const rq = route.query
  for (const k of ['q', 'year', 'status', 'kind', 'branch']) if (typeof rq[k] === 'string' && rq[k]) o[k] = rq[k] as string
  return o
})

const { data: docs, pending, refresh } = await useFetch<AdminDoc[]>('/api/v1/documents', { query: apiQuery })
const { data: years } = await useFetch<AdminYear[]>('/api/v1/years', { key: 'admin-years' })
const { data: events } = await useFetch<AdminEvent[]>('/api/v1/events', { key: 'admin-events-all' })

const yearItems = computed(() => [{ label: 'Toutes les années', value: ALL }, ...(years.value ?? []).map(y => ({ label: y.label, value: String(y.startYear) }))])
const statusItems = [{ label: 'Tous les états', value: ALL }, { label: 'Brouillons', value: 'draft' }, { label: 'Publiés', value: 'published' }]
const kindItems = [{ label: 'Tous les types', value: ALL }, ...Object.entries(KIND_LABELS).map(([value, label]) => ({ label, value }))]
const branchItems = computed(() => [{ label: 'Toutes les branches', value: ALL }, ...(site.value?.branches ?? []).map(b => ({ label: b.label, value: b.key }))])

const hasFilters = computed(() => Object.entries(filters).some(([k, v]) => k === 'q' ? !!v : v !== ALL))
function reset() {
  Object.assign(filters, { q: '', year: ALL, status: ALL, kind: ALL, branch: ALL })
}
</script>

<template>
  <AdminPage title="Documents">
    <template #actions>
      <UButton to="/admin/televerser" icon="i-lucide-upload" label="Téléverser" />
    </template>

    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(4,1fr)]">
      <UInput v-model="filters.q" icon="i-lucide-search" placeholder="Rechercher (titre, lieu, description…)" aria-label="Rechercher" class="w-full" />
      <USelect v-model="filters.year" :items="yearItems" aria-label="Année" class="w-full" />
      <USelect v-model="filters.status" :items="statusItems" aria-label="État" class="w-full" />
      <USelect v-model="filters.kind" :items="kindItems" aria-label="Type" class="w-full" />
      <USelect v-model="filters.branch" :items="branchItems" aria-label="Branche" class="w-full" />
    </div>
    <div class="flex items-center justify-between gap-2 text-sm text-muted">
      <span>{{ docs?.length ?? 0 }} document{{ (docs?.length ?? 0) > 1 ? 's' : '' }}{{ docs?.length === 500 ? ' (limite d\'affichage atteinte : affinez les filtres)' : '' }}</span>
      <UButton v-if="hasFilters" label="Effacer les filtres" icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="reset" />
    </div>

    <AdminDocumentsTable
      :docs="docs ?? []"
      :loading="pending"
      :events="events ?? []"
      :years="years ?? []"
      :empty="hasFilters ? 'Aucun document ne correspond à ces filtres' : 'Aucun document : commencez par téléverser des fichiers'"
      @changed="refresh"
    />
  </AdminPage>
</template>
