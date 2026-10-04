<script setup lang="ts">
// F-10 / F-11 : recherche plein texte et filtre par lieu, limitée aux documents accessibles
const route = useRoute()
const router = useRouter()
const { data: site } = await useSite()
const q = ref(String(route.query.q ?? ''))
const place = ref(String(route.query.lieu ?? ''))
const kind = ref(String(route.query.type ?? ''))
const branch = ref(String(route.query.branche ?? ''))

const query = computed(() => ({
  q: route.query.q || undefined,
  place: route.query.lieu || undefined,
  kind: route.query.type || undefined,
  branch: route.query.branche || undefined,
}))
const { data, pending } = await useFetch('/api/public/search', { query, key: 'search' })

let t: ReturnType<typeof setTimeout> | undefined
watch([q, place, kind, branch], () => {
  clearTimeout(t)
  t = setTimeout(() => {
    router.replace({ query: { q: q.value || undefined, lieu: place.value || undefined, type: kind.value || undefined, branche: branch.value || undefined } })
  }, 250)
})

const placeItems = computed(() => [{ label: 'Tous les lieux', value: '' }, ...(data.value?.places ?? []).map(p => ({ label: p, value: p }))])
const kindItems = [{ label: 'Tous les types', value: '' }, ...Object.entries(KIND_LABELS).map(([value, label]) => ({ label, value }))]
const branchItems = computed(() => [{ label: 'Toutes les branches', value: '' }, ...(site.value?.branches ?? []).map(b => ({ label: b.label, value: b.key }))])

useHead({ title: 'Recherche', meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <PublicWall class="pt-14 sm:pt-20 space-y-12">
    <header class="space-y-8">
      <p class="label">
        Recherche
      </p>
      <input
        v-model="q"
        type="search"
        placeholder="Titre, lieu, mot-clé…"
        aria-label="Rechercher"
        autofocus
        class="w-full bg-transparent border-b border-(--ui-border-accented) pb-3 text-4xl sm:text-6xl font-light tracking-tight outline-none placeholder:text-dimmed focus-visible:outline-none"
      >
      <div class="flex flex-wrap gap-3 border-b border-default pb-3">
        <USelect v-model="place" :items="placeItems" variant="none" class="w-56" aria-label="Lieu de camp" />
        <USelect v-model="kind" :items="kindItems" variant="none" class="w-44" aria-label="Type" />
        <USelect v-model="branch" :items="branchItems" variant="none" class="w-56" aria-label="Branche" />
      </div>
    </header>
    <p class="label" aria-live="polite">
      <template v-if="pending">
        Recherche…
      </template>
      <template v-else>
        {{ data?.results.length ?? 0 }} résultat{{ (data?.results.length ?? 0) > 1 ? 's' : '' }}<template v-if="!site?.family">
          · archives récentes exclues sans mot de passe
        </template>
      </template>
    </p>
    <ul class="grid gap-x-6 gap-y-10 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <li v-for="d in data?.results ?? []" :key="d.id">
        <PublicDocCard :doc="d" show-year />
      </li>
    </ul>
  </PublicWall>
</template>
