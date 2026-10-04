<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminDoc, AdminEvent, AdminYear, BatchResult, DocVisibility } from '~/composables/useAdmin'

// Liste de documents avec sélection et actions en lot (A-07)
const props = defineProps<{
  docs: AdminDoc[]
  loading?: boolean
  events?: AdminEvent[]
  years?: AdminYear[]
  empty?: string
}>()
const emit = defineEmits<{ changed: [] }>()

const { can } = useAdmin()
const { data: site } = await useSite()
const notify = useNotify()
const confirm = useConfirm()

const selected = ref<string[]>([])
watch(() => props.docs, (docs) => {
  const ids = new Set(docs.map(d => d.id))
  selected.value = selected.value.filter(id => ids.has(id))
})
const selectedDocs = computed(() => props.docs.filter(d => selected.value.includes(d.id)))
const allState = computed<boolean | 'indeterminate'>(() =>
  !selected.value.length ? false : selected.value.length === props.docs.length ? true : 'indeterminate')

function toggleAll(v: boolean | 'indeterminate') {
  selected.value = v === true ? props.docs.map(d => d.id) : []
}
function toggle(id: string, v: boolean | 'indeterminate') {
  selected.value = v === true ? [...new Set([...selected.value, id])] : selected.value.filter(x => x !== id)
}

const eventTitles = computed(() => new Map((props.events ?? []).map(e => [e.id, e.title])))

const columns: TableColumn<AdminDoc>[] = [
  { id: 'select' },
  { id: 'thumb', header: '' },
  { accessorKey: 'title', header: 'Document' },
  { accessorKey: 'status', header: 'État' },
  { id: 'info', header: 'Fichier' },
  { id: 'actions', header: '' },
]

const busy = ref(false)
const errors = ref<{ title: string, error: string }[]>([])

function collectErrors(results: { id?: string, index?: number, ok: boolean, error?: string, hint?: string }[], docs: AdminDoc[], verb = 'mis à jour') {
  errors.value = results.filter(r => !r.ok).map((r) => {
    const doc = r.id ? docs.find(d => d.id === r.id) : docs[r.index ?? -1]
    return { title: doc?.title ?? r.id ?? '?', error: [r.error, r.hint].filter(Boolean).join(' — ') }
  })
  const okCount = results.filter(r => r.ok).length
  if (okCount) notify.ok(`${okCount} document${okCount > 1 ? 's' : ''} ${verb}`)
  if (errors.value.length) notify.warn(`${errors.value.length} échec${errors.value.length > 1 ? 's' : ''}`, 'Détail sous la barre d\'actions.')
}

async function batch(fields: (d: AdminDoc) => Record<string, unknown>) {
  const docs = selectedDocs.value
  busy.value = true
  try {
    const results: BatchResult[] = []
    for (let i = 0; i < docs.length; i += 100) {
      const chunk = docs.slice(i, i + 100)
      const r = await $fetch<{ results: BatchResult[] }>('/api/v1/documents:batch', {
        method: 'POST',
        body: { documents: chunk.map(d => ({ id: d.id, ...fields(d) })) },
      })
      results.push(...r.results.map(x => ({ ...x, index: x.index + i })))
    }
    collectErrors(results, docs)
    emit('changed')
  }
  catch (e) {
    notify.fail(e)
  }
  finally {
    busy.value = false
  }
}

async function idsAction(action: 'publish' | 'unpublish' | 'trash') {
  const docs = selectedDocs.value
  if (action === 'trash' && !(await confirm({
    title: `Mettre ${docs.length} document${docs.length > 1 ? 's' : ''} à la corbeille ?`,
    description: 'Ils restent récupérables pendant 30 jours dans la corbeille.',
    confirmLabel: 'Mettre à la corbeille',
  }))) return
  busy.value = true
  try {
    const r = await $fetch<{ results: { id: string, ok: boolean, error?: string }[] }>(`/api/v1/documents:${action}`, { method: 'POST', body: { ids: docs.map(d => d.id) } })
    collectErrors(r.results, docs, { publish: 'publié(s)', unpublish: 'repassé(s) en brouillon', trash: 'mis à la corbeille' }[action])
    if (action === 'trash') selected.value = []
    emit('changed')
  }
  catch (e) {
    notify.fail(e)
  }
  finally {
    busy.value = false
  }
}

// Modale d'affectation en lot
type BulkMode = 'year' | 'event' | 'branch' | 'visibility'
const bulk = reactive({
  open: false,
  mode: 'year' as BulkMode,
  year: null as number | null,
  eventId: '__none' as string,
  newEventTitle: '',
  newEventType: '',
  branch: '__none' as string,
  visibility: 'inherit' as DocVisibility,
})
const bulkYear = computed({ get: () => bulk.year ?? undefined, set: (v: number | undefined) => { bulk.year = v ?? null } })
const bulkYears = computed(() => [...new Set(selectedDocs.value.map(d => d.yearStart))])
const bulkEvents = ref<AdminEvent[]>([])

async function openBulk(mode: BulkMode) {
  Object.assign(bulk, { open: true, mode, year: null, eventId: '__none', newEventTitle: '', newEventType: site.value?.eventTypes[0] ?? '', branch: '__none', visibility: 'inherit' })
  bulkEvents.value = []
  if (mode === 'event' && bulkYears.value.length === 1) {
    bulkEvents.value = await $fetch<AdminEvent[]>('/api/v1/events', { query: { year: bulkYears.value[0] } }).catch(() => [])
  }
}

const yearItems = computed(() => (props.years ?? []).map(y => ({ label: y.label, value: y.startYear })))
const eventItems = computed(() => [
  { label: 'Aucun événement', value: '__none' },
  ...bulkEvents.value.map(e => ({ label: e.title, value: e.id })),
  { label: 'Nouvel événement…', value: '__new' },
])
const branchItems = computed(() => [{ label: 'Aucune branche', value: '__none' }, ...(site.value?.branches ?? []).map(b => ({ label: b.label, value: b.key }))])
const visibilityItems = (Object.keys(VISIBILITY_LABELS) as DocVisibility[]).map(v => ({ label: VISIBILITY_LABELS[v]!, value: v, description: VISIBILITY_HELP[v] }))

async function applyBulk() {
  const b = { ...bulk }
  if (b.mode === 'year') {
    if (b.year === null) return
    await batch(() => ({ year: b.year!, eventId: null }))
  }
  else if (b.mode === 'event') {
    const useNew = b.eventId === '__new' || bulkYears.value.length > 1
    if (useNew && b.newEventTitle.trim()) await batch(() => ({ event: { title: b.newEventTitle.trim(), type: b.newEventType || undefined } }))
    else if (!useNew) await batch(() => ({ eventId: b.eventId === '__none' ? null : b.eventId }))
    else return
  }
  else if (b.mode === 'branch') {
    await batch(() => ({ branch: b.branch === '__none' ? null : b.branch }))
  }
  else {
    await batch(() => ({ visibility: b.visibility }))
  }
  bulk.open = false
}

const bulkTitle = computed(() => ({
  year: 'Affecter une année',
  event: 'Affecter un événement',
  branch: 'Affecter une branche',
  visibility: 'Changer la visibilité',
}[bulk.mode]))

const assignItems = computed(() => [
  [
    { label: 'Année…', icon: 'i-lucide-calendar', onSelect: () => openBulk('year') },
    { label: 'Événement…', icon: 'i-lucide-tent', onSelect: () => openBulk('event') },
    { label: 'Branche…', icon: 'i-lucide-users', onSelect: () => openBulk('branch') },
    ...(can('editor') ? [{ label: 'Visibilité…', icon: 'i-lucide-eye', onSelect: () => openBulk('visibility') }] : []),
  ],
])
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="selected.length"
      class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border border-default bg-default/95 p-2 backdrop-blur"
      role="toolbar"
      aria-label="Actions sur la sélection"
    >
      <span class="px-2 text-sm font-medium">{{ selected.length }} sélectionné{{ selected.length > 1 ? 's' : '' }}</span>
      <UDropdownMenu :items="assignItems">
        <UButton label="Affecter" icon="i-lucide-tags" trailing-icon="i-lucide-chevron-down" color="neutral" variant="outline" size="sm" :loading="busy" />
      </UDropdownMenu>
      <template v-if="can('editor')">
        <UButton label="Publier" icon="i-lucide-send" size="sm" :disabled="busy" @click="idsAction('publish')" />
        <UButton label="Dépublier" icon="i-lucide-eye-off" size="sm" color="neutral" variant="outline" :disabled="busy" @click="idsAction('unpublish')" />
      </template>
      <UButton label="Corbeille" icon="i-lucide-trash-2" size="sm" color="error" variant="soft" :disabled="busy" @click="idsAction('trash')" />
      <UButton label="Désélectionner" size="sm" color="neutral" variant="ghost" class="ms-auto" @click="selected = []" />
    </div>

    <UAlert
      v-if="errors.length"
      color="error"
      variant="outline"
      icon="i-lucide-circle-alert"
      :title="`${errors.length} document${errors.length > 1 ? 's' : ''} non modifié${errors.length > 1 ? 's' : ''}`"
      close
      @update:open="errors = []"
    >
      <template #description>
        <ul class="list-disc ps-4">
          <li v-for="(e, i) in errors" :key="i">
            <strong>{{ e.title }}</strong> : {{ e.error }}
          </li>
        </ul>
      </template>
    </UAlert>

    <UTable
      :data="docs"
      :columns="columns"
      :loading="loading"
      :empty="empty ?? 'Aucun document'"
      class="rounded-lg border border-default"
      :ui="{ td: 'py-2', th: 'py-2' }"
    >
      <template #select-header>
        <UCheckbox :model-value="allState" aria-label="Tout sélectionner" @update:model-value="toggleAll" />
      </template>
      <template #select-cell="{ row }">
        <UCheckbox
          :model-value="selected.includes(row.original.id)"
          :aria-label="`Sélectionner ${row.original.title}`"
          @update:model-value="v => toggle(row.original.id, v)"
        />
      </template>
      <template #thumb-cell="{ row }">
        <NuxtLink :to="`/admin/documents/${row.original.id}`" class="block size-14 shrink-0 overflow-hidden bg-elevated" tabindex="-1">
          <img v-if="row.original.thumbUrl" :src="row.original.thumbUrl" alt="" loading="lazy" class="size-full object-cover">
          <div v-else class="flex size-full items-center justify-center text-muted">
            <UIcon :name="KIND_ICONS[row.original.kind] ?? 'i-lucide-file'" class="size-6" />
          </div>
        </NuxtLink>
      </template>
      <template #title-cell="{ row }">
        <div class="min-w-48 max-w-md">
          <NuxtLink :to="`/admin/documents/${row.original.id}`" class="font-medium hover:underline">
            {{ row.original.title }}
          </NuxtLink>
          <p class="truncate text-xs text-muted">
            <UIcon :name="KIND_ICONS[row.original.kind] ?? 'i-lucide-file'" class="align-[-2px]" />
            {{ [row.original.yearLabel, row.original.eventId ? eventTitles.get(row.original.eventId) : null, branchLabel(site, row.original.branch)].filter(Boolean).join(' · ') }}
          </p>
        </div>
      </template>
      <template #status-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge :color="STATUS_COLORS[row.original.status]" variant="outline">
            {{ STATUS_LABELS[row.original.status] }}
          </UBadge>
          <UBadge v-if="row.original.visibility !== 'inherit'" :color="VISIBILITY_COLORS[row.original.visibility]" variant="outline">
            {{ VISIBILITY_LABELS[row.original.visibility] }}
          </UBadge>
        </div>
      </template>
      <template #info-cell="{ row }">
        <span v-if="!row.original.hasFile" class="inline-flex items-center gap-1 text-xs text-warning">
          <UIcon name="i-lucide-file-x" /> aucun fichier
        </span>
        <span v-else class="text-xs whitespace-nowrap text-muted">
          {{ [formatBytes(row.original.size), formatDuration(row.original.duration)].filter(Boolean).join(' · ') }}
        </span>
      </template>
      <template #actions-cell="{ row }">
        <UButton :to="`/admin/documents/${row.original.id}`" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="`Modifier ${row.original.title}`" />
      </template>
    </UTable>

    <UModal v-model:open="bulk.open" :title="bulkTitle" :description="`${selected.length} document${selected.length > 1 ? 's' : ''} sélectionné${selected.length > 1 ? 's' : ''}`">
      <template #body>
        <div class="space-y-4">
          <UFormField v-if="bulk.mode === 'year'" label="Année" help="Les documents sont détachés de leur événement (propre à chaque année).">
            <USelect v-model="bulkYear" :items="yearItems" placeholder="Choisir une année" class="w-full" />
          </UFormField>

          <template v-else-if="bulk.mode === 'event'">
            <UAlert
              v-if="bulkYears.length > 1"
              color="info"
              variant="outline"
              icon="i-lucide-info"
              title="La sélection couvre plusieurs années"
              description="L'événement sera retrouvé par son titre (ou créé) dans l'année de chaque document."
            />
            <UFormField v-else label="Événement">
              <USelect v-model="bulk.eventId" :items="eventItems" class="w-full" />
            </UFormField>
            <div v-if="bulk.eventId === '__new' || bulkYears.length > 1" class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Titre de l'événement" required>
                <UInput v-model="bulk.newEventTitle" placeholder="Camp d'été à Jambville" class="w-full" />
              </UFormField>
              <UFormField label="Type">
                <USelect v-model="bulk.newEventType" :items="site?.eventTypes ?? []" class="w-full" />
              </UFormField>
            </div>
          </template>

          <UFormField v-else-if="bulk.mode === 'branch'" label="Branche">
            <USelect v-model="bulk.branch" :items="branchItems" class="w-full" />
          </UFormField>

          <URadioGroup v-else v-model="bulk.visibility" :items="visibilityItems" legend="Visibilité" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="bulk.open = false" />
          <UButton label="Appliquer" :loading="busy" @click="applyBulk" />
        </div>
      </template>
    </UModal>
  </div>
</template>
