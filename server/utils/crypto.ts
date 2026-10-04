import { ulid } from 'ulid'
import type { H3Event } from 'h3'

export const newId = () => ulid()

const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function toB64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const keyCache = new Map<string, Promise<CryptoKey>>()
function hmacKey(secret: string) {
  let k = keyCache.get(secret)
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    keyCache.set(secret, k)
  }
  return k
}

export async function hmac(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))
  return toB64Url(sig)
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)))
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return toB64Url(b)
}

/** Clé secrète d'instance pour signer médias, liens de partage et recherches de mot de passe. */
export function signingKey(): string {
  const cfg = useRuntimeConfig()
  const key = cfg.mediaSigningKey || cfg.session.password
  if (!key) throw createError({ statusCode: 500, message: 'NUXT_MEDIA_SIGNING_KEY manquant' })
  return key
}

export function clientIp(event: H3Event): string {
  // Derrière Cloudflare, cf-connecting-ip est fiable ; X-Forwarded-For n'est jamais pris en compte (falsifiable)
  return getHeader(event, 'cf-connecting-ip') || getRequestIP(event) || 'unknown'
}

/** IP hachée (L-05) : jamais stockée en clair. */
export async function ipHash(event: H3Event): Promise<string> {
  return (await hmac(signingKey(), `ip:${clientIp(event)}`)).slice(0, 22)
}
