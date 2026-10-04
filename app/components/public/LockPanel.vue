<script setup lang="ts">
// 3.4 : pour une année protégée, seuls le libellé et le nombre de documents sont visibles
defineProps<{ label?: string, count?: number, notCovered?: boolean }>()
const { ask } = useUnlock()
</script>

<template>
  <section class="border-t border-(--ui-border-accented) pt-8 grid gap-8 md:grid-cols-12">
    <p class="label md:col-span-3">
      Accès réservé
    </p>
    <div class="md:col-span-7 space-y-5">
      <p v-if="count !== undefined" class="text-2xl font-light tracking-tight">
        {{ label?.replace('-', '–') }} — {{ count }} document{{ count > 1 ? 's' : '' }}.
      </p>
      <p class="text-muted max-w-xl leading-relaxed">
        <template v-if="notCovered">
          Votre mot de passe ne couvre pas cette année. Saisissez celui d'une année plus récente.
        </template>
        <template v-else>
          Pour protéger les jeunes, les années récentes ne sont visibles qu'avec le mot de passe annuel transmis aux familles du groupe.
        </template>
      </p>
      <UButton color="neutral" size="lg" @click="ask()">
        Saisir le mot de passe
      </UButton>
    </div>
  </section>
</template>
