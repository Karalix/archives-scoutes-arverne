<script setup lang="ts">
// A-09 : choix de la vignette vidéo (image extraite à un instant donné ou image importée)
const props = defineProps<{ documentId: string, videoUrl?: string | null, duration?: number | null, thumbUrl?: string | null }>()
const emit = defineEmits<{ done: [] }>()
const notify = useNotify()

const video = ref<HTMLVideoElement>()
const time = ref(0)
const max = ref(props.duration ?? 0)
const busy = ref(false)
const fileInput = ref<HTMLInputElement>()

function onMeta() {
  if (video.value && Number.isFinite(video.value.duration)) {
    max.value = video.value.duration
    if (!time.value) time.value = Math.round(max.value * 0.1 * 10) / 10
  }
}
watch(time, (t) => {
  if (video.value && Math.abs(video.value.currentTime - t) > 0.05) video.value.currentTime = t
})

async function upload(blob: Blob) {
  busy.value = true
  try {
    await directUpload({ documentId: props.documentId, variant: 'thumb', blob, filename: blob.type === 'image/webp' ? 'vignette.webp' : 'vignette.jpg', mime: blob.type })
    notify.ok('Vignette enregistrée')
    emit('done')
  }
  catch (e) { notify.fail(e, 'Vignette refusée') }
  finally { busy.value = false }
}

async function capture() {
  if (!video.value) return
  try { await upload(await captureVideoFrame(video.value)) }
  catch (e) { notify.fail(e) }
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  try { await upload(await imageToThumb(f)) }
  catch (err) { notify.fail(err) }
}
</script>

<template>
  <div class="space-y-3">
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <p class="mb-1 text-xs text-muted">
          Vignette actuelle
        </p>
        <img v-if="thumbUrl" :src="thumbUrl" alt="Vignette actuelle" class="aspect-video w-full bg-elevated object-cover">
        <div v-else class="flex aspect-video items-center justify-center bg-elevated text-sm text-muted">
          Aucune vignette
        </div>
      </div>
      <div v-if="videoUrl">
        <p class="mb-1 text-xs text-muted">
          Image à {{ formatDuration(time) || '0:00' }}
        </p>
        <video
          ref="video"
          :src="videoUrl"
          muted
          playsinline
          preload="auto"
          class="aspect-video w-full bg-black object-contain"
          @loadedmetadata="onMeta"
        />
      </div>
    </div>
    <div v-if="videoUrl" class="flex items-center gap-3">
      <USlider v-model="time" :min="0" :max="max || 1" :step="0.1" class="flex-1" aria-label="Instant de la vignette" />
      <UButton label="Utiliser cette image" icon="i-lucide-camera" size="sm" :loading="busy" @click="capture" />
    </div>
    <UButton label="Importer une image" icon="i-lucide-image-up" size="sm" color="neutral" variant="outline" :disabled="busy" @click="fileInput?.click()" />
    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-label="Importer une image" @change="onFile">
  </div>
</template>
