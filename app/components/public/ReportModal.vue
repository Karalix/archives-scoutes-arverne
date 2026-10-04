<script setup lang="ts">
// F-12 : signaler / demander un retrait (aucun e-mail envoyé, file dans l'admin)
const props = defineProps<{ documentId: string, delayDays?: number }>()
const open = defineModel<boolean>('open', { default: false })
const kind = ref<'takedown' | 'error' | 'other'>('takedown')
const message = ref('')
const contact = ref('')
const website = ref('') // pot de miel
const openedAt = ref(Date.now())
const sending = ref(false)
const done = ref(false)
const error = ref<string | null>(null)

watch(open, (v) => {
  if (v) {
    openedAt.value = Date.now()
    done.value = false
    error.value = null
  }
})

async function send() {
  sending.value = true
  error.value = null
  try {
    await $fetch('/api/public/reports', {
      method: 'POST',
      body: { documentId: props.documentId, kind: kind.value, message: message.value, contact: contact.value, website: website.value, elapsed: Date.now() - openedAt.value },
    })
    done.value = true
    message.value = ''
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Signaler ce document">
    <template #body>
      <div v-if="done" class="space-y-3 text-center py-4">
                <p>Merci, votre demande a été transmise aux responsables des archives.</p>
        <p v-if="kind === 'takedown' && delayDays" class="text-sm text-muted">
          Les demandes de retrait sont traitées sous {{ delayDays }} jours.
        </p>
      </div>
      <form v-else class="space-y-4" @submit.prevent="send">
        <URadioGroup
          v-model="kind"
          :items="[
            { label: 'Demande de retrait (droit à l\'image)', value: 'takedown' },
            { label: 'Erreur (date, lieu, nom…)', value: 'error' },
            { label: 'Autre', value: 'other' },
          ]"
          legend="Motif"
        />
        <UFormField label="Message" required>
          <UTextarea v-model="message" :rows="4" class="w-full" placeholder="Précisez la raison, et le moment de la vidéo si besoin." />
        </UFormField>
        <UFormField label="Comment vous recontacter (facultatif)" help="Téléphone ou e-mail ; utilisé uniquement pour traiter votre demande.">
          <UInput v-model="contact" class="w-full" autocomplete="email" />
        </UFormField>
        <input v-model="website" type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true">
        <p v-if="error" class="text-sm text-error">
          {{ error }}
        </p>
        <UButton type="submit" block color="neutral" :loading="sending" :disabled="message.trim().length < 5">
          Envoyer
        </UButton>
      </form>
    </template>
  </UModal>
</template>
