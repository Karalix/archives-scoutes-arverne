<script setup lang="ts">
// A-02 / A-03 / D-05 : comptes administrateurs, invitations et liens de réinitialisation
definePageMeta({ layout: 'admin', middleware: 'admin', minRole: 'owner' })
useHead({ title: 'Administrateurs' })

interface User { id: string, email: string, name: string, role: AdminRole, disabledAt: number | null, createdAt: number, lastLoginAt: number | null }
interface Invite { id: string, email: string | null, name: string | null, role: AdminRole | null, createdAt: number, expiresAt: number }

const notify = useNotify()
const confirm = useConfirm()
const { user: me } = useAdmin()
const { data, pending, refresh } = await useFetch<{ users: User[], invites: Invite[] }>('/api/admin/users')

const owners = computed(() => data.value?.users.filter(u => u.role === 'owner' && !u.disabledAt).length ?? 0)
const roleItems = (['owner', 'editor', 'contributor'] as AdminRole[]).map(r => ({ label: ROLE_LABELS[r]!, value: r }))
const ROLE_HELP: Record<AdminRole, string> = {
  owner: 'Tout, y compris paramètres techniques, administrateurs, stockage et export.',
  editor: 'Contenus, publication, mots de passe des familles, signalements.',
  contributor: 'Téléverse et prépare des brouillons ; un éditeur publie.',
}

const inviteOpen = ref(false)
const invite = reactive({ email: '', name: '', role: 'editor' as AdminRole })
const link = ref<{ url: string, expiresAt: number, title: string } | null>(null)
const busy = ref(false)

async function createInvite() {
  busy.value = true
  try {
    const r = await $fetch<{ url: string, expiresAt: number }>('/api/admin/invites', {
      method: 'POST',
      body: { email: invite.email.trim() || undefined, name: invite.name.trim() || undefined, role: invite.role },
    })
    link.value = { ...r, title: `Lien d'invitation (${ROLE_LABELS[invite.role]})` }
    inviteOpen.value = false
    Object.assign(invite, { email: '', name: '', role: 'editor' })
    await refresh()
  }
  catch (e) { notify.fail(e) }
  finally { busy.value = false }
}

async function cancelInvite(i: Invite) {
  if (!(await confirm({ title: 'Annuler cette invitation ?', description: 'Le lien ne fonctionnera plus.', confirmLabel: 'Annuler l\'invitation' }))) return
  try {
    await $fetch(`/api/admin/invites/${i.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) { notify.fail(e) }
}

async function act(u: User, body: Record<string, unknown>, ok: string) {
  try {
    const r = await $fetch<{ url?: string, expiresAt?: number }>(`/api/admin/users/${u.id}`, { method: 'POST', body })
    if (r.url) link.value = { url: r.url, expiresAt: r.expiresAt!, title: `Lien de réinitialisation pour ${u.name}` }
    else notify.ok(ok)
    await refresh()
  }
  catch (e) { notify.fail(e) }
}

async function setRole(u: User, role: AdminRole) {
  if (role === u.role) return
  if (!(await confirm({ title: `Passer ${u.name} en ${ROLE_LABELS[role]} ?`, description: `${ROLE_HELP[role]} Ses sessions en cours sont fermées.`, confirmLabel: 'Changer le rôle', color: 'warning' }))) return
  await act(u, { action: 'role', role }, 'Rôle modifié')
}

async function disable(u: User) {
  if (!(await confirm({ title: `Désactiver ${u.name} ?`, description: 'Ses sessions et ses jetons d\'API sont révoqués immédiatement.', confirmLabel: 'Désactiver' }))) return
  await act(u, { action: 'disable' }, 'Compte désactivé')
}

async function revokeSessions(u: User) {
  if (!(await confirm({ title: `Fermer les sessions de ${u.name} ?`, description: 'Il devra se reconnecter sur tous ses appareils.', confirmLabel: 'Fermer les sessions', color: 'warning' }))) return
  await act(u, { action: 'revokeSessions' }, 'Sessions fermées')
}

const menu = (u: User) => [
  [
    { label: 'Lien de réinitialisation', icon: 'i-lucide-key', onSelect: () => act(u, { action: 'resetLink' }, '') },
    { label: 'Fermer les sessions', icon: 'i-lucide-log-out', onSelect: () => revokeSessions(u) },
  ],
  [
    u.disabledAt
      ? { label: 'Réactiver', icon: 'i-lucide-user-check', onSelect: () => act(u, { action: 'enable' }, 'Compte réactivé') }
      : { label: 'Désactiver', icon: 'i-lucide-user-x', color: 'error' as const, onSelect: () => disable(u) },
  ],
]
</script>

<template>
  <AdminPage title="Administrateurs">
    <template #actions>
      <UButton icon="i-lucide-user-plus" label="Inviter" @click="inviteOpen = true" />
    </template>

    <UAlert
      v-if="data && owners < 2"
      color="warning"
      variant="outline"
      icon="i-lucide-users"
      title="Un seul propriétaire actif"
      description="Prévoyez au moins deux propriétaires, et des comptes Cloudflare et GitHub au nom d'une adresse du groupe, jamais d'un seul chef appelé à partir (D-05)."
    />

    <div v-if="link" class="border border-accented p-5">
      <div class="space-y-3">
        <AdminSecretBox
          :value="link.url"
          :label="link.title"
          :help="`À usage unique, valable jusqu'au ${adminDate(link.expiresAt, true)}. L'application n'envoie aucun e-mail : transmettez ce lien par le canal de votre choix (messagerie, SMS…).`"
        />
        <UButton label="Fermer" size="sm" color="neutral" variant="outline" @click="link = null" />
      </div>
    </div>

    <div class="divide-y divide-default border-y border-default">
      <div v-if="pending && !data" class="p-4">
        <USkeleton class="h-12" />
      </div>
      <div v-for="u in data?.users ?? []" :key="u.id" class="flex flex-wrap items-center gap-3 p-3" :class="u.disabledAt ? 'opacity-60' : ''">
        <UAvatar :alt="u.name" />
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            {{ u.name }}
            <UBadge v-if="u.id === me?.id" size="sm" variant="outline" class="ms-1">
              vous
            </UBadge>
            <UBadge v-if="u.disabledAt" size="sm" color="error" variant="outline" class="ms-1">
              désactivé
            </UBadge>
          </p>
          <p class="truncate text-sm text-muted">
            {{ u.email }} · dernière connexion : {{ adminDate(u.lastLoginAt, true) }}
          </p>
        </div>
        <USelect
          :model-value="u.role"
          :items="roleItems"
          class="w-40"
          :aria-label="`Rôle de ${u.name}`"
          :disabled="!!u.disabledAt"
          @update:model-value="v => setRole(u, v as AdminRole)"
        />
        <UDropdownMenu :items="menu(u)">
          <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" :aria-label="`Actions pour ${u.name}`" />
        </UDropdownMenu>
      </div>
    </div>

    <div v-if="data?.invites.length" class="space-y-2">
      <h2 class="text-xs tracking-[0.2em] text-muted uppercase">
        Invitations en attente
      </h2>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="i in data.invites" :key="i.id" class="flex flex-wrap items-center gap-3 p-3">
          <UIcon name="i-lucide-mail" class="size-5 text-muted" />
          <div class="min-w-0 flex-1 text-sm">
            <p class="font-medium">
              {{ i.name || i.email || 'Invitation sans nom' }} · {{ ROLE_LABELS[i.role ?? 'contributor'] }}
            </p>
            <p class="text-muted">
              Expire le {{ adminDate(i.expiresAt, true) }}
            </p>
          </div>
          <UButton label="Annuler" icon="i-lucide-x" size="xs" color="error" variant="ghost" @click="cancelInvite(i)" />
        </li>
      </ul>
    </div>

    <UModal v-model:open="inviteOpen" title="Inviter un administrateur" description="Un lien à usage unique, valable 7 jours, à transmettre vous-même.">
      <template #body>
        <form id="invite-form" class="space-y-4" @submit.prevent="createInvite">
          <UFormField label="Nom (facultatif)">
            <UInput v-model="invite.name" class="w-full" />
          </UFormField>
          <UFormField label="E-mail (facultatif)" help="Sinon, la personne choisira son identifiant.">
            <UInput v-model="invite.email" type="email" class="w-full" />
          </UFormField>
          <UFormField label="Rôle" :help="ROLE_HELP[invite.role]">
            <USelect v-model="invite.role" :items="roleItems" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="inviteOpen = false" />
          <UButton type="submit" form="invite-form" label="Créer le lien" :loading="busy" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
