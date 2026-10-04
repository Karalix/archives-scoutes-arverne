export function formatBytes(n: number | null | undefined): string {
  if (!n) return '0 o'
  const u = ['o', 'Ko', 'Mo', 'Go', 'To']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${u[i]}`
}

export function formatDuration(s: number | null | undefined): string {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export const KIND_LABELS: Record<string, string> = { video: 'Vidéo', photo: 'Photo', pdf: 'PDF', audio: 'Audio' }
export const KIND_ICONS: Record<string, string> = {
  video: 'i-lucide-film', photo: 'i-lucide-image', pdf: 'i-lucide-file-text', audio: 'i-lucide-music',
}
export const VISIBILITY_LABELS: Record<string, string> = {
  inherit: 'Selon l\'année', forcePrivate: 'Toujours protégé', forcePublic: 'Toujours public', hidden: 'Masqué',
}
export const STATUS_LABELS: Record<string, string> = { draft: 'Brouillon', published: 'Publié', trashed: 'Corbeille' }
export const ROLE_LABELS: Record<string, string> = { owner: 'Propriétaire', editor: 'Éditeur', contributor: 'Contributeur' }

/** Markdown très court (F-01) : paragraphes, gras, italique, liens. Échappe tout le reste. */
export function miniMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return src.split(/\n{2,}/).map((para) => {
    let h = esc(para.trim())
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    h = h.replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" rel="noopener">$1</a>')
    h = h.replace(/\n/g, '<br>')
    return h ? `<p>${h}</p>` : ''
  }).join('')
}
