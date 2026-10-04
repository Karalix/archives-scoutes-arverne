<script setup lang="ts">
// F-07 : visionneuse PDF intégrée, pdf.js chargé à la demande
const props = defineProps<{ src: string }>()
const container = ref<HTMLDivElement | null>(null)
const pages = ref(0)
const scale = ref(1)
const loading = ref(true)
const error = ref<string | null>(null)
let pdf: any = null
let observer: IntersectionObserver | null = null
const rendered = new Set<number>()

async function load() {
  try {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    pdf = await pdfjs.getDocument({ url: props.src, disableAutoFetch: true, rangeChunkSize: 1 << 20 }).promise
    pages.value = pdf.numPages
    await nextTick()
    setupObserver()
  }
  catch (e: any) {
    error.value = `Impossible d'afficher le PDF (${e?.message ?? e})`
  }
  finally {
    loading.value = false
  }
}

async function renderPage(n: number) {
  if (!pdf || rendered.has(n)) return
  rendered.add(n)
  const page = await pdf.getPage(n)
  const width = container.value!.clientWidth - 2
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: (width / base.width) * scale.value * (window.devicePixelRatio || 1) })
  const canvas = container.value!.querySelector<HTMLCanvasElement>(`canvas[data-page="${n}"]`)
  if (!canvas) return
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
}

function setupObserver() {
  observer?.disconnect()
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) renderPage(Number((e.target as HTMLElement).dataset.page))
  }, { rootMargin: '600px' })
  container.value?.querySelectorAll('canvas').forEach(c => observer!.observe(c))
}

function zoom(d: number) {
  scale.value = Math.min(3, Math.max(0.5, scale.value + d))
  rendered.clear()
  nextTick(setupObserver)
}

onMounted(load)
onBeforeUnmount(() => {
  observer?.disconnect()
  pdf?.destroy?.()
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <UButton color="neutral" variant="ghost" icon="i-lucide-minus" aria-label="Dézoomer" @click="zoom(-0.25)" />
      <span class="text-sm tabular-nums w-14 text-center">{{ Math.round(scale * 100) }} %</span>
      <UButton color="neutral" variant="ghost" icon="i-lucide-plus" aria-label="Zoomer" @click="zoom(0.25)" />
      <span v-if="pages" class="text-sm text-muted ml-auto">{{ pages }} page{{ pages > 1 ? 's' : '' }}</span>
    </div>
    <div ref="container" class="max-h-[85dvh] overflow-auto bg-muted p-4 sm:p-10 space-y-6">
      <p v-if="loading" class="p-8 text-center text-muted">
        Chargement du document…
      </p>
      <p v-if="error" class="p-8 text-center text-error">
        {{ error }}
      </p>
      <canvas v-for="n in pages" :key="`${n}-${scale}`" :data-page="n" class="mx-auto block bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]" :aria-label="`Page ${n}`" />
    </div>
  </div>
</template>
