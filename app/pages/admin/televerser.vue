<script setup lang="ts">
import type { DocKind } from '#shared/utils/naming'
import type { AdminEvent, AdminYear } from '~/composables/useAdmin'
import type { ProcessedMedia } from '~/composables/useMediaProcessing'

// A-06 / A-08 / 6.3 : téléversement multiple, pré-rempli depuis le nom de fichier, encodage dans le navigateur, reprise
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Téléverser' })

type State = 'pending' | 'analyse' | 'encodage' | 'envoi' | 'done' | 'error'

interface Item {
  key: string
  file: File
  kind: DocKind | null
  year: number | null
  yearGuessed: boolean
  eventTitle: string
  branch: string
  title: string
  date: string | null
  state: State
  progress: number
  message: string
  ffmpeg: string | null
  documentId: string | null
  processed: ProcessedMedia | null
  resumable: boolean
}

const NONE = '__none'
const CONCURRENCY = 2
const route = useRoute()
const notify = useNotify()
const { can } = useAdmin()
const { data: site } = await useSite()
const { data: years, refresh: refreshYears } = await useFetch<AdminYear[]>('/api/v1/years', { key: 'admin-years' })
const { data: events, refresh: refreshEvents } = await useFetch<AdminEvent[]>('/api/v1/events', { key: 'admin-events-all' })
const { data: dash } = await useFetch<{ keepOriginals: boolean }>('/api/admin/dashboard', { key: 'admin-dashboard' })

const queryYear = Number(route.query.annee) || null
const currentYear = scoutYearOf(new Date(), site.value?.switchMonth ?? 9)
const items = ref<Item[]>([])
const running = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()

const branchItems = computed(() => [{ label: '—', value: NONE }, ...(site.value?.branches ?? []).map(b => ({ label: `${b.key} · ${b.label}`, value: b.key }))])
const extId = (f: File) => `upload:${f.name}:${f.size}:${f.lastModified}`

function suggestions(year: number | null) {
  const list = (events.value ?? []).filter(e => e.year === year).map(e => e.title)
  return [...new Set([...list, ...(site.value?.eventTypes ?? [])])]
}

function addFiles(list: FileList | File[] | null | undefined) {
  if (!list) return
  const known = new Set(items.value.map(i => i.key))
  for (const file of Array.from(list)) {
    const key = extId(file)
    if (known.has(key)) continue
    const g = parseFilename(file.name, { branches: site.value?.branches, eventTypes: site.value?.eventTypes, switchMonth: site.value?.switchMonth })
    const kind = kindFromFilename(file.name, file.type)
    const year = queryYear ?? g.scoutYear ?? currentYear
    items.value.push({
      key, file, kind,
      year,
      yearGuessed: !queryYear && g.scoutYear === undefined,
      eventTitle: g.eventType ?? '',
      branch: g.branch ?? NONE,
      title: g.title || file.name,
      date: g.date ?? null,
      state: kind ? 'pending' : 'error',
      progress: 0,
      message: kind ? '' : 'Type de fichier non pris en charge (vidéo, photo, PDF ou audio)',
      ffmpeg: null,
      documentId: null,
      processed: null,
      resumable: false,
    })
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  addFiles(e.dataTransfer?.files)
}
function onPick(e: Event) {
  addFiles((e.target as HTMLInputElement).files)
  ;(e.target as HTMLInputElement).value = ''
}
function remove(i: Item) {
  items.value = items.value.filter(x => x !== i)
}

// Application en lot sur les fichiers en attente
const bulk = reactive({ year: queryYear ?? currentYear, eventTitle: '', branch: NONE })
function applyBulk(field: 'year' | 'eventTitle' | 'branch') {
  for (const i of items.value) {
    if (i.state !== 'pending' && i.state !== 'error') continue
    if (field === 'year') { i.year = bulk.year; i.yearGuessed = false }
    else if (field === 'eventTitle') i.eventTitle = bulk.eventTitle
    else i.branch = bulk.branch
  }
}

// Années : création à la demande, une seule fois par année
const yearReady = new Map<number, Promise<unknown>>()
function ensureYear(y: number) {
  if ((years.value ?? []).some(x => x.startYear === y)) return Promise.resolve()
  if (!yearReady.has(y)) {
    yearReady.set(y, $fetch('/api/v1/years', { method: 'POST', body: { startYear: y } }).catch((e) => { yearReady.delete(y); throw e }))
  }
  return yearReady.get(y)!
}

function eventType(title: string) {
  const types = site.value?.eventTypes ?? []
  return types.find(t => slugify(t) === slugify(title)) ?? (types.includes('Autre') ? 'Autre' : undefined)
}

const STATE_LABEL: Record<State, string> = {
  pending: 'En attente', analyse: 'Analyse…', encodage: 'Encodage', envoi: 'Envoi', done: 'Terminé (brouillon)', error: 'Erreur',
}

function cacheMetaKey(i: Item) { return `encmeta:${i.key}` }

async function loadCachedEncoding(i: Item): Promise<ProcessedMedia | null> {
  try {
    const raw = localStorage.getItem(cacheMetaKey(i))
    if (!raw) return null
    const m = JSON.parse(raw) as Pick<ProcessedMedia, 'mainName' | 'meta' | 'mode' | 'note'>
    const blob = await encodedCacheGet(i.key)
    if (!blob) return null
    return { ...m, main: blob, mainMime: 'video/mp4', thumb: await videoThumbnail(blob) }
  }
  catch { return null }
}

async function processItem(i: Item) {
  i.message = ''
  i.ffmpeg = null
  i.progress = 0
  i.state = 'analyse'
  try {
    if (!i.kind) throw new Error('Type de fichier non pris en charge')
    if (!i.year) throw new Error('Année manquante')
    if (!i.title.trim()) throw new Error('Titre manquant')
    await ensureYear(i.year)

    const title = i.eventTitle.trim()
    const created = await $fetch<{ action: string, document: { id: string, hasFile: boolean } }>('/api/v1/documents', {
      method: 'POST',
      body: {
        year: i.year,
        kind: i.kind,
        title: i.title.trim(),
        branch: i.branch === NONE ? null : i.branch,
        date: i.date ?? undefined,
        event: title ? { title, type: eventType(title) } : null,
        externalId: i.key,
      },
    })
    i.documentId = created.document.id
    if (created.action === 'update' && created.document.hasFile && !i.processed) {
      i.state = 'done'
      i.progress = 1
      i.message = 'Déjà importé : métadonnées mises à jour'
      return
    }

    // Traitement du média (encodage vidéo, redimensionnement photo, vignette PDF…)
    if (!i.processed && i.kind === 'video') i.processed = await loadCachedEncoding(i)
    if (!i.processed) {
      i.processed = await processMedia(i.file, i.kind, {
        onStage: (stage, p) => { i.state = stage; i.progress = p ?? 0 },
      })
      if (i.kind === 'video' && i.processed.main !== i.file && i.processed.main.size > DIRECT_MAX) {
        await encodedCachePut(i.key, i.processed.main)
        try { localStorage.setItem(cacheMetaKey(i), JSON.stringify({ mainName: i.processed.mainName, meta: i.processed.meta, mode: i.processed.mode, note: i.processed.note })) }
        catch { /* facultatif */ }
      }
    }
    const p = i.processed
    const docId = i.documentId

    i.state = 'envoi'
    i.progress = 0
    i.resumable = true
    if (p.thumb) {
      await directUpload({ documentId: docId, variant: 'thumb', blob: p.thumb, filename: p.thumb.type === 'image/webp' ? 'vignette.webp' : 'vignette.jpg', mime: p.thumb.type })
    }
    const withOriginal = !!dash.value?.keepOriginals && p.main !== i.file
    const mainShare = withOriginal ? p.main.size / (p.main.size + i.file.size) : 1
    const r = await resumableUpload({
      documentId: docId, variant: 'main', blob: p.main, filename: p.mainName, mime: p.mainMime, meta: p.meta,
      onProgress: (f) => { i.progress = f * mainShare },
    })
    // V-04 : original conservé si l'instance le demande
    if (withOriginal) {
      await resumableUpload({
        documentId: docId, variant: 'original', blob: i.file, filename: i.file.name, mime: i.file.type || 'application/octet-stream',
        onProgress: (f) => { i.progress = mainShare + f * (1 - mainShare) },
      })
    }
    i.state = 'done'
    i.progress = 1
    i.resumable = false
    i.message = [p.note, ...(r?.warnings ?? []).filter(w => !w.startsWith('Aucune vignette') || !p.thumb)].filter(Boolean).join(' · ')
    if (i.kind === 'video') {
      await encodedCacheDelete(i.key)
      try { localStorage.removeItem(cacheMetaKey(i)) }
      catch { /* facultatif */ }
    }
  }
  catch (e) {
    i.state = 'error'
    const err = e as { status?: number, statusCode?: number, data?: Record<string, any>, message?: string }
    const status = err.status ?? err.statusCode
    if (err.data?.ffmpeg) {
      i.ffmpeg = String(err.data.ffmpeg)
      i.message = err.data.detail ?? 'Vidéo non conforme'
      i.processed = null
      i.resumable = false
    }
    else if (e instanceof UploadError || (status !== undefined && status !== 0)) {
      i.message = err.data?.detail ? apiError(e) : (err.message ?? 'Erreur')
      if (status && status >= 400 && status < 500) i.resumable = false
    }
    else {
      i.message = err.message || 'Erreur inattendue'
    }
    if (status === 0) i.message = 'Connexion interrompue : cliquez sur « Reprendre » quand le réseau revient (seules les parties manquantes seront renvoyées).'
  }
}

async function start(only?: Item) {
  if (running.value) return
  running.value = true
  const queue = only ? [only] : items.value.filter(i => i.state === 'pending' || i.state === 'error')
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await processItem(queue.shift()!)
    }))
  }
  finally {
    running.value = false
    yearReady.clear()
    await Promise.all([refreshYears(), refreshEvents()])
    refreshNuxtData('admin-dashboard')
  }
}

const done = computed(() => items.value.filter(i => i.state === 'done'))
const failed = computed(() => items.value.filter(i => i.state === 'error'))
const waiting = computed(() => items.value.filter(i => i.state === 'pending'))
const totalSize = computed(() => items.value.reduce((s, i) => s + i.file.size, 0))

const publishing = ref(false)
async function publishAll() {
  publishing.value = true
  try {
    const r = await $fetch<{ results: { id: string, ok: boolean, error?: string }[] }>('/api/v1/documents:publish', {
      method: 'POST', body: { ids: done.value.map(i => i.documentId).filter(Boolean) },
    })
    const ok = r.results.filter(x => x.ok).length
    notify.ok(`${ok} document${ok > 1 ? 's' : ''} publié${ok > 1 ? 's' : ''}`)
    const ko = r.results.filter(x => !x.ok)
    if (ko.length) notify.warn(`${ko.length} non publié${ko.length > 1 ? 's' : ''}`, ko.map(x => x.error).join(', '))
    items.value = items.value.filter(i => i.state !== 'done')
  }
  catch (e) { notify.fail(e) }
  finally { publishing.value = false }
}

function clearDone() {
  items.value = items.value.filter(i => i.state !== 'done')
}

const encoderInfo = ref<string | null>(null)
onMounted(() => {
  if (!webCodecsAvailable()) {
    encoderInfo.value = 'Ce navigateur ne propose pas WebCodecs : les vidéos seront envoyées telles quelles et refusées si elles ne sont pas déjà au format MP4 H.264 ≤ 1080p. Préférez Chrome, Edge ou Safari récent, ou l\'outil en ligne de commande.'
  }
  window.addEventListener('beforeunload', guard)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', guard))
function guard(e: BeforeUnloadEvent) {
  if (running.value) e.preventDefault()
}

const origin = import.meta.client ? window.location.origin : ''
const stateColor = (s: State) => s === 'done' ? 'success' : s === 'error' ? 'error' : s === 'pending' ? 'neutral' : 'info'
</script>

<template>
  <AdminPage title="Téléverser">
    <template #actions>
      <UButton to="/admin/documents?status=draft" label="Brouillons" icon="i-lucide-file-pen" color="neutral" variant="ghost" class="hidden sm:inline-flex" />
    </template>

    <div
      class="flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-colors"
      :class="dragging ? 'border-primary bg-primary/5' : 'border-accented'"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <UIcon name="i-lucide-cloud-upload" class="size-10 text-primary" />
      <p class="font-medium">
        Glissez-déposez vos vidéos, photos, PDF et fichiers audio ici
      </p>
      <p class="max-w-xl text-sm text-muted">
        L'année, l'événement et la branche sont devinés depuis le nom du fichier, par exemple <code class="rounded bg-elevated px-1">2019_camp-ete_SG_montage.mp4</code> (A-08). Les vidéos sont ré-encodées en 720p dans votre navigateur avant l'envoi.
      </p>
      <UButton label="Choisir des fichiers" icon="i-lucide-folder-open" @click="fileInput?.click()" />
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="video/*,image/*,application/pdf,audio/*,.mkv,.mts,.heic,.heif"
        class="sr-only"
        aria-label="Choisir des fichiers"
        @change="onPick"
      >
    </div>

    <UAlert v-if="encoderInfo" color="warning" variant="outline" icon="i-lucide-cpu" title="Encodage vidéo indisponible" :description="encoderInfo" />
    <UAlert
      color="neutral"
      variant="outline"
      icon="i-lucide-hard-drive-download"
      title="Gardez aussi une copie des originaux hors ligne (disque du groupe) : l'application n'est pas un système de sauvegarde (V-05)."
      :description="dash?.keepOriginals ? 'Cette instance conserve aussi les originaux en ligne (réservés aux administrateurs).' : undefined"
    />

    <template v-if="items.length">
      <div class="border-y border-default py-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Année pour tous">
            <div class="flex gap-1">
              <UInputNumber v-model="bulk.year" :min="1900" :max="2200" :format-options="{ useGrouping: false }" class="w-full" />
              <UButton icon="i-lucide-check-check" color="neutral" variant="outline" aria-label="Appliquer l'année à tous" @click="applyBulk('year')" />
            </div>
          </UFormField>
          <UFormField label="Événement pour tous">
            <div class="flex gap-1">
              <UInput v-model="bulk.eventTitle" list="ev-bulk" class="w-full" placeholder="Camp d'été" />
              <datalist id="ev-bulk">
                <option v-for="s in suggestions(bulk.year)" :key="s" :value="s" />
              </datalist>
              <UButton icon="i-lucide-check-check" color="neutral" variant="outline" aria-label="Appliquer l'événement à tous" @click="applyBulk('eventTitle')" />
            </div>
          </UFormField>
          <UFormField label="Branche pour tous">
            <div class="flex gap-1">
              <USelect v-model="bulk.branch" :items="branchItems" class="w-full" />
              <UButton icon="i-lucide-check-check" color="neutral" variant="outline" aria-label="Appliquer la branche à tous" @click="applyBulk('branch')" />
            </div>
          </UFormField>
        </div>
      </div>

      <ul class="space-y-2" aria-label="Fichiers à importer">
        <li v-for="i in items" :key="i.key" class="rounded-lg border border-default p-3">
          <div class="flex items-start gap-3">
            <UIcon :name="i.kind ? KIND_ICONS[i.kind]! : 'i-lucide-file-question'" class="mt-1 size-5 shrink-0 text-muted" />
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p class="min-w-0 truncate text-sm font-medium" :title="i.file.name">
                  {{ i.file.name }}
                </p>
                <span class="text-xs text-muted">{{ formatBytes(i.file.size) }}</span>
                <UBadge :color="stateColor(i.state)" variant="outline" class="ms-auto">
                  {{ STATE_LABEL[i.state] }}{{ (i.state === 'encodage' || i.state === 'envoi') ? ` ${Math.round(i.progress * 100)} %` : '' }}
                </UBadge>
              </div>

              <div v-if="i.state === 'pending' || i.state === 'error'" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-[7rem_1fr_9rem_1.5fr]">
                <UFormField :label="i.year ? scoutYearLabel(i.year) : 'Année'" :help="i.yearGuessed ? 'à vérifier' : undefined" size="xs">
                  <UInputNumber v-model="i.year" :min="1900" :max="2200" :format-options="{ useGrouping: false }" size="sm" class="w-full" @update:model-value="i.yearGuessed = false" />
                </UFormField>
                <UFormField label="Événement" size="xs">
                  <UInput v-model="i.eventTitle" :list="`ev-${i.key}`" size="sm" class="w-full" placeholder="(aucun)" />
                  <datalist :id="`ev-${i.key}`">
                    <option v-for="s in suggestions(i.year)" :key="s" :value="s" />
                  </datalist>
                </UFormField>
                <UFormField label="Branche" size="xs">
                  <USelect v-model="i.branch" :items="branchItems" size="sm" class="w-full" />
                </UFormField>
                <UFormField label="Titre" size="xs">
                  <UInput v-model="i.title" size="sm" class="w-full" />
                </UFormField>
              </div>
              <p v-else class="text-sm text-muted">
                {{ i.year ? scoutYearLabel(i.year) : '' }}{{ i.eventTitle ? ` · ${i.eventTitle}` : '' }}{{ i.branch !== NONE ? ` · ${branchLabel(site, i.branch)}` : '' }} · <strong class="text-default">{{ i.title }}</strong>
              </p>

              <UProgress v-if="i.state === 'encodage' || i.state === 'envoi'" :model-value="Math.round(i.progress * 100)" size="sm" :color="i.state === 'envoi' ? 'primary' : 'info'" />
              <UProgress v-else-if="i.state === 'analyse'" size="sm" />

              <p v-if="i.message" class="text-sm" :class="i.state === 'error' ? 'text-error' : 'text-muted'">
                {{ i.message }}
              </p>
              <div v-if="i.ffmpeg" class="space-y-2 bg-elevated p-3 text-sm">
                <p>Encodez la vidéo sur un ordinateur avec ffmpeg, puis déposez le fichier obtenu :</p>
                <AdminSecretBox :value="i.ffmpeg" />
                <p class="text-muted">
                  Pour de nombreux fichiers, l'outil en ligne de commande encode et importe tout un dossier :
                </p>
                <AdminSecretBox :value="`npx archives-scoutes import ./dossier --url ${origin} --token VOTRE_JETON`" help="Créez un jeton dans « Jetons d'API »." />
              </div>
              <div v-if="i.state === 'done' && i.documentId" class="flex gap-2">
                <UButton :to="`/admin/documents/${i.documentId}`" label="Modifier" icon="i-lucide-pencil" size="xs" variant="ghost" />
              </div>
            </div>
            <div class="flex shrink-0 flex-col gap-1">
              <UButton
                v-if="i.state === 'error' && i.kind"
                :label="i.resumable ? 'Reprendre' : 'Réessayer'"
                :icon="i.resumable ? 'i-lucide-play' : 'i-lucide-rotate-ccw'"
                size="xs"
                :disabled="running"
                @click="start(i)"
              />
              <UButton
                v-if="i.state === 'pending' || i.state === 'error' || i.state === 'done'"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="`Retirer ${i.file.name}`"
                @click="remove(i)"
              />
            </div>
          </div>
        </li>
      </ul>

      <div class="sticky bottom-0 flex flex-wrap items-center gap-2 border border-default bg-default/95 p-3 backdrop-blur">
        <p class="me-auto text-sm">
          {{ items.length }} fichier{{ items.length > 1 ? 's' : '' }} ({{ formatBytes(totalSize) }}) ·
          <span class="text-success">{{ done.length }} terminé{{ done.length > 1 ? 's' : '' }}</span>
          <template v-if="failed.length">
            · <span class="text-error">{{ failed.length }} en erreur</span>
          </template>
        </p>
        <UButton
          v-if="waiting.length || failed.length"
          :label="running ? 'Import en cours…' : `Importer ${waiting.length + failed.length} fichier${waiting.length + failed.length > 1 ? 's' : ''}`"
          icon="i-lucide-upload"
          :loading="running"
          @click="start()"
        />
        <template v-if="done.length && !running">
          <UButton to="/admin/documents?status=draft" label="Voir les brouillons" icon="i-lucide-file-pen" color="neutral" variant="outline" />
          <UButton v-if="can('editor')" label="Publier ces documents" icon="i-lucide-send" color="neutral" :loading="publishing" @click="publishAll" />
          <UButton label="Vider la liste" color="neutral" variant="ghost" @click="clearDone" />
        </template>
      </div>
      <p v-if="running" class="text-xs text-muted">
        Gardez cet onglet ouvert pendant l'encodage et l'envoi. En cas de coupure, l'envoi reprendra là où il s'était arrêté (même après un rechargement : redéposez le même fichier).
      </p>
    </template>
  </AdminPage>
</template>
