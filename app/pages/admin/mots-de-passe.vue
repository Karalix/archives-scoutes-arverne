<script setup lang="ts">
// R-05 à R-08, R-11, A-14 : mots de passe annuels des familles
definePageMeta({ layout: 'admin', middleware: 'admin', minRole: 'editor' })
useHead({ title: 'Mots de passe' })

interface Pw { id: string, scoutYear: number, label: string, createdAt: number, createdBy: string | null, revokedAt: number | null, useCount: number, lastUsedAt: number | null }

const notify = useNotify()
const confirm = useConfirm()
const { data: site } = await useSite()
const { data: list, pending, refresh } = await useFetch<Pw[]>('/api/admin/passwords')

const current = scoutYearOf(new Date(), site.value?.switchMonth ?? 9)
const createOpen = ref(false)
const form = reactive({ scoutYear: current, password: '' })
const busy = ref(false)
const created = ref<{ password: string, scoutYear: number } | null>(null)
const shared = ref<{ url: string, expiresAt: number } | null>(null)

async function suggest() {
  try {
    form.password = (await $fetch<{ password: string }>('/api/admin/passwords/generate', { query: { year: form.scoutYear } })).password
  }
  catch (e) { notify.fail(e) }
}

async function openCreate() {
  form.scoutYear = current
  createOpen.value = true
  await suggest()
}

async function create() {
  busy.value = true
  try {
    created.value = await $fetch<{ password: string, scoutYear: number }>('/api/admin/passwords', { method: 'POST', body: { scoutYear: form.scoutYear, password: form.password.trim() || undefined } })
    createOpen.value = false
    await refresh()
    refreshNuxtData('admin-dashboard')
  }
  catch (e) { notify.fail(e) }
  finally { busy.value = false }
}

const origin = import.meta.client ? window.location.origin : ''
const message = computed(() => created.value
  ? `Bonjour,\n\nVoici le mot de passe des archives du groupe ${site.value?.name ?? ''} pour l'année ${scoutYearLabel(created.value.scoutYear)} : ${created.value.password}\n\nIl est valable pour les archives jusqu'à ${scoutYearLabel(created.value.scoutYear)} incluse. Adresse du site : ${origin}\n\nMerci de ne pas le diffuser en dehors des familles du groupe.\n`
  : '')

async function revoke(p: Pw) {
  if (!(await confirm({
    title: `Révoquer le mot de passe ${p.label} ?`,
    description: 'Il ne fonctionnera plus, et les sessions des familles ouvertes avec lui sont invalidées immédiatement. Pensez à distribuer un nouveau mot de passe.',
    confirmLabel: 'Révoquer',
  }))) return
  try {
    await $fetch(`/api/admin/passwords/${p.id}`, { method: 'POST', body: { action: 'revoke' } })
    notify.ok('Mot de passe révoqué')
    await refresh()
    refreshNuxtData('admin-dashboard')
  }
  catch (e) { notify.fail(e) }
}

const shareFor = ref<Pw | null>(null)
const shareDays = ref(30)
async function share() {
  if (!shareFor.value) return
  try {
    shared.value = await $fetch<{ url: string, expiresAt: number }>(`/api/admin/passwords/${shareFor.value.id}`, { method: 'POST', body: { action: 'share', days: shareDays.value } })
  }
  catch (e) { notify.fail(e) }
}
function openShare(p: Pw) {
  shareFor.value = p
  shared.value = null
}
</script>

<template>
  <AdminPage title="Mots de passe des familles">
    <template #actions>
      <UButton icon="i-lucide-plus" label="Nouveau mot de passe" @click="openCreate" />
    </template>

    <p class="text-sm text-muted">
      Chaque mot de passe est rattaché à une année scoute et ouvre toutes les années protégées jusqu'à celle-ci incluse (R-05). Une famille partie garde l'accès à ses années sans voir les suivantes. Les anciens mots de passe restent valides tant qu'ils ne sont pas révoqués.
    </p>

    <div v-if="created" class="border border-accented p-5">
      <div class="space-y-4">
        <UAlert color="success" variant="outline" icon="i-lucide-key-round" :title="`Mot de passe ${scoutYearLabel(created.scoutYear)} créé`" description="Il n'est affiché qu'une seule fois : copiez-le maintenant (seul son haché est conservé)." />
        <AdminSecretBox :value="created.password" label="Mot de passe" />
        <AdminSecretBox :value="message" label="Message type pour les familles" multiline />
        <UButton label="J'ai copié le mot de passe" color="neutral" variant="outline" @click="created = null" />
      </div>
    </div>

    <UTable
      :data="list ?? []"
      :loading="pending"
      empty="Aucun mot de passe : créez celui de l'année en cours."
      :columns="[
        { accessorKey: 'label', header: 'Année' },
        { accessorKey: 'createdAt', header: 'Créé le' },
        { accessorKey: 'useCount', header: 'Utilisations' },
        { accessorKey: 'lastUsedAt', header: 'Dernière utilisation' },
        { accessorKey: 'revokedAt', header: 'État' },
        { id: 'actions', header: '' },
      ]"
      class="rounded-lg border border-default"
    >
      <template #label-cell="{ row }">
        <span class="font-medium">{{ row.original.label }}</span>
      </template>
      <template #createdAt-cell="{ row }">
        {{ adminDate(row.original.createdAt) }}
      </template>
      <template #lastUsedAt-cell="{ row }">
        {{ adminDate(row.original.lastUsedAt, true) }}
      </template>
      <template #revokedAt-cell="{ row }">
        <UBadge v-if="row.original.revokedAt" color="error" variant="outline">
          Révoqué le {{ adminDate(row.original.revokedAt) }}
        </UBadge>
        <UBadge v-else color="success" variant="outline">
          Actif
        </UBadge>
      </template>
      <template #actions-cell="{ row }">
        <div v-if="!row.original.revokedAt" class="flex justify-end gap-1">
          <UButton label="Lien de partage" icon="i-lucide-link" size="xs" color="neutral" variant="ghost" @click="openShare(row.original)" />
          <UButton label="Révoquer" icon="i-lucide-ban" size="xs" color="error" variant="ghost" @click="revoke(row.original)" />
        </div>
      </template>
    </UTable>

    <UModal v-model:open="createOpen" title="Nouveau mot de passe des familles">
      <template #body>
        <form id="pw-form" class="space-y-4" @submit.prevent="create">
          <UFormField label="Année scoute" :help="`Ouvre les années protégées jusqu'à ${scoutYearLabel(form.scoutYear)} incluse.`">
            <UInputNumber v-model="form.scoutYear" :min="1900" :max="2200" :format-options="{ useGrouping: false }" class="w-40" />
          </UFormField>
          <UFormField label="Mot de passe" help="Proposition lisible (R-07), modifiable. 8 caractères minimum ; casse et accents ignorés.">
            <div class="flex gap-2">
              <UInput v-model="form.password" class="w-full font-mono" />
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" aria-label="Proposer un autre mot de passe" @click="suggest" />
            </div>
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="createOpen = false" />
          <UButton type="submit" form="pw-form" label="Créer" :loading="busy" :disabled="form.password.trim().length < 8" />
        </div>
      </template>
    </UModal>

    <UModal :open="!!shareFor" :title="`Lien de partage ${shareFor?.label ?? ''}`" description="Un lien signé qui ouvre l'accès sans saisir le mot de passe (R-11)." @update:open="v => { if (!v) shareFor = null }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Validité (jours)">
            <UInputNumber v-model="shareDays" :min="1" :max="365" class="w-32" />
          </UFormField>
          <AdminSecretBox v-if="shared" :value="shared.url" :help="`Valable jusqu'au ${adminDate(shared.expiresAt)}. Révoquer le mot de passe désactive aussi ce lien.`" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Fermer" color="neutral" variant="ghost" @click="shareFor = null" />
          <UButton label="Générer le lien" icon="i-lucide-link" @click="share" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
