import type { H3Error, H3Event } from 'h3'

export default defineNitroErrorHandler((error: H3Error, event: H3Event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/') && !path.startsWith('/mcp') && !path.startsWith('/m/')) return
  const status = error.statusCode || 500
  const data = (error.data && typeof error.data === 'object') ? error.data as Record<string, unknown> : {}
  const body = {
    type: 'about:blank',
    title: error.statusMessage || (status >= 500 ? 'Erreur serveur' : 'Erreur'),
    status,
    detail: status >= 500 && !import.meta.dev ? 'Erreur interne' : (error.message || undefined),
    ...data,
  }
  if (status >= 500) console.error(error)
  setResponseStatus(event, status)
  setResponseHeader(event, 'Content-Type', 'application/problem+json')
  return send(event, JSON.stringify(body))
})
