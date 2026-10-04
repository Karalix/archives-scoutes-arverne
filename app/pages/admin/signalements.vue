<script setup lang="ts">
// F-12 / L-02 : file des signalements et retraits
definePageMeta({ layout: 'admin', middleware: 'admin', minRole: 'editor' })
useHead({ title: 'Signalements' })

interface Report {
  id: string
  documentId: string
  kind: 'takedown' | 'error' | 'other'
  message: string
  contact: string
  status: 'open' | 'done' | 'rejected'
  handledBy: string | null
  createdAt: number
  handledAt: number | null
  document: { id: string, title: string, visibility: string, status: string } | null
}

const KIND: Record<Report['kind'], string> = { takedown: 'Demande de retrait', error: 'Erreur', other: 'Autre' }
const STATUS: Record<Report['status'], { label: string, color: 'error' | 'success' | 'neutral' }> = {
  open: { label: 'Ouvert', color: 'error' }, done: { label: 'Traité', color: 'success' }, rejected: { label: 'Rejeté', color: 'neutral' },
}

const notify = useNotify()
const { data: site } = await useSite()
const { data: reports, pending, refresh } = await useFetch<Report[]>('/api/admin/reports')
const sorted = computed(() => [...(reports.value ?? [])].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.createdAt - a.createdAt))
const openCount = computed(() => reports.value?.filter(r => r.status === 'open').length ?? 0)
const busy = ref<string | null>(null)

async function handle(r: Report, status: Report['status'], takedown?: 'forcePrivate' | 'hidden') {
  busy.value = r.id
  try {
    await $fetch(`/api/admin/reports/${r.id}`, { method: 'POST', body: { status, takedown } })
    notify.ok(takedown === 'hidden' ? 'Document masqué' : takedown ? 'Document retiré (toujours protégé)' : status === 'done' ? 'Marqué comme traité' : status === 'rejected' ? 'Signalement rejeté' : 'Rouvert')
    await refresh()
    refreshNuxtData('admin-dashboard')
  }
  catch (e) { notify.fail(e) }
  finally { busy.value = null }
}

const late = (r: Report) => r.status === 'open' && Date.now() - r.createdAt > (site.value?.takedownDelayDays ?? 7) * 86400_000
</script>

<template>
  <AdminPage title="Signalements">
    <p class="text-sm text-muted">
      Délai de traitement affiché aux visiteurs : <strong>{{ site?.takedownDelayDays ?? 7 }} jours</strong> (réglable dans les paramètres).
      « Retirer » rend le document toujours protégé (réservé aux familles) ; « Masquer » le rend invisible pour tous. Chaque action est tracée dans le journal.
    </p>
    <p class="text-sm">
      {{ openCount }} signalement{{ openCount > 1 ? 's' : '' }} ouvert{{ openCount > 1 ? 's' : '' }}
    </p>

    <div v-if="pending && !reports" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-28" />
    </div>
    <UEmpty v-else-if="!sorted.length" icon="i-lucide-flag-off" title="Aucun signalement" description="Les demandes envoyées depuis les pages des documents apparaîtront ici." />
    <div v-else class="border-b border-default">
      <article v-for="r in sorted" :key="r.id" class="border-t border-default py-5" :class="r.status !== 'open' ? 'opacity-70' : ''">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="STATUS[r.status].color" variant="outline">
              {{ STATUS[r.status].label }}
            </UBadge>
            <UBadge color="neutral" variant="outline">
              {{ KIND[r.kind] }}
            </UBadge>
            <UBadge v-if="late(r)" color="warning" variant="solid" icon="i-lucide-clock-alert">
              Délai dépassé
            </UBadge>
            <span class="ms-auto text-xs text-muted">{{ adminDate(r.createdAt, true) }}</span>
          </div>
          <p class="text-sm">
            Document :
            <NuxtLink v-if="r.document" :to="`/admin/documents/${r.documentId}`" class="font-medium underline">
              {{ r.document.title }}
            </NuxtLink>
            <span v-else class="text-muted">supprimé</span>
            <UBadge v-if="r.document" color="neutral" variant="outline" size="sm" class="ms-1">
              {{ VISIBILITY_LABELS[r.document.visibility] }}
            </UBadge>
          </p>
          <blockquote class="border-s-4 border-accented ps-3 text-sm whitespace-pre-line">
            {{ r.message }}
          </blockquote>
          <p v-if="r.contact" class="text-sm">
            Contact : <span class="font-medium select-all">{{ r.contact }}</span>
          </p>
          <p v-if="r.handledAt" class="text-xs text-muted">
            Traité le {{ adminDate(r.handledAt, true) }}
          </p>
          <div class="flex flex-wrap gap-2">
            <template v-if="r.status === 'open'">
              <UButton v-if="r.document" label="Retirer (toujours protégé)" icon="i-lucide-shield" size="sm" color="warning" :loading="busy === r.id" @click="handle(r, 'done', 'forcePrivate')" />
              <UButton v-if="r.document" label="Masquer" icon="i-lucide-eye-off" size="sm" color="error" variant="outline" :disabled="busy === r.id" @click="handle(r, 'done', 'hidden')" />
              <UButton label="Traité" icon="i-lucide-check" size="sm" color="success" variant="outline" :disabled="busy === r.id" @click="handle(r, 'done')" />
              <UButton label="Rejeter" icon="i-lucide-x" size="sm" color="neutral" variant="ghost" :disabled="busy === r.id" @click="handle(r, 'rejected')" />
            </template>
            <UButton v-else label="Rouvrir" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="ghost" :disabled="busy === r.id" @click="handle(r, 'open')" />
          </div>
        </div>
      </article>
    </div>
  </AdminPage>
</template>
