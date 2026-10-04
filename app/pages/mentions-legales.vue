<script setup lang="ts">
const { data } = await useFetch('/api/public/legal', { key: 'legal' })
useHead({ title: 'Mentions légales' })
</script>

<template>
  <PublicWall class="pt-14 sm:pt-20">
    <div class="max-w-2xl space-y-5 leading-relaxed">
    <h1 class="text-4xl sm:text-5xl font-light tracking-tight pb-6">
      Mentions légales
    </h1>
    <!-- eslint-disable-next-line vue/no-v-html -- miniMarkdown échappe tout le HTML -->
    <div v-if="data?.legal" class="prose-lite" v-html="miniMarkdown(data.legal)" />
    <p v-else class="text-muted">
      Les mentions légales de ce site n'ont pas encore été renseignées par le groupe.
    </p>
    <h2 class="label pt-8">
      Droit à l'image et demandes de retrait
    </h2>
    <p>
      Chaque document dispose d'un bouton « Signaler / demander un retrait ». Les demandes sont traitées sous {{ data?.takedownDelayDays ?? 7 }} jours<template v-if="data?.contactEmail">
        ; vous pouvez aussi écrire à <a :href="`mailto:${data.contactEmail}`" class="underline">{{ data.contactEmail }}</a>
      </template>.
    </p>
    </div>
  </PublicWall>
</template>
