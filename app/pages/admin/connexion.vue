<script setup lang="ts">
import type { AdminMe } from '~/composables/useAdmin'

// A-01 : passkey ou e-mail + mot de passe ; aucun e-mail envoyé
definePageMeta({ layout: false })
useHead({ title: 'Connexion', meta: [{ name: 'robots', content: 'noindex' }] })

const route = useRoute()
const notify = useNotify()
const { me } = useAdmin()
const { authenticate, isSupported } = useWebAuthn({
  authenticateEndpoint: '/api/admin/webauthn/authenticate',
  registerEndpoint: '/api/admin/webauthn/register',
})

const status = await $fetch<{ installed: boolean }>('/api/install/status').catch(() => null)
if (status && !status.installed) await navigateTo('/install')

const form = reactive({ email: '', password: '' })
const busy = ref<'password' | 'passkey' | null>(null)
const showHelp = ref(false)

async function done() {
  me.value = await $fetch<AdminMe>('/api/admin/me')
  clearNuxtData('site')
  const to = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin') ? route.query.redirect : '/admin'
  await navigateTo(to)
}

async function login() {
  busy.value = 'password'
  try {
    await $fetch('/api/admin/login', { method: 'POST', body: { email: form.email.trim(), password: form.password } })
    await done()
  }
  catch (e) {
    notify.fail(e, 'Connexion refusée')
  }
  finally {
    busy.value = null
  }
}

async function passkey() {
  busy.value = 'passkey'
  try {
    await authenticate()
    await done()
  }
  catch (e) {
    const name = (e as { name?: string })?.name
    if (name !== 'NotAllowedError' && name !== 'AbortError') notify.fail(e, 'Connexion par passkey impossible')
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <AdminAuthShell title="Administration" description="Connectez-vous pour alimenter les archives">
    <div class="space-y-5">
      <UButton
        v-if="isSupported"
        label="Se connecter avec une passkey"
        icon="i-lucide-fingerprint"
        size="lg"
        block
        color="neutral"
        variant="outline"
        :loading="busy === 'passkey'"
        @click="passkey"
      />
      <USeparator v-if="isSupported" label="ou" />
      <form class="space-y-4" @submit.prevent="login">
        <UFormField label="E-mail" required>
          <UInput v-model="form.email" type="email" autocomplete="username" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Mot de passe" required>
          <UInput v-model="form.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UButton type="submit" label="Se connecter" block size="lg" :loading="busy === 'password'" :disabled="!form.email || !form.password" />
      </form>
    </div>

    <template #footer>
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-circle-help"
        label="Mot de passe oublié ?"
        @click="showHelp = !showHelp"
      />
      <div v-if="showHelp" class="mt-2 space-y-2 text-sm text-muted">
        <p>L'application n'envoie jamais d'e-mail. Demandez à un propriétaire de l'instance de générer un <strong>lien de réinitialisation</strong> (Administrateurs → Lien de réinitialisation) et de vous le transmettre.</p>
        <p>Propriétaire sans autre recours : depuis le dépôt du groupe, lancez <code class="rounded bg-elevated px-1">npx archives-scoutes reset-link --email votre@adresse --remote</code>.</p>
      </div>
    </template>
  </AdminAuthShell>
</template>
