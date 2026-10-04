<script setup lang="ts">
// 11 : mode « soirée » — lecture enchaînée d'une année en plein écran, navigation clavier / télécommande
definePageMeta({ layout: false })
const route = useRoute()
const router = useRouter()
const year = Number(route.params.year)
const { data: page } = await useFetch(`/api/public/years/${year}`, { key: `soiree-${year}` })
const videos = computed(() => (page.value?.documents ?? []).filter(d => d.kind === 'video'))
const index = ref(0)
const current = computed(() => videos.value[index.value])
const { data: doc } = await useFetch(() => current.value ? `/api/public/documents/${current.value.id}` : '/api/public/site', {
  key: 'soiree-doc',
  watch: [current],
  immediate: !!current.value,
})
const root = ref<HTMLDivElement | null>(null)
const player = ref<{ video: HTMLVideoElement | null } | null>(null)
const showHelp = ref(true)

function next() { if (index.value < videos.value.length - 1) index.value++ }
function prev() { if (index.value > 0) index.value-- }
function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen()
  else root.value?.requestFullscreen?.().catch(() => {})
}
function onKey(e: KeyboardEvent) {
  const v = player.value?.video
  showHelp.value = false
  switch (e.key) {
    case 'ArrowRight': case 'MediaTrackNext': next(); break
    case 'ArrowLeft': case 'MediaTrackPrevious': prev(); break
    case 'Enter': case ' ': case 'MediaPlayPause':
      e.preventDefault()
      if (v) v.paused ? v.play() : v.pause()
      break
    case 'ArrowUp': if (v) v.currentTime += 10; break
    case 'ArrowDown': if (v) v.currentTime -= 10; break
    case 'f': toggleFs(); break
    case 'Escape': case 'Backspace': if (!document.fullscreenElement) router.push(`/annee/${year}`); break
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  setTimeout(() => { showHelp.value = false }, 6000)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
useHead({ title: `Soirée ${scoutYearLabel(year)}`, meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <div ref="root" class="min-h-dvh bg-black text-white flex flex-col">
    <div v-if="!videos.length" class="m-auto text-center space-y-4">
      <p class="text-xl">
        Aucune vidéo accessible pour {{ scoutYearLabel(year) }}.
      </p>
      <UButton :to="`/annee/${year}`" size="xl">
        Retour
      </UButton>
    </div>
    <template v-else>
      <div class="flex-1 flex items-center justify-center p-2">
        <PublicVideoPlayer
          v-if="doc && 'mainUrl' in doc && doc.mainUrl"
          :id="doc.id"
          ref="player"
          :key="doc.id"
          :src="doc.mainUrl"
          :poster="doc.thumbUrl"
          :captions="doc.captionsUrl"
          :can-download="false"
          autoplay
          class="w-full max-w-[177dvh]"
          @ended="next"
        />
      </div>
      <div class="flex items-center gap-3 px-4 py-3 text-lg">
        <UButton size="xl" color="neutral" variant="ghost" class="text-white" icon="i-lucide-skip-back" aria-label="Vidéo précédente" :disabled="index === 0" @click="prev" />
        <p class="flex-1 truncate">
          <span class="text-white/60 tabular-nums">{{ index + 1 }}/{{ videos.length }}</span> {{ current?.title }}
        </p>
        <UButton size="xl" color="neutral" variant="ghost" class="text-white" icon="i-lucide-skip-forward" aria-label="Vidéo suivante" :disabled="index >= videos.length - 1" @click="next" />
        <UButton size="xl" color="neutral" variant="ghost" class="text-white" icon="i-lucide-maximize" aria-label="Plein écran" @click="toggleFs" />
        <UButton size="xl" color="neutral" variant="ghost" class="text-white" icon="i-lucide-x" :to="`/annee/${year}`" aria-label="Quitter" />
      </div>
      <p v-if="showHelp" class="absolute top-4 inset-x-0 text-center text-white/80 text-sm">
        ← → vidéo précédente / suivante · Entrée lecture / pause · ↑ ↓ ±10 s · F plein écran · Échap quitter
      </p>
    </template>
  </div>
</template>
