<script setup lang="ts">
// Secret affiché une seule fois (R-07, I-01, A-03) avec bouton de copie
defineProps<{ value: string, label?: string, help?: string, multiline?: boolean }>()
</script>

<template>
  <div class="space-y-1.5">
    <p v-if="label" class="text-sm font-medium">
      {{ label }}
    </p>
    <div class="flex items-start gap-2">
      <pre
        v-if="multiline"
        class="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words border border-default bg-elevated p-3 font-mono text-sm"
      >{{ value }}</pre>
      <code
        v-else
        class="min-w-0 flex-1 break-all border border-default bg-elevated px-3 py-2 font-mono text-sm select-all"
      >{{ value }}</code>
      <UButton icon="i-lucide-copy" color="neutral" variant="outline" aria-label="Copier" @click="adminCopy(value)" />
    </div>
    <p v-if="help" class="text-xs text-muted">
      {{ help }}
    </p>
  </div>
</template>
