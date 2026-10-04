// URL de médias signées (T-01, L-10) : /m/{documentId}/{variant}?exp=…&p=0|1[&dl=1]&sig=…
// La décision d'accès est prise ici, à la signature (R-04) ; la route média ne vérifie que le jeton.

export const PROTECTED_TTL = 6 * 3600 // 6 h (L-10)
export const PUBLIC_TTL = 7 * 24 * 3600
export const UPLOAD_TTL = 15 * 60 // URL de téléversement pour agents (I-12)

export type MediaVariant = 'main' | 'display' | 'thumb' | 'captions' | 'original'

function payload(docId: string, variant: string, exp: number, p: 0 | 1, dl: 0 | 1, a: 0 | 1) {
  return `m:${docId}:${variant}:${exp}:${p}:${dl}:${a}`
}

/**
 * opts.admin : URL émise pour un administrateur ou un jeton d'API (brouillons, originaux, export) ;
 * la route média ne revérifie alors pas la session, la signature faisant foi.
 */
export async function signMediaUrl(docId: string, variant: MediaVariant, opts: { protected: boolean, download?: boolean, version?: number, admin?: boolean }) {
  const now = Math.floor(Date.now() / 1000)
  // Expiration arrondie pour que l'URL reste stable (cache navigateur / CDN)
  const exp = opts.protected
    ? Math.ceil((now + PROTECTED_TTL) / 900) * 900
    : Math.ceil((now + PUBLIC_TTL) / 86400) * 86400
  const p = opts.protected ? 1 : 0
  const dl = opts.download ? 1 : 0
  const a = opts.admin ? 1 : 0
  const sig = await hmac(signingKey(), payload(docId, variant, exp, p, dl, a))
  const v = opts.version ? `&v=${opts.version}` : ''
  return `/m/${docId}/${variant}?exp=${exp}&p=${p}${dl ? '&dl=1' : ''}${a ? '&a=1' : ''}${v}&sig=${sig}`
}

export async function verifyMediaSignature(docId: string, variant: string, q: Record<string, any>) {
  const exp = Number(q.exp)
  const p = q.p === '1' ? 1 : 0
  const dl = q.dl === '1' ? 1 : 0
  const a = q.a === '1' ? 1 : 0
  if (!exp || exp < Date.now() / 1000) return null
  const expected = await hmac(signingKey(), payload(docId, variant, exp, p, dl, a))
  if (!timingSafeEqual(expected, String(q.sig ?? ''))) return null
  return { protected: p === 1, download: dl === 1, admin: a === 1, exp }
}

/** URL de téléversement signée (I-12, I-13) : une partie d'un multipart, valable 15 min. */
export async function signUploadPartUrl(uploadId: string, partNumber: number) {
  const exp = Math.floor(Date.now() / 1000) + UPLOAD_TTL
  const sig = await hmac(signingKey(), `u:${uploadId}:${partNumber}:${exp}`)
  return `/api/uploads/${uploadId}/parts/${partNumber}?exp=${exp}&sig=${sig}`
}

export async function verifyUploadPartSignature(uploadId: string, partNumber: number, q: Record<string, any>) {
  const exp = Number(q.exp)
  if (!exp || exp < Date.now() / 1000) return false
  return timingSafeEqual(await hmac(signingKey(), `u:${uploadId}:${partNumber}:${exp}`), String(q.sig ?? ''))
}

/** Lien de partage famille (R-11) : /?cle=… signé et expirable, rattaché à un mot de passe. */
export async function signShareKey(passwordId: string, maxYear: number, expSeconds: number) {
  const body = `${passwordId}.${maxYear}.${expSeconds}`
  const sig = await hmac(signingKey(), `share:${body}`)
  return `${body}.${sig}`
}

export async function verifyShareKey(key: string) {
  const [passwordId, maxYear, exp, sig] = key.split('.')
  if (!passwordId || !maxYear || !exp || !sig) return null
  if (Number(exp) < Date.now() / 1000) return null
  const expected = await hmac(signingKey(), `share:${passwordId}.${maxYear}.${exp}`)
  if (!timingSafeEqual(expected, sig)) return null
  return { passwordId, maxYear: Number(maxYear), exp: Number(exp) }
}
