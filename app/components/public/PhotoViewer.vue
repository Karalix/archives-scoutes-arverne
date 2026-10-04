<script setup lang="ts">
// F-07 : galerie photo avec zoom et balayage
const props = defineProps<{ src: string, alt: string, prevId?: string | null, nextId?: string | null }>()
const zoomed = ref(false)
const router = useRouter()
let startX = 0
let startY = 0

function go(id?: string | null) {
  if (id) router.replace(`/document/${id}`)
}
function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return
  startX = e.touches[0]!.clientX
  startY = e.touches[0]!.clientY
}
function onTouchEnd(e: TouchEvent) {
  if (zoomed.value) return
  const t = e.changedTouches[0]!
  const dx = t.clientX - startX
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - startY) * 1.5) go(dx < 0 ? props.nextId : props.prevId)
}
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]')) return
  if (e.key === 'ArrowLeft') go(props.prevId)
  if (e.key === 'ArrowRight') go(props.nextId)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="relative select-none">
    <div
      class="relative overflow-auto bg-muted flex items-center justify-center py-6 sm:py-12"
      :class="zoomed ? 'max-h-[85dvh] cursor-zoom-out' : 'cursor-zoom-in'"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <img
        :src="src"
        :alt="alt"
        draggable="false"
        class="transition-[max-width] duration-200"
        :class="zoomed ? 'max-w-none w-[200%] sm:w-auto' : 'max-h-[78dvh] w-auto max-w-full shadow-[0_1px_2px_rgba(0,0,0,0.08)]'"
        @click="zoomed = !zoomed"
        @contextmenu.prevent
      >
    </div>
    <UButton
      v-if="prevId"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="link"
      size="xl"
      class="absolute left-1 top-1/2 -translate-y-1/2"
      aria-label="Photo précédente"
      @click="go(prevId)"
    />
    <UButton
      v-if="nextId"
      icon="i-lucide-arrow-right"
      color="neutral"
      variant="link"
      size="xl"
      class="absolute right-1 top-1/2 -translate-y-1/2"
      aria-label="Photo suivante"
      @click="go(nextId)"
    />
  </div>
</template>
