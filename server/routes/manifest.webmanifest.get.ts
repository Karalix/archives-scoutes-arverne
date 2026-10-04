// PWA : manifeste aux couleurs du groupe
export default defineEventHandler(async (event) => {
  const inst = await getInstance()
  setHeader(event, 'Content-Type', 'application/manifest+json')
  const icon = inst.logoKey ? `/logo?v=${inst.updatedAt}` : '/icon.svg'
  return {
    name: inst.name,
    short_name: inst.name.slice(0, 24),
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: inst.primaryColor,
    lang: 'fr',
    icons: [
      { src: icon, sizes: '192x192', type: inst.logoKey ? 'image/png' : 'image/svg+xml', purpose: 'any' },
      { src: icon, sizes: '512x512', type: inst.logoKey ? 'image/png' : 'image/svg+xml', purpose: 'any maskable' },
    ],
  }
})
