import type { InstanceRow } from './instance'

// VideoProvider « cloudflare-stream » (8, D-07) : encodage et diffusion HLS par Cloudflare.
// Les vidéos sont créées avec requireSignedURLs : la lecture passe toujours par un jeton signé
// délivré après la décision d'accès (même principe que les URL /m/…).

const API = 'https://api.cloudflare.com/client/v4'

function creds(inst: InstanceRow) {
  const s = inst.settings
  if (!s.streamEnabled || !s.streamAccountId || !s.streamApiToken) {
    throw problem(409, 'Cloudflare Stream n\'est pas configuré', { hint: 'Paramètres → Cloudflare Stream : identifiant de compte et jeton d\'API (droit Stream:Edit).' })
  }
  return { account: s.streamAccountId, token: s.streamApiToken }
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))

/** Crée un envoi tus « direct creator » : le navigateur envoie ensuite le fichier directement à Cloudflare. */
export async function createStreamUpload(inst: InstanceRow, size: number, name: string) {
  const { account, token } = creds(inst)
  const res = await fetch(`${API}/accounts/${account}/stream?direct_user=true`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(size),
      'Upload-Metadata': `name ${b64(name)},requiresignedurls,maxdurationseconds ${b64('21600')}`,
    },
  })
  const uploadUrl = res.headers.get('location')
  const uid = res.headers.get('stream-media-id')
  if (!res.ok || !uploadUrl || !uid) throw problem(502, `Cloudflare Stream a refusé l'envoi (${res.status})`, { hint: await res.text().catch(() => '') })
  return { uploadUrl, uid }
}

export async function streamStatus(inst: InstanceRow, uid: string) {
  const { account, token } = creds(inst)
  const r: any = await $fetch(`${API}/accounts/${account}/stream/${uid}`, { headers: { Authorization: `Bearer ${token}` } })
  return { state: r.result?.status?.state as string, ready: !!r.result?.readyToStream, duration: r.result?.duration as number, thumbnail: r.result?.thumbnail as string }
}

/** Jeton de lecture signé (6 h), mis en cache. */
export async function streamPlaybackToken(inst: InstanceRow, uid: string) {
  const cacheKey = `stream-token:${uid}`
  const cached = await kvGet(cacheKey)
  if (cached) return cached
  const { account, token } = creds(inst)
  const exp = Math.floor(Date.now() / 1000) + PROTECTED_TTL
  const r: any = await $fetch(`${API}/accounts/${account}/stream/${uid}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { exp, downloadable: false },
  })
  const t = r.result?.token as string
  await kvSet(cacheKey, t, (PROTECTED_TTL - 600) * 1000)
  return t
}

export async function deleteStreamVideo(inst: InstanceRow, uid: string) {
  const { account, token } = creds(inst)
  await fetch(`${API}/accounts/${account}/stream/${uid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
}
