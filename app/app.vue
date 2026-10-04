<script setup lang="ts">
import { fr } from '@nuxt/ui/locale'

const { data: site } = await useSite()

useHead(() => ({
  titleTemplate: t => (t ? `${t} — ${site.value?.name ?? 'Archives'}` : site.value?.name ?? 'Archives'),
  meta: [{ name: 'theme-color', content: site.value?.primaryColor ?? '#2f7d32' }],
  link: [{ rel: 'icon', href: site.value?.logoUrl ?? '/icon.svg' }],
  // Couleur primaire pilotée par les paramètres de l'instance
  // La couleur du groupe n'est qu'un accent (filets, pastilles) ; l'interface reste noir et blanc
  style: site.value?.primaryColor
    ? [{ key: 'instance-color', innerHTML: `:root{--accent:${site.value.primaryColor};}` }]
    : [],
}))

onMounted(() => {
  if ('serviceWorker' in navigator && !import.meta.dev) navigator.serviceWorker.register('/sw.js').catch(() => {})
})
</script>

<template>
  <UApp :toaster="{ position: 'bottom-center' }" :locale="fr">
    <NuxtLoadingIndicator color="var(--accent)" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
