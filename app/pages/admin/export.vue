<script setup lang="ts">
// A-16 / L-14 : export complet et sauvegardes hebdomadaires
definePageMeta({ layout: 'admin', middleware: 'admin', minRole: 'owner' })
useHead({ title: 'Export & sauvegardes' })

const notify = useNotify()
const { data: backups, pending, refresh } = await useFetch<{ key: string, size: number, uploaded: number | string }[]>('/api/admin/backups')
const busy = ref(false)
const today = new Date().toISOString().slice(0, 10)

async function backupNow() {
  busy.value = true
  try {
    const r = await $fetch<{ key: string, kept: number }>('/api/admin/backups', { method: 'POST' })
    notify.ok('Sauvegarde enregistrée', r.key)
    await refresh()
  }
  catch (e) { notify.fail(e) }
  finally { busy.value = false }
}

const date = (v: number | string) => adminDate(typeof v === 'number' ? v : new Date(v).getTime(), true)
</script>

<template>
  <AdminPage title="Export & sauvegardes">
    <AdminSection title="Export complet">
      <div class="space-y-3 text-sm">
        <p>
          Le fichier d'export contient toutes les métadonnées (années, événements, documents, réglages hors secrets) et les liens vers tous les fichiers, valables 6 heures. Votre groupe peut ainsi toujours repartir avec ses archives.
        </p>
        <UButton to="/api/admin/export" external download label="Télécharger l'export (JSON)" icon="i-lucide-download" />
        <p>Pour récupérer aussi tous les fichiers dans un dossier, lancez ensuite sur un ordinateur :</p>
        <AdminSecretBox :value="`npx archives-scoutes export ./archives-export-${today}.json --out ./dossier`" />
      </div>
    </AdminSection>

    <AdminSection title="Sauvegardes de la base">
        <template #actions>
          <UButton label="Sauvegarder maintenant" icon="i-lucide-database-backup" size="sm" :loading="busy" @click="backupNow" />
        </template>
      <p class="mb-3 text-sm text-muted">
        Une copie de la base (JSON) est enregistrée chaque lundi dans le stockage ; les 8 dernières sont conservées. Elle ne contient pas les fichiers : gardez aussi les originaux hors ligne (V-05).
      </p>
      <p v-if="!pending && !backups?.length" class="text-sm text-muted">
        Aucune sauvegarde pour l'instant.
      </p>
      <ul v-else class="divide-y divide-default border-y border-default">
        <li v-for="b in backups" :key="b.key" class="flex flex-wrap items-center gap-3 p-3 text-sm">
          <UIcon name="i-lucide-database" class="text-muted" />
          <code class="min-w-0 flex-1 truncate">{{ b.key.split('/').pop() }}</code>
          <span class="text-muted">{{ formatBytes(b.size) }}</span>
          <span class="text-muted">{{ date(b.uploaded) }}</span>
        </li>
      </ul>
    </AdminSection>
  </AdminPage>
</template>
