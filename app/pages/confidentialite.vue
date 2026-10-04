<script setup lang="ts">
const { data } = await useFetch('/api/public/legal', { key: 'legal' })
useHead({ title: 'Confidentialité' })
</script>

<template>
  <PublicWall class="pt-14 sm:pt-20">
    <div class="max-w-2xl space-y-5 leading-relaxed">
    <h1 class="text-4xl sm:text-5xl font-light tracking-tight pb-6">
      Politique de confidentialité
    </h1>
    <!-- eslint-disable-next-line vue/no-v-html -- miniMarkdown échappe tout le HTML -->
    <div v-if="data?.privacy" class="prose-lite" v-html="miniMarkdown(data.privacy)" />
    <template v-else>
      <p>Ce site n'utilise aucun traceur ni cookie publicitaire. Le seul cookie déposé est un cookie de session strictement nécessaire, créé lorsque vous saisissez le mot de passe annuel ou vous connectez à l'administration.</p>
      <p>Aucun compte visiteur n'existe. Les adresses IP ne sont conservées que sous forme hachée, 30 jours au plus, pour la sécurité (limitation des tentatives).</p>
      <p>Les formulaires de signalement ne servent qu'au traitement de votre demande.</p>
    </template>
    </div>
  </PublicWall>
</template>
