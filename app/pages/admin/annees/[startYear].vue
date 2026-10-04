<script setup lang="ts">
import type { AdminDoc, AdminEvent, AdminYear } from '~/composables/useAdmin'

// A-05 : détail d'une année (description, couverture, événements, documents)
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const startYear = Number(route.params.startYear)
useHead({ title: `Année ${scoutYearLabel(startYear)}` })

const notify = useNotify()
const confirm = useConfirm()
const { data: site } = await useSite()

const { data: years, refresh: refreshYears } = await useFetch<AdminYear[]>('/api/v1/years', { key: 'admin-years' })
const year = computed(() => years.value?.find(y => y.startYear === startYear) ?? null)
const { data: docs, pending: docsPending, refresh: refreshDocs } = await useFetch<AdminDoc[]>('/api/v1/documents', { query: { year: startYear, limit: 500 } })
const { data: events, refresh: refreshEvents } = await useFetch<AdminEvent[]>('/api/v1/events', { query: { year: startYear } })

const description = ref('')
watch(year, y => { description.value = y?.description ?? '' }, { immediate: true })
const savingDesc = ref(false)

async function patchYear(body: { description?: string, coverDocumentId?: string | null }) {
  await $fetch(`/api/v1/years/${startYear}`, { method: 'PATCH', body })
  await refreshYears()
}

async function saveDescription() {
  savingDesc.value = true
  try {
    await patchYear({ description: description.value })
    notify.ok('Description enregistrée')
  }
  catch (e) { notify.fail(e) }
  finally { savingDesc.value = false }
}

const coverOpen = ref(false)
const coverDoc = computed(() => docs.value?.find(d => d.id === year.value?.coverDocumentId) ?? null)
async function setCover(id: string | null) {
  try {
    await patchYear({ coverDocumentId: id })
    notify.ok(id ? 'Couverture choisie' : 'Couverture retirée')
  }
  catch (e) { notify.fail(e) }
}

// Couverture d'un événement (A-05)
const evCoverFor = ref<AdminEvent | null>(null)
const evCoverOpen = computed({ get: () => !!evCoverFor.value, set: (v) => { if (!v) evCoverFor.value = null } })
async function setEventCover(id: string | null) {
  const e = evCoverFor.value
  if (!e) return
  try {
    await $fetch(`/api/v1/events/${e.id}`, { method: 'PATCH', body: { coverDocumentId: id } })
    notify.ok(id ? 'Couverture de l\'événement choisie' : 'Couverture retirée')
    await refreshEvents()
  }
  catch (err) { notify.fail(err) }
}

// Événements
const NONE = '__none'
const evOpen = ref(false)
const evBusy = ref(false)
const ev = reactive({ id: '' as string, type: '', title: '', place: '', startDate: '', endDate: '', branch: NONE })
const branchItems = computed(() => [{ label: 'Toutes branches', value: NONE }, ...(site.value?.branches ?? []).map(b => ({ label: b.label, value: b.key }))])
const typeItems = computed(() => site.value?.eventTypes ?? [])

function openEvent(e?: AdminEvent) {
  Object.assign(ev, e
    ? { id: e.id, type: e.type, title: e.title, place: e.place, startDate: e.startDate ?? '', endDate: e.endDate ?? '', branch: e.branch ?? NONE }
    : { id: '', type: typeItems.value[0] ?? '', title: '', place: '', startDate: '', endDate: '', branch: NONE })
  evOpen.value = true
}

async function saveEvent() {
  evBusy.value = true
  const body = {
    year: startYear,
    type: ev.type || undefined,
    title: ev.title.trim(),
    place: ev.place,
    startDate: ev.startDate || null,
    endDate: ev.endDate || null,
    branch: ev.branch === NONE ? null : ev.branch,
  }
  try {
    if (ev.id) await $fetch(`/api/v1/events/${ev.id}`, { method: 'PATCH', body })
    else await $fetch('/api/v1/events', { method: 'POST', body })
    notify.ok(ev.id ? 'Événement modifié' : 'Événement créé')
    evOpen.value = false
    await refreshEvents()
  }
  catch (e) { notify.fail(e) }
  finally { evBusy.value = false }
}

async function deleteEvent(e: AdminEvent) {
  if (!(await confirm({ title: `Supprimer « ${e.title} » ?`, description: 'Ses documents restent dans l\'année, sans événement.', confirmLabel: 'Supprimer' }))) return
  try {
    await $fetch(`/api/v1/events/${e.id}`, { method: 'DELETE' })
    notify.ok('Événement supprimé')
    await Promise.all([refreshEvents(), refreshDocs()])
  }
  catch (err) { notify.fail(err) }
}

const docCount = (id: string) => docs.value?.filter(d => d.eventId === id).length ?? 0
const dates = (e: AdminEvent) => [e.startDate, e.endDate].filter(Boolean).map(d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR')).join(' → ')

async function refreshAll() {
  await Promise.all([refreshDocs(), refreshYears(), refreshEvents()])
}
</script>

<template>
  <AdminPage :title="`Année ${scoutYearLabel(startYear)}`">
    <template #actions>
      <UButton :to="`/annee/${startYear}`" target="_blank" icon="i-lucide-external-link" label="Voir sur le site" color="neutral" variant="ghost" class="hidden sm:inline-flex" />
      <UButton :to="`/admin/televerser?annee=${startYear}`" icon="i-lucide-upload" label="Ajouter des documents" />
    </template>

    <UButton to="/admin/annees" icon="i-lucide-arrow-left" label="Toutes les années" color="neutral" variant="link" class="px-0" />

    <UAlert
      v-if="years && !year"
      color="warning"
      icon="i-lucide-calendar-x"
      :title="`L'année ${scoutYearLabel(startYear)} n'existe pas encore`"
      description="Elle sera créée automatiquement lors du premier import, ou depuis la liste des années."
    />

    <template v-else-if="year">
      <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <AdminSection title="Présentation">
        <template #actions>
          <UBadge v-if="year.public" color="success" variant="outline" icon="i-lucide-globe">
                Publique
              </UBadge>
              <UBadge v-else color="warning" variant="outline" icon="i-lucide-lock">
                Protégée (mot de passe des familles)
              </UBadge>
        </template>
          <UFormField label="Description" help="Visible sur la page de l'année (pour une année protégée : seulement après saisie du mot de passe).">
            <UTextarea v-model="description" :rows="4" autoresize class="w-full" />
          </UFormField>
          <div class="mt-3 flex justify-end">
            <UButton label="Enregistrer" :loading="savingDesc" :disabled="description === year.description" @click="saveDescription" />
          </div>
        </AdminSection>

        <AdminSection title="Couverture">
          <button type="button" class="block w-full overflow-hidden border border-default bg-elevated" @click="coverOpen = true">
            <img v-if="coverDoc?.thumbUrl" :src="coverDoc.thumbUrl" alt="Couverture actuelle" class="aspect-video w-full object-cover">
            <span v-else class="flex aspect-video items-center justify-center text-sm text-muted">
              <UIcon name="i-lucide-image-plus" class="me-2 size-5" /> Choisir une image
            </span>
          </button>
          <p class="mt-2 text-xs text-muted">
            {{ coverDoc ? coverDoc.title : 'Sans couverture : la première vignette disponible est utilisée.' }}
          </p>
        </AdminSection>
      </div>

      <AdminSection title="Événements">
        <template #actions>
          <UButton icon="i-lucide-plus" label="Nouvel événement" size="sm" variant="outline" @click="openEvent()" />
        </template>
        <p v-if="!events?.length" class="text-sm text-muted">
          Aucun événement. Les documents peuvent être regroupés par camp, week-end, fête de groupe…
        </p>
        <ul v-else class="divide-y divide-default">
          <li v-for="e in events" :key="e.id" class="flex flex-wrap items-center gap-2 py-2">
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{ e.title }}
                <UBadge color="neutral" variant="outline" size="sm" class="ms-1">
                  {{ e.type }}
                </UBadge>
                <UBadge v-if="e.branch" color="neutral" variant="outline" size="sm" class="ms-1">
                  {{ branchLabel(site, e.branch) }}
                </UBadge>
              </p>
              <p class="text-xs text-muted">
                {{ [e.place, dates(e), `${docCount(e.id)} document${docCount(e.id) > 1 ? 's' : ''}`].filter(Boolean).join(' · ') }}
              </p>
            </div>
            <UButton icon="i-lucide-image" color="neutral" variant="ghost" size="sm" :aria-label="`Couverture de ${e.title}`" @click="evCoverFor = e" />
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" :aria-label="`Modifier ${e.title}`" @click="openEvent(e)" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :aria-label="`Supprimer ${e.title}`" @click="deleteEvent(e)" />
          </li>
        </ul>
      </AdminSection>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xs tracking-[0.2em] text-muted uppercase">
            Documents ({{ docs?.length ?? 0 }})
          </h2>
          <UButton :to="`/admin/televerser?annee=${startYear}`" icon="i-lucide-upload" label="Ajouter des documents" size="sm" variant="outline" />
        </div>
        <AdminDocumentsTable
          :docs="docs ?? []"
          :loading="docsPending"
          :events="events ?? []"
          :years="years ?? []"
          empty="Aucun document dans cette année"
          @changed="refreshAll"
        />
      </div>
    </template>

    <AdminCoverPicker
      v-model:open="coverOpen"
      :docs="docs ?? []"
      :model-value="year?.coverDocumentId ?? null"
      :title="`Couverture de ${scoutYearLabel(startYear)}`"
      @update:model-value="setCover"
    />

    <AdminCoverPicker
      v-model:open="evCoverOpen"
      :docs="(docs ?? []).filter(d => d.eventId === evCoverFor?.id)"
      :model-value="evCoverFor?.coverDocumentId ?? null"
      :title="`Couverture de « ${evCoverFor?.title ?? ''} »`"
      @update:model-value="setEventCover"
    />

    <UModal v-model:open="evOpen" :title="ev.id ? 'Modifier l\'événement' : 'Nouvel événement'">
      <template #body>
        <form id="event-form" class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveEvent">
          <UFormField label="Titre" required class="sm:col-span-2">
            <UInput v-model="ev.title" placeholder="Camp d'été à Jambville" class="w-full" />
          </UFormField>
          <UFormField label="Type">
            <USelect v-model="ev.type" :items="typeItems" class="w-full" />
          </UFormField>
          <UFormField label="Branche">
            <USelect v-model="ev.branch" :items="branchItems" class="w-full" />
          </UFormField>
          <UFormField label="Lieu" class="sm:col-span-2">
            <UInput v-model="ev.place" class="w-full" />
          </UFormField>
          <UFormField label="Début">
            <UInput v-model="ev.startDate" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Fin">
            <UInput v-model="ev.endDate" type="date" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="evOpen = false" />
          <UButton type="submit" form="event-form" label="Enregistrer" :loading="evBusy" :disabled="!ev.title.trim()" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
