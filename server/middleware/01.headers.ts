// En-têtes de sécurité (L-11) et lien de partage famille /?cle=… (R-11)
export default defineEventHandler(async (event) => {
  const path = event.path
  setHeader(event, 'Referrer-Policy', 'same-origin')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (!path.startsWith('/m/')) {
    const docsPage = path.startsWith('/api/v1/docs')
    setHeader(event, 'Content-Security-Policy', [
      'default-src \'self\'',
      // Nuxt injecte un script d'hydratation inline ; WebCodecs/pdf.js utilisent des workers blob
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${docsPage ? ' https://cdn.jsdelivr.net' : ''}`,
      `style-src 'self' 'unsafe-inline'${docsPage ? ' https://cdn.jsdelivr.net https://fonts.googleapis.com' : ''}`,
      `font-src 'self' data:${docsPage ? ' https://fonts.gstatic.com https://cdn.jsdelivr.net' : ''}`,
      'img-src \'self\' data: blob: https://*.cloudflarestream.com https://videodelivery.net',
      'media-src \'self\' blob: https://*.cloudflarestream.com https://videodelivery.net',
      'connect-src \'self\' https://*.cloudflarestream.com https://upload.videodelivery.net https://upload.cloudflarestream.com',
      'worker-src \'self\' blob:',
      'frame-src \'self\' https://*.cloudflarestream.com https://iframe.videodelivery.net',
      'object-src \'none\'',
      'base-uri \'self\'',
      'form-action \'self\'',
      'frame-ancestors \'none\'',
    ].join('; '))
  }
  if (path.startsWith('/admin') || path.startsWith('/install') || path.startsWith('/api/admin') || path.startsWith('/api/access')) {
    setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  }

  // CSRF (L-12) : toute mutation authentifiée par cookie doit venir de la même origine
  const method = event.method
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path.startsWith('/api/') && !getHeader(event, 'authorization')) {
    const origin = getHeader(event, 'origin')
    const host = getRequestHost(event, { xForwardedHost: true })
    if (origin && new URL(origin).host !== host) {
      throw problem(403, 'Origine de la requête refusée (CSRF)')
    }
    if (!origin && getHeader(event, 'sec-fetch-site') === 'cross-site') {
      throw problem(403, 'Requête inter-sites refusée (CSRF)')
    }
  }

  // Lien de partage : /?cle=… → session famille puis redirection sans le jeton
  if (method === 'GET' && !path.startsWith('/api/') && !path.startsWith('/_nuxt')) {
    const q = getQuery(event)
    if (typeof q.cle === 'string' && q.cle) {
      const share = await verifyShareKey(q.cle)
      const url = new URL(path, 'http://x')
      url.searchParams.delete('cle')
      if (share) {
        const pw = await db.query.accessPassword.findFirst({ where: (p, { eq }) => eq(p.id, share.passwordId) })
        if (pw && !pw.revokedAt) await openFamilySession(event, { id: pw.id, scoutYear: Math.min(pw.scoutYear, share.maxYear) })
      }
      return sendRedirect(event, url.pathname + url.search, 302)
    }
  }
})
