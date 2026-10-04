<script setup lang="ts">
import type { AdminYear } from '~/composables/useAdmin'

// A-12 / A-13 : identité, pivot, taxonomie ; réglages techniques réservés aux propriétaires (D-07, V-04, S-04)
definePageMeta({ layout: 'admin', middleware: 'admin', minRole: 'editor' })
useHead({ title: 'Paramètres' })

interface Settings {
  name: string
  primaryColor: string
  intro: string
  legal: string
  privacy: string
  contactEmail: string
  logoKey: string | null
  pivotMode: 'fixed' | 'sliding'
  pivotYear: number
  pivotOffset: number
  switchMonth: number
  branches: { key: string, label: string, color?: string }[]
  eventTypes: string[]
  settings: {
    publicDownloads: boolean
    keepOriginals: boolean
    quotaBytes: number
    familySessionDays: number
    takedownDelayDays: number
    peopleField: boolean
    streamEnabled: boolean
    streamAccountId?: string
    streamApiTokenSet: boolean
    statsEnabled: boolean
  }
  effectivePivot: number
  currentScoutYear: number
}

const notify = useNotify()
const confirm = useConfirm()
const { can } = useAdmin()
const { data, refresh } = await useFetch<Settings>('/api/admin/settings', { key: 'admin-settings' })
const { data: years } = await useFetch<AdminYear[]>('/api/v1/years', { key: 'admin-years' })
const { data: site } = await useSite()

const f = reactive({
  name: '', primaryColor: '#2f7d32', intro: '', legal: '', privacy: '', contactEmail: '',
  pivotMode: 'sliding' as 'fixed' | 'sliding', pivotYear: 2015, pivotOffset: 10, switchMonth: 9,
  branches: [] as { key: string, label: string, color: string }[],
  eventTypes: [] as string[],
  publicDownloads: false, familySessionDays: 30, takedownDelayDays: 7, peopleField: false, statsEnabled: true,
  keepOriginals: false, quotaGb: 50, streamEnabled: false, streamAccountId: '', streamApiToken: '',
})

function load(s: Settings) {
  Object.assign(f, {
    name: s.name, primaryColor: s.primaryColor, intro: s.intro, legal: s.legal, privacy: s.privacy, contactEmail: s.contactEmail,
    pivotMode: s.pivotMode, pivotYear: s.pivotYear, pivotOffset: s.pivotOffset, switchMonth: s.switchMonth,
    branches: s.branches.map(b => ({ key: b.key, label: b.label, color: b.color ?? '#888888' })),
    eventTypes: [...s.eventTypes],
    publicDownloads: s.settings.publicDownloads, familySessionDays: s.settings.familySessionDays, takedownDelayDays: s.settings.takedownDelayDays,
    peopleField: s.settings.peopleField, statsEnabled: s.settings.statsEnabled,
    keepOriginals: s.settings.keepOriginals, quotaGb: Math.round(s.settings.quotaBytes / 1024 ** 3 * 10) / 10,
    streamEnabled: s.settings.streamEnabled, streamAccountId: s.settings.streamAccountId ?? '', streamApiToken: '',
  })
}
watch(data, s => s && load(s), { immediate: true })

const monthItems = MONTHS_FR.map((m, i) => ({ label: m.charAt(0).toUpperCase() + m.slice(1), value: i + 1 }))
const modeItems = [
  { label: 'Glissant', value: 'sliding', description: 'Pivot = année scoute en cours − N : il avance seul à chaque rentrée (recommandé).' },
  { label: 'Fixe', value: 'fixed', description: 'Vous avancez vous-même l\'année pivot à chaque rentrée.' },
]

const previewPivot = computed(() => effectivePivot({ pivotMode: f.pivotMode, pivotYear: f.pivotYear, pivotOffset: f.pivotOffset, switchMonth: f.switchMonth }, new Date()))
const pivotChanged = computed(() => !!data.value && previewPivot.value !== data.value.effectivePivot)
const yearsPreview = computed(() => (years.value ?? []).map(y => ({ label: y.label, public: y.startYear <= previewPivot.value, changed: (y.startYear <= previewPivot.value) !== y.public })))
const introHtml = computed(() => miniMarkdown(f.intro))

const saving = ref(false)
async function save() {
  if (!data.value) return
  if (pivotChanged.value && !(await confirm({
    title: 'Changer l\'année pivot ?',
    description: `L'accès change immédiatement : les années jusqu'à ${scoutYearLabel(previewPivot.value)} seront publiques, les suivantes protégées par mot de passe (R-04). Aucun fichier n'est déplacé.`,
    confirmLabel: 'Appliquer',
    color: 'warning',
  }))) return
  const settings: Record<string, unknown> = {
    publicDownloads: f.publicDownloads, familySessionDays: f.familySessionDays, takedownDelayDays: f.takedownDelayDays,
    peopleField: f.peopleField, statsEnabled: f.statsEnabled,
  }
  if (can('owner')) {
    Object.assign(settings, {
      keepOriginals: f.keepOriginals, quotaBytes: Math.round(f.quotaGb * 1024 ** 3),
      streamEnabled: f.streamEnabled, streamAccountId: f.streamAccountId.trim(),
    })
    if (f.streamApiToken.trim()) settings.streamApiToken = f.streamApiToken.trim()
  }
  saving.value = true
  try {
    await $fetch('/api/admin/settings', {
      method: 'PUT',
      body: {
        name: f.name.trim(), primaryColor: f.primaryColor, intro: f.intro, legal: f.legal, privacy: f.privacy, contactEmail: f.contactEmail.trim(),
        pivotMode: f.pivotMode, pivotYear: f.pivotYear, pivotOffset: f.pivotOffset, switchMonth: f.switchMonth,
        branches: f.branches.filter(b => b.key.trim() && b.label.trim()).map(b => ({ key: b.key.trim(), label: b.label.trim(), color: b.color })),
        eventTypes: f.eventTypes,
        settings,
      },
    })
    notify.ok('Paramètres enregistrés')
    await refresh()
    await refreshNuxtData(['site', 'admin-years', 'admin-dashboard'])
  }
  catch (e) { notify.fail(e, 'Enregistrement impossible') }
  finally { saving.value = false }
}

const logoInput = ref<HTMLInputElement>()
async function onLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    await $fetch('/api/admin/logo', { method: 'POST', body: fd })
    notify.ok('Logo mis à jour')
    await refreshNuxtData('site')
  }
  catch (err) { notify.fail(err, 'Logo refusé') }
}
</script>

<template>
  <AdminPage title="Paramètres">
    <template #actions>
      <UButton label="Enregistrer" icon="i-lucide-save" :loading="saving" :disabled="!data" @click="save" />
    </template>

    <div v-if="!data" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-40" />
    </div>

    <form v-else class="space-y-6" @submit.prevent="save">
      <AdminSection title="Identité du groupe">
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="Nom du groupe" required>
            <UInput v-model="f.name" class="w-full" />
          </UFormField>
          <UFormField label="E-mail de contact" help="Affiché dans les mentions ; aucun e-mail n'est envoyé par l'application.">
            <UInput v-model="f.contactEmail" type="email" class="w-full" />
          </UFormField>
          <UFormField label="Logo" help="PNG, JPEG ou WebP, 2 Mo maximum.">
            <div class="flex items-center gap-3">
              <img v-if="site?.logoUrl" :src="site.logoUrl" alt="Logo actuel" class="size-12 border border-default object-contain">
              <UButton label="Changer le logo" icon="i-lucide-image-up" color="neutral" variant="outline" @click="logoInput?.click()" />
              <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" aria-label="Logo" @change="onLogo">
            </div>
          </UFormField>
          <UFormField label="Couleur principale">
            <div class="flex items-center gap-2">
              <input v-model="f.primaryColor" type="color" aria-label="Couleur principale" class="h-9 w-12 cursor-pointer border border-default bg-transparent">
              <UInput v-model="f.primaryColor" class="w-28" />
            </div>
          </UFormField>
          <UFormField label="Texte d'accueil" help="Markdown court : **gras**, *italique*, [lien](https://…), paragraphes séparés par une ligne vide." class="md:col-span-2">
            <div class="grid gap-3 md:grid-cols-2">
              <UTextarea v-model="f.intro" :rows="6" class="w-full" />
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="prose-lite border border-dashed border-default p-3 text-sm" aria-label="Aperçu" v-html="introHtml || '<p class=&quot;text-muted&quot;>Aperçu</p>'" />
            </div>
          </UFormField>
          <UFormField label="Mentions légales" class="md:col-span-2">
            <UTextarea v-model="f.legal" :rows="5" autoresize class="w-full" />
          </UFormField>
          <UFormField label="Politique de confidentialité" class="md:col-span-2">
            <UTextarea v-model="f.privacy" :rows="5" autoresize class="w-full" />
          </UFormField>
        </div>
      </AdminSection>

      <AdminSection title="Année pivot et accès">
        <div class="space-y-4">
          <URadioGroup v-model="f.pivotMode" :items="modeItems" legend="Mode" />
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField v-if="f.pivotMode === 'sliding'" label="Ancienneté N (années)" help="10 ans par défaut, pour que les jeunes visibles soient majeurs (L-01).">
              <UInputNumber v-model="f.pivotOffset" :min="0" :max="50" class="w-32" />
            </UFormField>
            <UFormField v-else label="Année pivot (année de début)" :help="scoutYearLabel(f.pivotYear)">
              <UInputNumber v-model="f.pivotYear" :min="1900" :max="2200" :format-options="{ useGrouping: false }" class="w-36" />
            </UFormField>
            <UFormField label="Mois de bascule" help="Début de l'année scoute.">
              <USelect v-model="f.switchMonth" :items="monthItems" class="w-40" />
            </UFormField>
          </div>
          <UAlert
            :color="pivotChanged ? 'warning' : 'info'"
            variant="outline"
            :icon="pivotChanged ? 'i-lucide-triangle-alert' : 'i-lucide-info'"
            :title="`Pivot effectif : ${scoutYearLabel(previewPivot)}`"
            :description="pivotChanged
              ? `Changement en attente (actuellement ${scoutYearLabel(data.effectivePivot)}) : il prend effet immédiatement à l'enregistrement, sans déplacer de fichier (R-04).`
              : `Les années jusqu'à ${scoutYearLabel(previewPivot)} sont publiques ; les suivantes demandent le mot de passe des familles.`"
          />
          <div v-if="yearsPreview.length" class="flex flex-wrap gap-1">
            <UBadge
              v-for="y in yearsPreview"
              :key="y.label"
              :color="y.public ? 'success' : 'warning'"
              :variant="y.changed ? 'solid' : 'subtle'"
              :icon="y.public ? 'i-lucide-globe' : 'i-lucide-lock'"
            >
              {{ y.label }}
            </UBadge>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Durée de session des familles (jours)" help="Après saisie du mot de passe (R-09).">
              <UInputNumber v-model="f.familySessionDays" :min="1" :max="365" class="w-32" />
            </UFormField>
            <UFormField label="Délai de traitement des retraits (jours)" help="Affiché dans les mentions (L-02).">
              <UInputNumber v-model="f.takedownDelayDays" :min="1" :max="60" class="w-32" />
            </UFormField>
          </div>
          <USwitch v-model="f.publicDownloads" label="Autoriser le téléchargement des documents des années publiques" description="Jamais pour les années protégées (F-08). Surchargeable document par document." />
          <USwitch v-model="f.peopleField" label="Activer le champ « personnes »" description="Désactivé par défaut : pas d'identification nominative dans les métadonnées (L-03)." />
          <USwitch v-model="f.statsEnabled" label="Statistiques de consultation" description="Agrégées côté serveur, sans cookie ni traceur (L-06)." />
        </div>
      </AdminSection>

      <AdminSection title="Branches">
        <template #actions>
          <UButton label="Ajouter" icon="i-lucide-plus" size="xs" variant="outline" @click="f.branches.push({ key: '', label: '', color: '#888888' })" />
        </template>
        <p class="mb-3 text-sm text-muted">
          Le code court sert dans les noms de fichiers (ex. 2019_camp-ete_<strong>SG</strong>_montage.mp4). Changer un code ne modifie pas les documents existants.
        </p>
        <div class="space-y-2">
          <div v-for="(b, n) in f.branches" :key="n" class="flex items-center gap-2">
            <UInput v-model="b.key" class="w-20" placeholder="SG" :aria-label="`Code de la branche ${n + 1}`" />
            <UInput v-model="b.label" class="flex-1" placeholder="Scouts-Guides" :aria-label="`Nom de la branche ${n + 1}`" />
            <input v-model="b.color" type="color" :aria-label="`Couleur de la branche ${n + 1}`" class="h-8 w-10 shrink-0 cursor-pointer border border-default bg-transparent">
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Supprimer la branche ${n + 1}`" :disabled="f.branches.length <= 1" @click="f.branches.splice(n, 1)" />
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Types d'événements">
        <UInputTags v-model="f.eventTypes" placeholder="Ajouter un type" class="w-full" />
      </AdminSection>

      <AdminSection title="Réglages techniques (propriétaires)" v-if="can('owner')">
        <div class="space-y-4">
          <USwitch v-model="f.keepOriginals" label="Conserver les originaux en ligne (V-04)" description="Préfixe jamais servi au public, téléchargeable par les administrateurs. Environ 1 $/mois pour 60 Go. Gardez de toute façon une copie hors ligne (V-05)." />
          <UFormField label="Quota de stockage (Go)" help="Alerte à 80 % ; 0 = sans quota (S-04).">
            <UInputNumber v-model="f.quotaGb" :min="0" :step="1" class="w-32" />
          </UFormField>
          <USeparator />
          <USwitch v-model="f.streamEnabled" label="Cloudflare Stream (option, D-07)" description="Encodage et diffusion HLS par Cloudflare, environ 5 $ / 1 000 min stockées + 1 $ / 1 000 min regardées." />
          <div v-if="f.streamEnabled" class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Identifiant du compte Cloudflare">
              <UInput v-model="f.streamAccountId" class="w-full" autocomplete="off" />
            </UFormField>
            <UFormField label="Jeton d'API Stream" :help="data.settings.streamApiTokenSet ? 'Un jeton est défini ; laissez vide pour le conserver.' : 'Jeton avec la permission « Stream : Edit ».'">
              <UInput v-model="f.streamApiToken" type="password" class="w-full" autocomplete="off" :placeholder="data.settings.streamApiTokenSet ? '•••••• (défini)' : ''" />
            </UFormField>
          </div>
        </div>
      </AdminSection>

      <div class="flex justify-end">
        <UButton type="submit" label="Enregistrer" icon="i-lucide-save" size="lg" :loading="saving" />
      </div>
    </form>
  </AdminPage>
</template>
