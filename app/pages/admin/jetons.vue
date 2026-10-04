<script setup lang="ts">
// I-01 à I-03 : jetons d'API personnels (REST /api/v1, MCP /mcp, CLI d'import)
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Jetons d\'API' })

type Scope = 'read' | 'write' | 'publish'
interface Token { id: string, name: string, prefix: string, scopes: Scope[], userId: string, userName: string, createdAt: number, expiresAt: number | null, revokedAt: number | null, lastUsedAt: number | null }

const notify = useNotify()
const confirm = useConfirm()
const { can, user } = useAdmin()
const { data: tokens, pending, refresh } = await useFetch<Token[]>('/api/admin/tokens')

const SCOPE_LABELS: Record<Scope, string> = { read: 'Lecture', write: 'Écriture (brouillons)', publish: 'Publication' }
const allowed = computed<Scope[]>(() => can('editor') ? ['read', 'write', 'publish'] : ['read', 'write'])
const form = reactive({ name: '', scopes: ['read', 'write'] as Scope[], days: 90 })
const createOpen = ref(false)
const busy = ref(false)
const created = ref<{ token: string, name: string, expiresAt: number } | null>(null)
const origin = import.meta.client ? window.location.origin : ''

async function create() {
  busy.value = true
  try {
    created.value = await $fetch<{ token: string, name: string, expiresAt: number }>('/api/admin/tokens', { method: 'POST', body: { name: form.name.trim(), scopes: form.scopes, days: form.days } })
    createOpen.value = false
    form.name = ''
    await refresh()
  }
  catch (e) { notify.fail(e) }
  finally { busy.value = false }
}

async function revoke(t: Token) {
  if (!(await confirm({ title: `Révoquer le jeton « ${t.name} » ?`, description: 'Les agents et scripts qui l\'utilisent perdront l\'accès immédiatement.', confirmLabel: 'Révoquer' }))) return
  try {
    await $fetch(`/api/admin/tokens/${t.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) { notify.fail(e) }
}

const snippets = computed(() => {
  const tok = created.value?.token ?? '<jeton>'
  return {
    mcp: `claude mcp add --transport http archives ${origin}/mcp --header "Authorization: Bearer ${tok}"`,
    curl: `curl -H "Authorization: Bearer ${tok}" ${origin}/api/v1/settings`,
    cli: `npx archives-scoutes import ./dossier --url ${origin} --token ${tok} --dry-run`,
  }
})
const status = (t: Token) => t.revokedAt ? { label: 'Révoqué', color: 'error' as const } : t.expiresAt && t.expiresAt < Date.now() ? { label: 'Expiré', color: 'neutral' as const } : { label: 'Actif', color: 'success' as const }
</script>

<template>
  <AdminPage title="Jetons d'API">
    <template #actions>
      <UButton icon="i-lucide-plus" label="Nouveau jeton" @click="createOpen = true" />
    </template>

    <p class="text-sm text-muted">
      Un jeton permet à un agent IA (via MCP), à un script ou à l'outil d'import en ligne de commande d'utiliser l'API. Il ne dépasse jamais votre rôle, n'accède jamais au pivot, aux mots de passe des familles ni aux administrateurs, et tout ce qu'il crée arrive en brouillon sauf portée « Publication ».
      Documentation : <a href="/api/v1/docs" target="_blank" class="text-primary underline">/api/v1/docs</a> · contrat <a href="/api/v1/openapi.json" target="_blank" class="text-primary underline">OpenAPI</a>.
    </p>

    <div v-if="created" class="border border-accented p-5">
      <div class="space-y-4">
        <UAlert color="success" variant="outline" icon="i-lucide-key" :title="`Jeton « ${created.name} » créé`" :description="`Affiché une seule fois. Expire le ${adminDate(created.expiresAt)}.`" />
        <AdminSecretBox :value="created.token" label="Jeton" />
        <AdminSecretBox :value="snippets.mcp" label="Claude Code (serveur MCP)" />
        <AdminSecretBox :value="snippets.curl" label="Test avec curl" />
        <AdminSecretBox :value="snippets.cli" label="Import d'un dossier (CLI, ffmpeg requis)" help="Retirez --dry-run après avoir vérifié le plan proposé." />
        <UButton label="J'ai copié le jeton" color="neutral" variant="outline" @click="created = null" />
      </div>
    </div>

    <UTable
      :data="tokens ?? []"
      :loading="pending"
      empty="Aucun jeton"
      :columns="[
        { accessorKey: 'name', header: 'Nom' },
        { accessorKey: 'scopes', header: 'Portées' },
        { accessorKey: 'lastUsedAt', header: 'Dernier usage' },
        { accessorKey: 'expiresAt', header: 'Expiration' },
        { id: 'status', header: 'État' },
        { id: 'actions', header: '' },
      ]"
      class="rounded-lg border border-default"
    >
      <template #name-cell="{ row }">
        <p class="font-medium">
          {{ row.original.name }}
        </p>
        <p class="text-xs text-muted">
          <code>{{ row.original.prefix }}…</code>{{ row.original.userId !== user?.id ? ` · ${row.original.userName}` : '' }}
        </p>
      </template>
      <template #scopes-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge v-for="s in row.original.scopes" :key="s" color="neutral" variant="outline" size="sm">
            {{ SCOPE_LABELS[s] }}
          </UBadge>
        </div>
      </template>
      <template #lastUsedAt-cell="{ row }">
        {{ adminDate(row.original.lastUsedAt, true) }}
      </template>
      <template #expiresAt-cell="{ row }">
        {{ adminDate(row.original.expiresAt) }}
      </template>
      <template #status-cell="{ row }">
        <UBadge :color="status(row.original).color" variant="outline">
          {{ status(row.original).label }}
        </UBadge>
      </template>
      <template #actions-cell="{ row }">
        <UButton v-if="!row.original.revokedAt" label="Révoquer" icon="i-lucide-ban" size="xs" color="error" variant="ghost" @click="revoke(row.original)" />
      </template>
    </UTable>

    <UModal v-model:open="createOpen" title="Nouveau jeton d'API">
      <template #body>
        <form id="token-form" class="space-y-4" @submit.prevent="create">
          <UFormField label="Nom" required help="Ex. « import camp 2024 » ; lettres, chiffres, espaces, . _ -">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Portées">
            <UCheckboxGroup
              v-model="form.scopes"
              :items="allowed.map(s => ({ label: SCOPE_LABELS[s], value: s }))"
            />
          </UFormField>
          <UFormField label="Validité (jours)">
            <UInputNumber v-model="form.days" :min="1" :max="365" class="w-32" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="createOpen = false" />
          <UButton type="submit" form="token-form" label="Créer" :loading="busy" :disabled="!form.name.trim() || !form.scopes.length" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
