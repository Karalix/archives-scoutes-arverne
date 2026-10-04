<script setup lang="ts">
import type { AdminDoc, AdminEvent, AdminYear, DocVisibility } from '~/composables/useAdmin'

// A-05 / A-09 / L-02 / F-08 : édition d'un document
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const id = String(route.params.id)
const notify = useNotify()
const confirm = useConfirm()
const { can } = useAdmin()
const { data: site } = await useSite()

const { data: doc, error, refresh } = await useFetch<AdminDoc>(`/api/v1/documents/${id}`)
const { data: years } = await useFetch<AdminYear[]>('/api/v1/years', { key: 'admin-years' })
const { data: settings } = await useFetch<{ settings: { streamEnabled: boolean, publicDownloads: boolean } }>('/api/admin/settings', { key: 'admin-settings' })
useHead(() => ({ title: doc.value?.title ?? 'Document' }))

const NONE = '__none'
const form = reactive({
  title: '', description: '', year: 0, eventId: NONE, branch: NONE, place: '', date: '', credits: '', people: '',
  tags: [] as string[], visibility: 'inherit' as DocVisibility, downloadable: 'inherit' as 'inherit' | 'yes' | 'no',
  chapters: [] as { start: string, title: string }[],
})

const toClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
function fromClock(v: string): number | null {
  const parts = v.trim().split(':').map(Number)
  if (!parts.length || parts.some(n => Number.isNaN(n))) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

function load(d: AdminDoc) {
  Object.assign(form, {
    title: d.title, description: d.description, year: d.yearStart, eventId: d.eventId ?? NONE, branch: d.branch ?? NONE,
    place: d.place, date: d.date ?? '', credits: d.credits, people: d.people, tags: [...(d.tags ?? [])],
    visibility: d.visibility, downloadable: d.downloadable === null ? 'inherit' : d.downloadable ? 'yes' : 'no',
    chapters: (d.chapters ?? []).map(c => ({ start: toClock(c.start), title: c.title })),
  })
}
watch(doc, d => d && load(d), { immediate: true })

const { data: events } = await useFetch<AdminEvent[]>('/api/v1/events', { query: computed(() => ({ year: form.year || doc.value?.yearStart })) })
watch(() => form.year, (y, old) => { if (old && y !== old) form.eventId = NONE })

const yearItems = computed(() => (years.value ?? []).map(y => ({ label: y.label, value: y.startYear })))
const eventItems = computed(() => [{ label: 'Aucun événement', value: NONE }, ...(events.value ?? []).map(e => ({ label: e.title, value: e.id }))])
const branchItems = computed(() => [{ label: 'Aucune branche', value: NONE }, ...(site.value?.branches ?? []).map(b => ({ label: b.label, value: b.key }))])
const visibilityItems = (Object.keys(VISIBILITY_LABELS) as DocVisibility[]).map(v => ({ label: VISIBILITY_LABELS[v]!, value: v, description: VISIBILITY_HELP[v] }))

const yearPublic = computed(() => years.value?.find(y => y.startYear === form.year)?.public ?? false)
const isProtected = computed(() => form.visibility === 'forcePrivate' || (form.visibility !== 'forcePublic' && !yearPublic.value))
const downloadItems = computed(() => [
  { label: `Réglage de l'instance (${settings.value?.settings.publicDownloads ? 'autorisé' : 'interdit'})`, value: 'inherit' },
  { label: 'Autorisé', value: 'yes' },
  { label: 'Interdit', value: 'no' },
])

const readonly = computed(() => doc.value?.status === 'published' && !can('editor'))
const saving = ref(false)

async function save() {
  if (!doc.value) return
  const chapters = form.chapters
    .map(c => ({ start: fromClock(c.start), title: c.title.trim() }))
    .filter((c): c is { start: number, title: string } => c.start !== null && !!c.title)
    .sort((a, b) => a.start - b.start)
  const body: Record<string, unknown> = {
    title: form.title.trim(),
    description: form.description,
    year: form.year,
    eventId: form.eventId === NONE ? null : form.eventId,
    branch: form.branch === NONE ? null : form.branch,
    place: form.place,
    date: form.date || null,
    credits: form.credits,
    tags: form.tags,
    downloadable: form.downloadable === 'inherit' ? null : form.downloadable === 'yes',
  }
  if (site.value?.peopleField) body.people = form.people
  if (doc.value.kind === 'video' || doc.value.kind === 'audio') body.chapters = chapters.length ? chapters : null
  if (form.visibility !== doc.value.visibility) body.visibility = form.visibility
  saving.value = true
  try {
    doc.value = await $fetch<AdminDoc>(`/api/v1/documents/${id}`, { method: 'PATCH', body })
    notify.ok('Document enregistré')
  }
  catch (e) { notify.fail(e, 'Enregistrement impossible') }
  finally { saving.value = false }
}

// L-02 : retrait en un clic
async function takedown(v: 'forcePrivate' | 'hidden') {
  try {
    doc.value = await $fetch<AdminDoc>(`/api/v1/documents/${id}`, { method: 'PATCH', body: { visibility: v } })
    notify.ok(v === 'hidden' ? 'Document masqué' : 'Document retiré du public (toujours protégé)')
  }
  catch (e) { notify.fail(e) }
}

async function setPublished(publish: boolean) {
  try {
    const r = await $fetch<{ results: { ok: boolean, error?: string }[] }>(`/api/v1/documents:${publish ? 'publish' : 'unpublish'}`, { method: 'POST', body: { ids: [id] } })
    if (!r.results[0]?.ok) throw new Error(r.results[0]?.error ?? 'Échec')
    notify.ok(publish ? 'Document publié' : 'Document repassé en brouillon')
    await refresh()
  }
  catch (e) { notify.fail(e) }
}

async function trash() {
  if (!(await confirm({ title: 'Mettre ce document à la corbeille ?', description: 'Il reste récupérable pendant 30 jours.', confirmLabel: 'Mettre à la corbeille' }))) return
  try {
    await $fetch(`/api/v1/documents/${id}`, { method: 'DELETE' })
    notify.ok('Document mis à la corbeille')
    await navigateTo('/admin/documents')
  }
  catch (e) { notify.fail(e) }
}

// Remplacement du fichier principal (même traitement qu'à l'import)
const replaceInput = ref<HTMLInputElement>()
const replacing = reactive({ active: false, stage: '', progress: 0 })
async function onReplace(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f || !doc.value) return
  const kind = kindFromFilename(f.name, f.type)
  if (kind !== doc.value.kind) {
    notify.warn('Type de fichier différent', `Ce document est de type ${KIND_LABELS[doc.value.kind]}.`)
    return
  }
  Object.assign(replacing, { active: true, stage: 'Analyse', progress: 0 })
  try {
    const p = await processMedia(f, kind, { onStage: (s, pr) => { replacing.stage = s === 'encodage' ? 'Encodage' : 'Analyse'; replacing.progress = pr ?? 0 } })
    replacing.stage = 'Envoi'
    if (p.thumb && (kind === 'photo' || !doc.value.hasThumb)) {
      await directUpload({ documentId: id, variant: 'thumb', blob: p.thumb, filename: 'vignette.webp', mime: p.thumb.type })
    }
    await resumableUpload({ documentId: id, variant: 'main', blob: p.main, filename: p.mainName, mime: p.mainMime, meta: p.meta, onProgress: (x) => { replacing.progress = x } })
    if (settings.value && (settings.value.settings as { keepOriginals?: boolean }).keepOriginals && p.main !== f) {
      replacing.stage = 'Envoi de l\'original'
      await resumableUpload({ documentId: id, variant: 'original', blob: f, filename: f.name, mime: f.type, onProgress: (x) => { replacing.progress = x } })
    }
    notify.ok('Fichier remplacé', p.note)
    await refresh()
  }
  catch (err) {
    const d = (err as { data?: { ffmpeg?: string } }).data
    notify.fail(err, d?.ffmpeg ? 'Vidéo non conforme : encodez-la avec ffmpeg' : 'Remplacement impossible')
  }
  finally { replacing.active = false }
}

// Sous-titres VTT (accessibilité)
const vttInput = ref<HTMLInputElement>()
async function onVtt(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  try {
    await directUpload({ documentId: id, variant: 'captions', blob: f, filename: f.name, mime: 'text/vtt' })
    notify.ok('Sous-titres enregistrés')
    await refresh()
  }
  catch (err) { notify.fail(err, 'Sous-titres refusés') }
}
</script>

<template>
  <AdminPage :title="doc?.title ?? 'Document'">
    <template #actions>
      <UButton v-if="doc?.status === 'published'" :to="`/document/${id}`" target="_blank" icon="i-lucide-external-link" label="Voir sur le site" color="neutral" variant="ghost" class="hidden sm:inline-flex" />
    </template>

    <UButton to="/admin/documents" icon="i-lucide-arrow-left" label="Documents" color="neutral" variant="link" class="px-0" />

    <UAlert v-if="error" color="error" icon="i-lucide-file-x" title="Document introuvable" :description="apiError(error)" />

    <template v-else-if="doc">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :color="STATUS_COLORS[doc.status]" variant="outline" size="lg">
          {{ STATUS_LABELS[doc.status] }}
        </UBadge>
        <UBadge :color="VISIBILITY_COLORS[doc.visibility]" variant="outline" size="lg">
          {{ VISIBILITY_LABELS[doc.visibility] }}
        </UBadge>
        <UBadge color="neutral" variant="outline" size="lg" :icon="KIND_ICONS[doc.kind]">
          {{ KIND_LABELS[doc.kind] }}
        </UBadge>
        <div class="ms-auto flex flex-wrap gap-2">
          <template v-if="can('editor')">
            <UButton v-if="doc.status === 'draft'" label="Publier" icon="i-lucide-send" color="neutral" :disabled="!doc.hasFile && !doc.streamUid" @click="setPublished(true)" />
            <UButton v-else-if="doc.status === 'published'" label="Dépublier" icon="i-lucide-eye-off" color="neutral" variant="outline" @click="setPublished(false)" />
          </template>
          <UButton label="Corbeille" icon="i-lucide-trash-2" color="error" variant="soft" :disabled="readonly" @click="trash" />
        </div>
      </div>
      <UAlert v-if="readonly" color="info" variant="outline" icon="i-lucide-lock" title="Document publié" description="Un contributeur ne modifie pas un document publié : demandez à un éditeur." />
      <UAlert v-if="!doc.hasFile && !doc.streamUid" color="warning" variant="outline" icon="i-lucide-file-x" title="Aucun fichier" description="Téléversez le fichier ci-dessous avant de publier." />

      <div class="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <form class="space-y-4" @submit.prevent="save">
          <fieldset :disabled="readonly" class="space-y-4">
            <UFormField label="Titre" required>
              <UInput v-model="form.title" class="w-full" />
            </UFormField>
            <UFormField label="Description">
              <UTextarea v-model="form.description" :rows="4" autoresize class="w-full" />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Année">
                <USelect v-model="form.year" :items="yearItems" class="w-full" />
              </UFormField>
              <UFormField label="Événement">
                <USelect v-model="form.eventId" :items="eventItems" class="w-full" />
              </UFormField>
              <UFormField label="Branche">
                <USelect v-model="form.branch" :items="branchItems" class="w-full" />
              </UFormField>
              <UFormField label="Date">
                <UInput v-model="form.date" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Lieu">
                <UInput v-model="form.place" class="w-full" placeholder="Jambville" />
              </UFormField>
              <UFormField label="Crédits" help="Ex. « montage : Camille »">
                <UInput v-model="form.credits" class="w-full" />
              </UFormField>
            </div>
            <UFormField v-if="site?.peopleField" label="Personnes" help="Champ activé par l'instance (L-03). N'identifiez personne sans accord.">
              <UTextarea v-model="form.people" :rows="2" class="w-full" />
            </UFormField>
            <UFormField label="Mots-clés">
              <UInputTags v-model="form.tags" placeholder="Ajouter un mot-clé" class="w-full" />
            </UFormField>

            <UFormField label="Visibilité" :help="!can('editor') ? 'Seul un éditeur change la visibilité.' : undefined">
              <URadioGroup v-model="form.visibility" :items="visibilityItems" :disabled="!can('editor')" />
            </UFormField>
            <div v-if="can('editor')" class="flex flex-wrap gap-2">
              <span class="text-sm text-muted">Retrait rapide (L-02) :</span>
              <UButton label="Retirer (toujours protégé)" icon="i-lucide-shield" size="xs" color="warning" variant="outline" :disabled="doc.visibility === 'forcePrivate'" @click="takedown('forcePrivate')" />
              <UButton label="Masquer" icon="i-lucide-eye-off" size="xs" color="error" variant="outline" :disabled="doc.visibility === 'hidden'" @click="takedown('hidden')" />
            </div>

            <UFormField
              label="Téléchargement"
              :help="isProtected ? 'Interdit : ce document est réservé aux familles (année protégée ou toujours protégé). Aucune exception possible (F-08).' : 'Pour les années publiques uniquement.'"
            >
              <USelect v-model="form.downloadable" :items="downloadItems" :disabled="isProtected" class="w-full sm:w-80" />
            </UFormField>

            <div v-if="doc.kind === 'video' || doc.kind === 'audio'" class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium">
                  Chapitres
                </p>
                <UButton label="Ajouter" icon="i-lucide-plus" size="xs" variant="ghost" @click="form.chapters.push({ start: '0:00', title: '' })" />
              </div>
              <p v-if="!form.chapters.length" class="text-xs text-muted">
                Aucun chapitre. Début au format min:s (ex. 12:30).
              </p>
              <div v-for="(c, n) in form.chapters" :key="n" class="flex gap-2">
                <UInput v-model="c.start" class="w-24" :aria-label="`Début du chapitre ${n + 1}`" placeholder="0:00" />
                <UInput v-model="c.title" class="flex-1" :aria-label="`Titre du chapitre ${n + 1}`" placeholder="Titre" />
                <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Supprimer le chapitre ${n + 1}`" @click="form.chapters.splice(n, 1)" />
              </div>
            </div>
          </fieldset>

          <div class="sticky bottom-0 flex justify-end gap-2 border-t border-default bg-default/95 py-3 backdrop-blur">
            <UButton label="Annuler les modifications" color="neutral" variant="ghost" :disabled="readonly" @click="load(doc)" />
            <UButton type="submit" label="Enregistrer" icon="i-lucide-save" :loading="saving" :disabled="readonly || !form.title.trim()" />
          </div>
        </form>

        <div class="space-y-4">
          <AdminSection title="Aperçu">
            <video v-if="doc.kind === 'video' && doc.mainUrl" :src="doc.mainUrl" controls preload="metadata" :poster="doc.thumbUrl ?? undefined" class="aspect-video w-full bg-black">
              <track v-if="doc.captionsUrl" kind="captions" :src="doc.captionsUrl" srclang="fr" label="Français">
            </video>
            <img v-else-if="doc.kind === 'photo' && doc.mainUrl" :src="doc.mainUrl" :alt="doc.title" class="w-full">
            <audio v-else-if="doc.kind === 'audio' && doc.mainUrl" :src="doc.mainUrl" controls class="w-full" />
            <div v-else-if="doc.kind === 'pdf' && doc.mainUrl" class="space-y-2">
              <img v-if="doc.thumbUrl" :src="doc.thumbUrl" alt="Première page" class="w-full border border-default">
              <UButton :to="doc.mainUrl" target="_blank" label="Ouvrir le PDF" icon="i-lucide-file-text" variant="outline" />
            </div>
            <p v-else class="text-sm text-muted">
              Aucun fichier.
            </p>
            <dl class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
              <div v-if="doc.size">
                <dt>Poids</dt><dd class="text-default">
                  {{ formatBytes(doc.size) }}
                </dd>
              </div>
              <div v-if="doc.duration">
                <dt>Durée</dt><dd class="text-default">
                  {{ formatDuration(doc.duration) }}
                </dd>
              </div>
              <div v-if="doc.width">
                <dt>Dimensions</dt><dd class="text-default">
                  {{ doc.width }}×{{ doc.height }}
                </dd>
              </div>
              <div v-if="doc.mime">
                <dt>Format</dt><dd class="text-default">
                  {{ doc.mime }}
                </dd>
              </div>
              <div>
                <dt>Créé</dt><dd class="text-default">
                  {{ adminDate(doc.createdAt, true) }}
                </dd>
              </div>
              <div v-if="doc.publishedAt">
                <dt>Publié</dt><dd class="text-default">
                  {{ adminDate(doc.publishedAt, true) }}
                </dd>
              </div>
            </dl>
          </AdminSection>

          <AdminSection title="Fichiers">
            <div class="space-y-3">
              <div v-if="replacing.active" class="space-y-1">
                <p class="text-sm">
                  {{ replacing.stage }} {{ Math.round(replacing.progress * 100) }} %
                </p>
                <UProgress :model-value="Math.round(replacing.progress * 100)" size="sm" />
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton :label="doc.hasFile ? 'Remplacer le fichier' : 'Téléverser le fichier'" icon="i-lucide-file-up" size="sm" variant="outline" :disabled="readonly || replacing.active" @click="replaceInput?.click()" />
                <UButton v-if="doc.originalUrl" :to="doc.originalUrl" target="_blank" external label="Télécharger l'original" icon="i-lucide-download" size="sm" color="neutral" variant="ghost" />
                <template v-if="doc.kind === 'video'">
                  <UButton :label="doc.hasCaptions ? 'Remplacer les sous-titres' : 'Sous-titres (VTT)'" icon="i-lucide-captions" size="sm" color="neutral" variant="outline" :disabled="readonly" @click="vttInput?.click()" />
                </template>
              </div>
              <input ref="replaceInput" type="file" class="sr-only" aria-label="Fichier principal" @change="onReplace">
              <input ref="vttInput" type="file" accept=".vtt,text/vtt" class="sr-only" aria-label="Sous-titres VTT" @change="onVtt">
            </div>
          </AdminSection>

          <AdminSection title="Vignette">
            <AdminThumbPicker
              :key="doc.updatedAt"
              :document-id="doc.id"
              :video-url="doc.kind === 'video' ? doc.mainUrl : null"
              :duration="doc.duration"
              :thumb-url="doc.thumbUrl"
              @done="refresh()"
            />
          </AdminSection>

          <AdminSection title="Cloudflare Stream" v-if="doc.kind === 'video' && settings?.settings.streamEnabled">
            <AdminStreamUpload :document-id="doc.id" :stream-uid="doc.streamUid" @done="refresh()" />
          </AdminSection>
        </div>
      </div>
    </template>
  </AdminPage>
</template>
