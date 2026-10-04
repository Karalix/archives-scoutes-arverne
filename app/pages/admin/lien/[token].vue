<script setup lang="ts">
import type { AdminMe } from '~/composables/useAdmin'

// A-03 : invitation à usage unique ou réinitialisation de mot de passe
definePageMeta({ layout: false })
useHead({ title: 'Lien d\'accès', meta: [{ name: 'robots', content: 'noindex' }] })

const route = useRoute()
const notify = useNotify()
const { me } = useAdmin()
const token = String(route.params.token)

const { data: link, error } = await useFetch<{ kind: 'invite' | 'reset', email: string | null, name: string | null, role: AdminRole | null, expiresAt: number }>(`/api/admin/links/${token}`)

const form = reactive({ name: '', email: '', password: '', password2: '' })
watch(link, (l) => {
  if (l) { form.name = l.name ?? ''; form.email = l.email ?? '' }
}, { immediate: true })

const busy = ref(false)
const valid = computed(() => form.password.length >= 10 && form.password === form.password2 && (link.value?.kind === 'reset' || link.value?.email || form.email))

async function submit() {
  busy.value = true
  try {
    await $fetch('/api/admin/links/accept', {
      method: 'POST',
      body: {
        token,
        password: form.password,
        name: link.value?.kind === 'invite' && form.name.trim() ? form.name.trim() : undefined,
        email: link.value?.kind === 'invite' && !link.value.email && form.email.trim() ? form.email.trim() : undefined,
      },
    })
    me.value = await $fetch<AdminMe>('/api/admin/me')
    clearNuxtData('site')
    notify.ok(link.value?.kind === 'invite' ? 'Bienvenue !' : 'Mot de passe modifié', link.value?.kind === 'reset' ? 'Vos autres sessions ont été fermées.' : undefined)
    await navigateTo(link.value?.kind === 'invite' ? '/admin/passkeys' : '/admin')
  }
  catch (e) {
    notify.fail(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AdminAuthShell
    :title="link?.kind === 'reset' ? 'Nouveau mot de passe' : 'Rejoindre l\'administration'"
    :description="link ? `Lien valable jusqu'au ${adminDate(link.expiresAt, true)}` : undefined"
  >
    <div v-if="error" class="space-y-4">
      <UAlert color="error" icon="i-lucide-link-2-off" title="Lien invalide" :description="apiError(error)" />
      <UButton to="/admin/connexion" label="Aller à la connexion" variant="outline" />
    </div>
    <form v-else-if="link" class="space-y-4" @submit.prevent="submit">
      <p v-if="link.kind === 'invite'" class="text-sm text-muted">
        Vous êtes invité·e avec le rôle <strong>{{ ROLE_LABELS[link.role ?? 'contributor'] }}</strong>. Choisissez votre mot de passe ; vous pourrez ensuite ajouter une passkey.
      </p>
      <p v-else class="text-sm text-muted">
        Compte : <strong>{{ link.email }}</strong>
      </p>
      <template v-if="link.kind === 'invite'">
        <UFormField label="Nom affiché">
          <UInput v-model="form.name" autocomplete="name" class="w-full" />
        </UFormField>
        <UFormField label="E-mail (identifiant)" required>
          <UInput v-model="form.email" type="email" autocomplete="username" class="w-full" :disabled="!!link.email" />
        </UFormField>
      </template>
      <UFormField label="Mot de passe" required help="10 caractères minimum.">
        <UInput v-model="form.password" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UFormField label="Confirmation" required :error="form.password2 && form.password2 !== form.password ? 'Les mots de passe diffèrent' : undefined">
        <UInput v-model="form.password2" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UButton type="submit" :label="link.kind === 'invite' ? 'Créer mon compte' : 'Enregistrer'" block size="lg" :loading="busy" :disabled="!valid" />
    </form>
  </AdminAuthShell>
</template>
