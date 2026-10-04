<script setup lang="ts">
import type { AdminYear } from '~/composables/useAdmin'

// A-05 : années scoutes
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Années' })

const notify = useNotify()
const confirm = useConfirm()
const { can } = useAdmin()
const { data: site } = await useSite()
const { data: years, pending, refresh } = await useFetch<AdminYear[]>('/api/v1/years', { key: 'admin-years' })

const current = scoutYearOf(new Date(), site.value?.switchMonth ?? 9)
const createOpen = ref(false)
const form = reactive({ startYear: current, description: '' })
const busy = ref(false)

function openCreate() {
  const existing = new Set((years.value ?? []).map(y => y.startYear))
  let y = current
  while (existing.has(y)) y--
  Object.assign(form, { startYear: y, description: '' })
  createOpen.value = true
}

async function create() {
  if ((years.value ?? []).some(y => y.startYear === form.startYear)) {
    notify.warn(`L'année ${scoutYearLabel(form.startYear)} existe déjà`)
    return
  }
  busy.value = true
  try {
    await $fetch('/api/v1/years', { method: 'POST', body: { startYear: form.startYear, description: form.description || undefined } })
    notify.ok(`Année ${scoutYearLabel(form.startYear)} créée`)
    createOpen.value = false
    await refresh()
  }
  catch (e) { notify.fail(e) }
  finally { busy.value = false }
}

const total = (y: AdminYear) => (y.counts.draft ?? 0) + (y.counts.published ?? 0) + (y.counts.trashed ?? 0)

async function remove(y: AdminYear) {
  if (!(await confirm({ title: `Supprimer l'année ${y.label} ?`, description: 'Ses événements sont supprimés aussi. Seule une année sans document peut être supprimée.', confirmLabel: 'Supprimer' }))) return
  try {
    await $fetch(`/api/v1/years/${y.startYear}`, { method: 'DELETE' })
    notify.ok(`Année ${y.label} supprimée`)
    await refresh()
  }
  catch (e) { notify.fail(e) }
}
</script>

<template>
  <AdminPage title="Années">
    <template #actions>
      <UButton icon="i-lucide-plus" label="Nouvelle année" @click="openCreate" />
    </template>

    <p class="text-sm text-muted">
      Une année scoute commence en {{ MONTHS_FR[(site?.switchMonth ?? 9) - 1] }} et se termine après l'été suivant ; elle est rangée par son année de début (un camp d'été 2025 appartient à 2024-2025).
      Années publiques : jusqu'à {{ site ? scoutYearLabel(site.pivot) : '…' }}.
    </p>

    <div v-if="pending && !years" class="space-y-2">
      <USkeleton v-for="i in 4" :key="i" class="h-16" />
    </div>
    <UEmpty
      v-else-if="!years?.length"
      icon="i-lucide-calendar-plus"
      title="Aucune année"
      description="Créez une première année, ou téléversez directement des fichiers : les années sont créées à l'import."
      :actions="[{ label: 'Nouvelle année', icon: 'i-lucide-plus', onClick: openCreate }]"
    />
    <ul v-else class="divide-y divide-default border-y border-default">
      <li v-for="y in years" :key="y.id" class="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
        <NuxtLink :to="`/admin/annees/${y.startYear}`" class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-2xl font-light tracking-tight">{{ y.label }}</span>
            <UBadge v-if="y.public" color="success" variant="outline" icon="i-lucide-globe">
              Publique
            </UBadge>
            <UBadge v-else color="warning" variant="outline" icon="i-lucide-lock">
              Protégée
            </UBadge>
          </div>
          <p v-if="y.description" class="truncate text-sm text-muted">
            {{ y.description }}
          </p>
        </NuxtLink>
        <div class="flex flex-wrap gap-1 text-xs">
          <UBadge color="success" variant="outline">
            {{ y.counts.published ?? 0 }} publié{{ (y.counts.published ?? 0) > 1 ? 's' : '' }}
          </UBadge>
          <UBadge v-if="y.counts.draft" color="warning" variant="outline">
            {{ y.counts.draft }} brouillon{{ y.counts.draft > 1 ? 's' : '' }}
          </UBadge>
          <UBadge v-if="y.counts.trashed" color="neutral" variant="outline">
            {{ y.counts.trashed }} en corbeille
          </UBadge>
        </div>
        <div class="flex gap-1">
          <UButton :to="`/admin/annees/${y.startYear}`" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`Modifier ${y.label}`" />
          <UButton
            v-if="can('editor')"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :disabled="total(y) > 0"
            :aria-label="`Supprimer ${y.label}`"
            :title="total(y) > 0 ? 'Année non vide' : 'Supprimer'"
            @click="remove(y)"
          />
        </div>
      </li>
    </ul>

    <UModal v-model:open="createOpen" title="Nouvelle année scoute">
      <template #body>
        <form id="year-create" class="space-y-4" @submit.prevent="create">
          <UFormField label="Année de début" :help="`Correspond à l'année scoute ${scoutYearLabel(form.startYear)}.`">
            <UInputNumber v-model="form.startYear" :min="1900" :max="2200" :format-options="{ useGrouping: false }" class="w-40" />
          </UFormField>
          <UFormField label="Description (facultative)">
            <UTextarea v-model="form.description" :rows="3" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="createOpen = false" />
          <UButton type="submit" form="year-create" label="Créer" :loading="busy" />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
