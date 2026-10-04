<script setup lang="ts">
import type { AdminDoc } from '~/composables/useAdmin'

// A-05 : choix de l'image de couverture parmi les documents (vignettes)
const props = defineProps<{ docs: AdminDoc[], modelValue: string | null, title?: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()
const open = defineModel<boolean>('open', { default: false })
const withThumb = computed(() => props.docs.filter(d => d.thumbUrl))

function pick(id: string | null) {
  emit('update:modelValue', id)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="title ?? 'Choisir la couverture'" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <p v-if="!withThumb.length" class="text-sm text-muted">
        Aucun document de cette année n'a encore de vignette.
      </p>
      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          v-for="d in withThumb"
          :key="d.id"
          type="button"
          class="group overflow-hidden border-2 text-left focus-visible:outline-2"
          :class="d.id === modelValue ? 'border-primary' : 'border-transparent hover:border-accented'"
          :aria-pressed="d.id === modelValue"
          @click="pick(d.id)"
        >
          <img :src="d.thumbUrl!" alt="" class="aspect-video w-full object-cover" loading="lazy">
          <span class="block truncate p-1 text-xs">{{ d.title }}</span>
        </button>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-between gap-2">
        <UButton label="Sans couverture" color="neutral" variant="ghost" icon="i-lucide-image-off" @click="pick(null)" />
        <UButton label="Fermer" color="neutral" variant="outline" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
