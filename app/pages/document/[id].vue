<script setup lang="ts">
const route = useRoute()
const { data: site } = await useSite()
const id = computed(() => String(route.params.id))
const { data: doc, error } = await useFetch(() => `/api/public/documents/${id.value}`, { key: `doc-${id.value}` })
const reportOpen = ref(false)

const status = computed(() => (error.value as any)?.statusCode as number | undefined)
const lockInfo = computed(() => (error.value as any)?.data as { reason?: string, yearStart?: number } | undefined)

// Photos voisines (balayage) : documents photo de la même année et du même événement
const { data: yearPage } = await useFetch(() => `/api/public/years/${doc.value?.yearStart}`, {
  key: `year-nav-${id.value}`,
  immediate: !!doc.value && doc.value.kind === 'photo',
  watch: false,
})
const siblings = computed(() => (yearPage.value?.documents ?? []).filter(d => d.kind === 'photo' && d.eventId === doc.value?.eventId))
const idx = computed(() => siblings.value.findIndex(d => d.id === id.value))
const prevId = computed(() => idx.value > 0 ? siblings.value[idx.value - 1]!.id : null)
const nextId = computed(() => idx.value >= 0 && idx.value < siblings.value.length - 1 ? siblings.value[idx.value + 1]!.id : null)

const dateLabel = computed(() => doc.value?.date ? new Date(`${doc.value.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

useHead(() => ({
  title: doc.value?.title ?? 'Document',
  meta: !doc.value || doc.value.protected ? [{ name: 'robots', content: 'noindex, nofollow' }] : [],
}))
useSeoMeta({
  ogTitle: () => doc.value && !doc.value.protected ? doc.value.title : undefined,
  description: () => doc.value && !doc.value.protected ? doc.value.description?.slice(0, 160) : undefined,
})
</script>

<template>
  <PublicWall class="pt-10 sm:pt-14">
    <div v-if="status === 401" class="pt-10">
      <PublicLockPanel :not-covered="lockInfo?.reason === 'yearNotCovered'" />
    </div>
    <div v-else-if="error" class="border-t border-default pt-8 space-y-6">
      <p class="text-2xl font-light">
        {{ apiError(error) }}
      </p>
      <UButton to="/" color="neutral" variant="outline">
        Toutes les années
      </UButton>
    </div>

    <article v-else-if="doc" class="space-y-12">
      <nav class="text-sm text-muted flex flex-wrap gap-x-2" aria-label="Fil d'Ariane">
        <NuxtLink to="/" class="hover:text-default">Années</NuxtLink>
        <span aria-hidden="true">/</span>
        <NuxtLink :to="`/annee/${doc.yearStart}`" class="hover:text-default">{{ scoutYearLabel(doc.yearStart).replace('-', '–') }}</NuxtLink>
        <template v-if="doc.event">
          <span aria-hidden="true">/</span>
          <span>{{ doc.event.title }}</span>
        </template>
      </nav>

      <div v-if="doc.kind === 'video'">
        <iframe
          v-if="doc.streamUrl"
          :src="doc.streamUrl"
          class="w-full aspect-video"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
          :title="doc.title"
        />
        <PublicVideoPlayer
          v-else-if="doc.mainUrl"
          :id="doc.id"
          :src="doc.mainUrl"
          :poster="doc.thumbUrl"
          :captions="doc.captionsUrl"
          :chapters="doc.chapters"
          :can-download="doc.canDownload"
        />
      </div>
      <PublicPhotoViewer v-else-if="doc.kind === 'photo' && doc.mainUrl" :src="doc.mainUrl" :alt="doc.title" :prev-id="prevId" :next-id="nextId" />
      <ClientOnly v-else-if="doc.kind === 'pdf' && doc.mainUrl">
        <PublicPdfViewer :src="doc.mainUrl" />
      </ClientOnly>
      <div v-else-if="doc.kind === 'audio' && doc.mainUrl" class="bg-muted p-8 sm:p-12 flex flex-col sm:flex-row gap-8 items-center">
        <img v-if="doc.thumbUrl" :src="doc.thumbUrl" alt="" class="size-40 object-cover">
        <audio :src="doc.mainUrl" controls preload="metadata" class="w-full" :controlslist="doc.canDownload ? undefined : 'nodownload'" />
      </div>
      <p v-else class="label">
        Fichier en cours de préparation
      </p>

      <div class="grid gap-10 lg:grid-cols-12 border-t border-(--ui-border-accented) pt-8">
        <!-- Cartel (F-09) -->
        <div class="lg:col-span-4 space-y-6">
          <h1 class="text-3xl sm:text-4xl font-light tracking-tight leading-tight">
            {{ doc.title }}
          </h1>
          <dl class="text-sm space-y-3">
            <div v-for="row in [
              ['Année', scoutYearLabel(doc.yearStart).replace('-', '–')],
              ['Événement', doc.event?.title],
              ['Date', dateLabel],
              ['Lieu', doc.place],
              ['Branche', branchLabel(site, doc.branch)],
              ['Durée', doc.duration ? formatDuration(doc.duration) : ''],
              ['Support', KIND_LABELS[doc.kind]],
              ['Crédits', doc.credits],
              ['Personnes', doc.people],
            ].filter(r => r[1])" :key="row[0]" class="grid grid-cols-[7rem_1fr] gap-4 border-b border-default pb-3">
              <dt class="label pt-0.5">
                {{ row[0] }}
              </dt>
              <dd>
                <NuxtLink v-if="row[0] === 'Lieu'" :to="{ path: '/recherche', query: { lieu: doc.place } }" class="link-quiet">{{ row[1] }}</NuxtLink>
                <NuxtLink v-else-if="row[0] === 'Année'" :to="`/annee/${doc.yearStart}`" class="link-quiet">{{ row[1] }}</NuxtLink>
                <template v-else>{{ row[1] }}</template>
              </dd>
            </div>
          </dl>
        </div>
        <div class="lg:col-span-6 lg:col-start-6 space-y-6">
          <p v-if="doc.description" class="text-lg leading-relaxed whitespace-pre-line">
            {{ doc.description }}
          </p>
          <p v-if="doc.tags.length" class="cartel-meta">
            {{ doc.tags.join(', ') }}
          </p>
          <div class="flex flex-wrap gap-x-6 gap-y-3 text-sm pt-2">
            <a v-if="doc.downloadUrl" :href="doc.downloadUrl" class="link-quiet">Télécharger</a>
            <button class="link-quiet text-muted" @click="reportOpen = true">Signaler / demander un retrait</button>
            <NuxtLink v-if="doc.isAdmin" :to="`/admin/documents/${doc.id}`" class="link-quiet text-muted">Modifier</NuxtLink>
          </div>
          <p v-if="doc.protected" class="cartel-meta max-w-md">
            Archive récente : consultation en ligne uniquement. Merci de ne pas la diffuser.
          </p>
        </div>
      </div>
      <PublicReportModal v-model:open="reportOpen" :document-id="doc.id" :delay-days="site?.takedownDelayDays" />
    </article>
  </PublicWall>
</template>
