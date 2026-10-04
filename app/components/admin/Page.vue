<script setup lang="ts">
defineProps<{ title: string, id?: string, lead?: string }>()
</script>

<template>
  <UDashboardPanel :id="id ?? 'admin-page'">
    <template #header>
      <UDashboardNavbar :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="$slots.toolbar">
        <slot name="toolbar" />
      </UDashboardToolbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-8 pb-10 sm:px-2">
        <header class="space-y-2 pt-2">
          <h1 class="text-3xl font-light tracking-tight sm:text-4xl">
            {{ title }}
          </h1>
          <p v-if="lead" class="max-w-3xl text-sm text-muted">
            {{ lead }}
          </p>
        </header>
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
