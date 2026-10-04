<script setup lang="ts">
// F-06 : lecteur natif (progressif + Range), plein écran, reprise de lecture, vitesse, chapitres
const props = defineProps<{
  id: string
  src: string
  poster?: string | null
  captions?: string | null
  chapters?: { start: number, title: string }[]
  canDownload?: boolean
  autoplay?: boolean
}>()
const emit = defineEmits<{ ended: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const rate = ref(1)
const resumeAt = ref<number | null>(null)
const key = computed(() => `resume:${props.id}`)

function read(): number | null {
  try { return Number(localStorage.getItem(key.value)) || null }
  catch { return null }
}
function write(t: number | null) {
  try {
    if (t === null) localStorage.removeItem(key.value)
    else localStorage.setItem(key.value, String(Math.floor(t)))
  }
  catch {}
}

onMounted(() => {
  const t = read()
  if (t && t > 10) resumeAt.value = t
})

let last = 0
function onTime() {
  const v = video.value
  if (!v || !v.duration) return
  if (Math.abs(v.currentTime - last) < 5) return
  last = v.currentTime
  write(v.currentTime > v.duration - 15 ? null : v.currentTime)
}

function resume() {
  if (video.value && resumeAt.value) {
    video.value.currentTime = resumeAt.value
    video.value.play().catch(() => {})
  }
  resumeAt.value = null
}

function seek(t: number) {
  if (!video.value) return
  video.value.currentTime = t
  video.value.play().catch(() => {})
}

watch(rate, r => { if (video.value) video.value.playbackRate = r })

defineExpose({ video, seek })
</script>

<template>
  <div class="space-y-3">
    <div class="relative overflow-hidden bg-black">
      <video
        ref="video"
        :src="src"
        :poster="poster ?? undefined"
        controls
        playsinline
        preload="metadata"
        :autoplay="autoplay"
        :controlslist="canDownload ? undefined : 'nodownload'"
        class="w-full max-h-[80dvh] aspect-video"
        @timeupdate="onTime"
        @ended="write(null); emit('ended')"
        @contextmenu="!canDownload && $event.preventDefault()"
      >
        <track v-if="captions" kind="subtitles" srclang="fr" label="Français" :src="captions" default>
      </video>
      <div v-if="resumeAt" class="absolute inset-x-0 bottom-14 flex justify-center">
        <div class="flex gap-2 bg-black/80 p-2 text-white">
          <UButton size="sm" color="neutral" @click="resume">
            Reprendre à {{ formatDuration(resumeAt) }}
          </UButton>
          <UButton size="sm" color="neutral" variant="ghost" class="text-white" @click="resumeAt = null">
            Depuis le début
          </UButton>
        </div>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <USelect
        v-model="rate"
        :items="[0.5, 0.75, 1, 1.25, 1.5, 2].map(v => ({ label: `Vitesse ×${String(v).replace('.', ',')}`, value: v }))"
        variant="none"
        class="w-40"
        aria-label="Vitesse de lecture"
      />
    </div>
    <div v-if="chapters?.length" class="space-y-1">
      <h3 class="label">
        Chapitres
      </h3>
      <ol class="flex flex-wrap gap-2">
        <li v-for="c in chapters" :key="c.start">
          <UButton size="sm" color="neutral" variant="outline" @click="seek(c.start)">
            <span class="tabular-nums text-muted">{{ formatDuration(c.start) || '0:00' }}</span> {{ c.title }}
          </UButton>
        </li>
      </ol>
    </div>
  </div>
</template>
