<script setup lang="ts">
// A-04 / 9.1 : assistant de premier lancement
definePageMeta({ layout: false })
useHead({ title: 'Installation' })

const notify = useNotify()
const { data: status, pending } = await useFetch<{ installed: boolean, name: string, tokenFromEnv: boolean }>('/api/install/status')

const year = scoutYearOf(new Date())
const form = reactive({
  token: '',
  groupName: '',
  name: '',
  email: '',
  password: '',
  password2: '',
  pivotOffset: 10,
  primaryColor: '#2f7d32',
  firstPassword: generatePassphrase(year),
})
const busy = ref(false)
const result = ref<{ password: string, scoutYear: number } | null>(null)

const pivotPreview = computed(() => year - form.pivotOffset)
const errors = computed(() => ({
  password: form.password && form.password.length < 10 ? '10 caractères minimum' : undefined,
  password2: form.password2 && form.password2 !== form.password ? 'Les mots de passe diffèrent' : undefined,
}))
const valid = computed(() => form.token && form.groupName && form.name && form.email && form.password.length >= 10 && form.password === form.password2)

const familyMessage = computed(() => result.value
  ? `Bonjour,\n\nLes archives du groupe ${form.groupName} sont en ligne : ${window.location.origin}\n\nLes années récentes sont protégées. Mot de passe ${scoutYearLabel(result.value.scoutYear)} : ${result.value.password}\n\nIl ouvre les archives jusqu'à l'année ${scoutYearLabel(result.value.scoutYear)} incluse. Merci de ne pas le diffuser en dehors des familles du groupe.\n`
  : '')

async function submit() {
  busy.value = true
  try {
    const r = await $fetch<{ ok: boolean, firstPassword: { password: string, scoutYear: number } | null }>('/api/install', {
      method: 'POST',
      body: {
        token: form.token.trim(),
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        groupName: form.groupName.trim(),
        pivotOffset: form.pivotOffset,
        primaryColor: form.primaryColor,
        firstPassword: form.firstPassword.trim() || undefined,
      },
    })
    clearNuxtData('site')
    if (r.firstPassword) result.value = r.firstPassword
    else await navigateTo('/admin')
  }
  catch (e) {
    notify.fail(e, 'Installation impossible')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AdminAuthShell title="Installation" description="Création du compte propriétaire de l'instance" wide>
    <div v-if="pending" class="py-8 text-center text-muted">
      Chargement…
    </div>

    <div v-else-if="status?.installed && !result" class="space-y-4">
      <UAlert color="success" icon="i-lucide-check" title="Instance déjà installée" description="Connectez-vous à l'administration." />
      <UButton to="/admin" label="Aller à l'administration" icon="i-lucide-arrow-right" trailing />
    </div>

    <div v-else-if="result" class="space-y-5">
      <UAlert
        color="success"
        icon="i-lucide-party-popper"
        title="Installation terminée"
        description="Notez ce mot de passe des familles maintenant : il ne sera plus jamais affiché (seul son haché est conservé)."
      />
      <AdminSecretBox :value="result.password" :label="`Mot de passe des familles ${scoutYearLabel(result.scoutYear)}`" />
      <AdminSecretBox :value="familyMessage" label="Message type pour les familles" multiline />
      <UButton to="/admin" label="Continuer vers l'administration" icon="i-lucide-arrow-right" trailing size="lg" />
    </div>

    <form v-else class="space-y-6" @submit.prevent="submit">
      <UFormField
        label="Jeton d'installation"
        required
        :help="status?.tokenFromEnv ? 'Valeur du secret NUXT_INSTALL_TOKEN saisie lors du déploiement.' : 'Un jeton a été généré et affiché dans les journaux (logs) du Worker Cloudflare.'"
      >
        <UInput v-model="form.token" type="password" autocomplete="off" class="w-full" icon="i-lucide-key" />
      </UFormField>

      <USeparator label="Le groupe" />
      <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
        <UFormField label="Nom du groupe" required>
          <UInput v-model="form.groupName" placeholder="Groupe Saint-Exupéry" class="w-full" />
        </UFormField>
        <UFormField label="Couleur principale">
          <div class="flex items-center gap-2">
            <input v-model="form.primaryColor" type="color" aria-label="Couleur principale" class="h-9 w-12 cursor-pointer border border-default bg-transparent">
            <UInput v-model="form.primaryColor" class="w-28" />
          </div>
        </UFormField>
      </div>

      <USeparator label="Votre compte (propriétaire)" />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Nom" required>
          <UInput v-model="form.name" autocomplete="name" class="w-full" />
        </UFormField>
        <UFormField label="E-mail (identifiant)" required help="Aucun e-mail ne sera envoyé : c'est seulement votre identifiant.">
          <UInput v-model="form.email" type="email" autocomplete="email" class="w-full" />
        </UFormField>
        <UFormField label="Mot de passe" required :error="errors.password">
          <UInput v-model="form.password" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UFormField label="Confirmation" required :error="errors.password2">
          <UInput v-model="form.password2" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
      </div>

      <USeparator label="Accès aux archives" />
      <UFormField label="Ancienneté des années publiques (en années)" help="Mode glissant : l'année pivot avance seule à chaque rentrée.">
        <UInputNumber v-model="form.pivotOffset" :min="0" :max="50" class="w-32" />
      </UFormField>
      <UAlert
        color="info"
        variant="outline"
        icon="i-lucide-shield"
        title="Pourquoi 10 ans par défaut ? (L-01)"
        :description="`Les archives montrent surtout des mineurs. Une année n'est publique que lorsque les jeunes qu'on y voit sont devenus majeurs : avec ${form.pivotOffset} ans, les années jusqu'à ${scoutYearLabel(pivotPreview)} sont publiques ; les suivantes demandent le mot de passe annuel des familles. Vérifiez ce choix avec la politique image de votre mouvement.`"
      />
      <UFormField label="Premier mot de passe des familles" :help="`Valable pour l'année ${scoutYearLabel(year)} et les précédentes. Laissez vide pour le créer plus tard.`">
        <div class="flex gap-2">
          <UInput v-model="form.firstPassword" class="w-full font-mono" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" aria-label="Générer un autre mot de passe" @click="form.firstPassword = generatePassphrase(year)" />
        </div>
      </UFormField>

      <UButton type="submit" label="Installer" icon="i-lucide-rocket" size="lg" block :loading="busy" :disabled="!valid" />
    </form>
  </AdminAuthShell>
</template>
