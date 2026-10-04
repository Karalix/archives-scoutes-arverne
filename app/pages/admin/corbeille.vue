<script setup lang="ts">
// A-10 : corbeille, rétention 30 jours
definePageMeta({ layout: 'admin', middleware: 'admin', minRole: 'editor' })
useHead({ title: 'Corbeille' })

interface Trashed { id: string, title: string, kind: string, yearStart: number, trashedAt: number | null, purgeAt: number }

const notify = useNotify()
const confirm = useConfirm()
const { can } = useAdmin()
const { data: items, pending, refresh } = await useFetch<Trashed[]>('/api/admin/trash')

async function restore(t: Trashed) {
  try {
    await $fetch(`/api/admin/trash/${t.id}`, { method: 'POST', body: { action: 'restore' } })
    notify.ok('Document restauré', 'Il reprend son état précédent (brouillon s\'il était brouillon).')
    await refresh()
  }
  catch (e) { notify.fail(e) }
}

async function purge(t: Trashed) {
  if (!(await confirm({ title: `Supprimer définitivement « ${t.title} » ?`, description: 'Les fichiers sont effacés du stockage. Cette action est irréversible.', confirmLabel: 'Supprimer définitivement' }))) return
  try {
    await $fetch(`/api/admin/trash/${t.id}`, { method: 'POST', body: { action: 'purge' } })
    notify.ok('Document supprimé définitivement')
    await refresh()
  }
  catch (e) { notify.fail(e) }
}
</script>

<template>
  <AdminPage title="Corbeille">
    <p class="text-sm text-muted">
      Les documents mis à la corbeille sont supprimés automatiquement après 30 jours.
    </p>
    <UEmpty v-if="!pending && !items?.length" icon="i-lucide-trash" title="Corbeille vide" />
    <ul v-else class="divide-y divide-default border-y border-default">
      <li v-for="t in items" :key="t.id" class="flex flex-wrap items-center gap-3 p-3">
        <UIcon :name="KIND_ICONS[t.kind] ?? 'i-lucide-file'" class="size-5 text-muted" />
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            {{ t.title }}
          </p>
          <p class="text-sm text-muted">
            {{ scoutYearLabel(t.yearStart) }} · mis à la corbeille le {{ adminDate(t.trashedAt) }} · suppression automatique le {{ adminDate(t.purgeAt) }}
          </p>
        </div>
        <UButton label="Restaurer" icon="i-lucide-undo-2" size="sm" variant="outline" @click="restore(t)" />
        <UButton v-if="can('owner')" label="Supprimer définitivement" icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" @click="purge(t)" />
      </li>
    </ul>
  </AdminPage>
</template>
