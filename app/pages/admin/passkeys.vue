<script setup lang="ts">
// A-01 : passkeys (WebAuthn) du compte connecté
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Mes passkeys' })

const notify = useNotify()
const confirm = useConfirm()
const { user } = useAdmin()
const { register, isSupported } = useWebAuthn({
  authenticateEndpoint: '/api/admin/webauthn/authenticate',
  registerEndpoint: '/api/admin/webauthn/register',
})
const { data: keys, pending, refresh } = await useFetch<{ id: string, name: string, createdAt: number, backedUp: boolean }[]>('/api/admin/passkeys')
const busy = ref(false)

async function add() {
  if (!user.value) return
  busy.value = true
  try {
    await register({ userName: user.value.email, displayName: user.value.name })
    notify.ok('Passkey ajoutée', 'Vous pourrez vous connecter sans mot de passe.')
    await refresh()
  }
  catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'InvalidStateError') notify.warn('Cet appareil a déjà une passkey pour ce compte')
    else if (name !== 'NotAllowedError' && name !== 'AbortError') notify.fail(e, 'Ajout impossible')
  }
  finally { busy.value = false }
}

async function remove(id: string) {
  if (!(await confirm({ title: 'Supprimer cette passkey ?', description: 'Vous ne pourrez plus l\'utiliser pour vous connecter.', confirmLabel: 'Supprimer' }))) return
  try {
    await $fetch(`/api/admin/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) { notify.fail(e) }
}
</script>

<template>
  <AdminPage title="Mes passkeys">
    <template #actions>
      <UButton icon="i-lucide-fingerprint" label="Ajouter une passkey" :loading="busy" :disabled="!isSupported" @click="add" />
    </template>

    <p class="text-sm text-muted">
      Une passkey permet de se connecter avec l'empreinte, le visage ou le code de votre téléphone ou ordinateur, sans mot de passe. Ajoutez-en une par appareil.
    </p>
    <UAlert v-if="!isSupported" color="warning" variant="outline" icon="i-lucide-triangle-alert" title="Passkeys non prises en charge par ce navigateur" />

    <UEmpty v-if="!pending && !keys?.length" icon="i-lucide-fingerprint" title="Aucune passkey" description="Vous vous connectez pour l'instant avec votre e-mail et votre mot de passe." />
    <ul v-else class="divide-y divide-default border-y border-default">
      <li v-for="k in keys" :key="k.id" class="flex items-center gap-3 p-3">
        <UIcon name="i-lucide-key-round" class="size-5 text-muted" />
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            {{ k.name }}
            <UBadge v-if="k.backedUp" size="sm" color="success" variant="outline" class="ms-1">
              synchronisée
            </UBadge>
          </p>
          <p class="text-sm text-muted">
            Ajoutée le {{ adminDate(k.createdAt, true) }}
          </p>
        </div>
        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Supprimer cette passkey" @click="remove(k.id)" />
      </li>
    </ul>
  </AdminPage>
</template>
