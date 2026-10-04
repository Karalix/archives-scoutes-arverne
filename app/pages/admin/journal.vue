<script setup lang="ts">
// A-17 : journal d'audit
definePageMeta({ layout: 'admin', middleware: 'admin', minRole: 'editor' })
useHead({ title: 'Journal' })

interface Entry { id: string, actor: string, actorName: string | null, action: string, target: string | null, before: unknown, after: unknown, createdAt: number }

const notify = useNotify()
const ALL = '__all'
const action = ref(ALL)
const entries = ref<Entry[]>([])
const loading = ref(false)
const more = ref(true)
const expanded = ref<string | null>(null)

const actionItems = [
  { label: 'Toutes les actions', value: ALL },
  { label: 'Documents', value: 'document.' },
  { label: 'Publication', value: 'document.publish' },
  { label: 'Visibilité', value: 'document.visibility' },
  { label: 'Corbeille', value: 'document.trash' },
  { label: 'Années', value: 'year.' },
  { label: 'Événements', value: 'event.' },
  { label: 'Pivot', value: 'instance.pivot' },
  { label: 'Paramètres', value: 'instance.' },
  { label: 'Mots de passe', value: 'password.' },
  { label: 'Administrateurs', value: 'user.' },
  { label: 'Jetons', value: 'token.' },
  { label: 'Signalements', value: 'report.' },
]

async function load(reset = false) {
  loading.value = true
  try {
    const before = reset ? undefined : entries.value.at(-1)?.createdAt
    const rows = await $fetch<Entry[]>('/api/admin/audit', { query: { action: action.value === ALL ? undefined : action.value, before } })
    entries.value = reset ? rows : [...entries.value, ...rows]
    more.value = rows.length === 200
  }
  catch (e) { notify.fail(e) }
  finally { loading.value = false }
}
watch(action, () => load(true))
onMounted(() => load(true))

const json = (v: unknown) => v === null || v === undefined ? '—' : JSON.stringify(v, null, 2)
function targetLink(t: string | null) {
  if (!t) return null
  const [kind, id] = t.split(':')
  if (kind === 'document') return `/admin/documents/${id}`
  if (kind === 'year') return `/admin/annees/${id}`
  return null
}
</script>

<template>
  <AdminPage title="Journal d'audit">
    <template #toolbar>
      <USelect v-model="action" :items="actionItems" class="w-56" aria-label="Filtrer par action" />
    </template>

    <p class="text-sm text-muted">
      Qui a publié, modifié, supprimé, changé la visibilité ou le pivot. Les actions faites avec un jeton d'API apparaissent comme « token:nom ».
    </p>

    <ul class="divide-y divide-default border-y border-default">
      <li v-if="!entries.length && !loading" class="p-4 text-sm text-muted">
        Aucune entrée.
      </li>
      <li v-for="e in entries" :key="e.id">
        <button
          type="button"
          class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left hover:bg-elevated/50"
          :aria-expanded="expanded === e.id"
          @click="expanded = expanded === e.id ? null : e.id"
        >
          <UIcon :name="expanded === e.id ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="text-muted" />
          <span class="w-36 shrink-0 text-xs text-muted">{{ adminDate(e.createdAt, true) }}</span>
          <span class="font-medium">{{ e.actorName ?? e.actor }}</span>
          <UBadge color="neutral" variant="outline">
            {{ e.action }}
          </UBadge>
          <span class="min-w-0 truncate text-sm text-muted">{{ e.target }}</span>
        </button>
        <div v-if="expanded === e.id" class="space-y-2 px-3 pb-3">
          <p class="text-xs text-muted">
            Acteur : {{ e.actor }}
            <NuxtLink v-if="targetLink(e.target)" :to="targetLink(e.target)!" class="ms-2 text-primary underline">
              Ouvrir la cible
            </NuxtLink>
          </p>
          <div class="grid gap-2 md:grid-cols-2">
            <div>
              <p class="text-xs font-medium">
                Avant
              </p>
              <pre class="max-h-72 overflow-auto bg-elevated p-2 text-xs">{{ json(e.before) }}</pre>
            </div>
            <div>
              <p class="text-xs font-medium">
                Après
              </p>
              <pre class="max-h-72 overflow-auto bg-elevated p-2 text-xs">{{ json(e.after) }}</pre>
            </div>
          </div>
        </div>
      </li>
    </ul>
    <div class="flex justify-center">
      <UButton v-if="more && entries.length" label="Charger plus" icon="i-lucide-chevrons-down" color="neutral" variant="outline" :loading="loading" @click="load()" />
      <USkeleton v-else-if="loading && !entries.length" class="h-12 w-full" />
    </div>
  </AdminPage>
</template>
