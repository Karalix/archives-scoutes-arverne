<script setup lang="ts">
// D-07 : envoi d'une vidéo vers Cloudflare Stream (protocole tus, reprenable, directement depuis le navigateur)
const props = defineProps<{ documentId: string, streamUid?: string | null }>()
const emit = defineEmits<{ done: [] }>()
const toast = useToast()
const progress = ref<number | null>(null)
const state = ref<string | null>(null)
const CHUNK = 50 * 1024 * 1024

async function tusUpload(url: string, file: File) {
  const head = await fetch(url, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' } })
  let offset = Number(head.headers.get('Upload-Offset') ?? 0)
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK)
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(url, {
          method: 'PATCH',
          headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
          body: chunk,
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        offset = Number(r.headers.get('Upload-Offset') ?? offset + chunk.size)
        break
      }
      catch (e) {
        if (attempt >= 6) throw e
        await new Promise(res => setTimeout(res, 2 ** attempt * 1000))
      }
    }
    progress.value = Math.round(offset / file.size * 100)
  }
}

async function pick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    progress.value = 0
    const { uploadUrl } = await $fetch<{ uploadUrl: string, uid: string }>(`/api/admin/stream/${props.documentId}`, {
      method: 'POST', body: { action: 'create', size: file.size, filename: file.name },
    })
    await tusUpload(uploadUrl, file)
    toast.add({ title: 'Vidéo envoyée à Cloudflare Stream', description: 'L\'encodage est fait par Cloudflare ; vérifiez l\'état dans quelques minutes.', color: 'success' })
    emit('done')
  }
  catch (err) {
    toast.add({ title: 'Échec de l\'envoi vers Stream', description: apiError(err), color: 'error' })
  }
  finally {
    progress.value = null
  }
}

async function check() {
  try {
    const s = await $fetch<{ state: string, ready: boolean }>(`/api/admin/stream/${props.documentId}`, { method: 'POST', body: { action: 'status' } })
    state.value = s.ready ? 'Prête à la lecture' : `En cours (${s.state})`
  }
  catch (err) {
    state.value = apiError(err)
  }
}

async function detach() {
  await $fetch(`/api/admin/stream/${props.documentId}`, { method: 'POST', body: { action: 'detach' } })
  emit('done')
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm text-muted">
      Cloudflare Stream encode la vidéo (HLS multi-débits) : envoyez le fichier original, sans ré-encodage préalable.
    </p>
    <div v-if="streamUid" class="flex flex-wrap items-center gap-2">
      <UBadge color="info" variant="subtle" icon="i-lucide-cloud">
        Stream : {{ streamUid.slice(0, 8) }}…
      </UBadge>
      <UButton size="sm" color="neutral" variant="outline" @click="check">
        Vérifier l'état
      </UButton>
      <UButton size="sm" color="error" variant="ghost" @click="detach">
        Détacher
      </UButton>
      <span v-if="state" class="text-sm">{{ state }}</span>
    </div>
    <label class="inline-flex">
      <input type="file" accept="video/*" class="sr-only" :disabled="progress !== null" @change="pick">
      <span class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-inverted cursor-pointer">
        <UIcon name="i-lucide-upload-cloud" />
        {{ streamUid ? 'Remplacer sur Stream' : 'Envoyer vers Cloudflare Stream' }}
      </span>
    </label>
    <UProgress v-if="progress !== null" :model-value="progress" status />
  </div>
</template>
