<script setup lang="ts">
// R-09 : saisie du mot de passe annuel → session pour toutes les années récentes couvertes
const { open, reason } = useUnlock()
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const toast = useToast()

async function submit() {
  loading.value = true
  error.value = null
  try {
    const r = await $fetch<{ label: string }>('/api/access/unlock', { method: 'POST', body: { password: password.value } })
    open.value = false
    password.value = ''
    toast.add({ title: 'Archives déverrouillées', description: `Accès jusqu'à l'année ${r.label}.`, color: 'neutral' })
    await refreshNuxtData()
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Archives récentes" description="Les années récentes sont réservées aux membres et aux familles du groupe.">
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <p v-if="reason" class="text-sm text-muted">
          {{ reason }}
        </p>
        <UFormField label="Mot de passe annuel" help="Il vous a été transmis par le groupe (ex. castor-boussole-feu-2026)." :error="error ?? undefined">
          <UInput v-model="password" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" size="xl" class="w-full" autofocus />
        </UFormField>
        <UButton type="submit" block size="lg" color="neutral" :loading="loading" :disabled="!password">
          Déverrouiller
        </UButton>
        <p class="text-xs text-dimmed">
          Aucun compte n'est créé : un cookie de session garde l'accès sur cet appareil pendant 30 jours.
        </p>
      </form>
    </template>
  </UModal>
</template>
