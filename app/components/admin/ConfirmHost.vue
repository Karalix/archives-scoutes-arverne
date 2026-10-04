<script setup lang="ts">
import type { ConfirmOptions } from '~/composables/useAdmin'

const req = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>('admin-confirm', () => null)
const open = computed({
  get: () => !!req.value,
  set: (v) => { if (!v) answer(false) },
})

function answer(ok: boolean) {
  req.value?.resolve(ok)
  req.value = null
}
</script>

<template>
  <UModal v-model:open="open" :title="req?.title ?? ''" :description="req?.description">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Annuler" color="neutral" variant="ghost" @click="answer(false)" />
        <UButton :label="req?.confirmLabel ?? 'Confirmer'" :color="req?.color ?? 'error'" @click="answer(true)" />
      </div>
    </template>
  </UModal>
</template>
