import type { DocKind } from '#shared/utils/naming'

export type AdminRole = 'owner' | 'editor' | 'contributor'
export type DocVisibility = 'inherit' | 'forcePrivate' | 'forcePublic' | 'hidden'
export type DocStatusValue = 'draft' | 'published' | 'trashed'
export type FileVariant = 'main' | 'thumb' | 'captions' | 'original'

export interface AdminMe {
  user: { id: string, name: string, email: string, role: AdminRole }
}

/** Forme renvoyée par serializeAdminDoc (server/utils/v1.ts). */
export interface AdminDoc {
  id: string
  externalId: string | null
  yearStart: number
  yearLabel: string
  eventId: string | null
  kind: DocKind
  title: string
  description: string
  branch: string | null
  place: string
  date: string | null
  credits: string
  people: string
  visibility: DocVisibility
  status: DocStatusValue
  downloadable: boolean | null
  duration: number | null
  width: number | null
  height: number | null
  size: number | null
  originalSize: number | null
  mime: string | null
  chapters: { start: number, title: string }[] | null
  hasFile: boolean
  hasThumb: boolean
  hasOriginal: boolean
  hasCaptions: boolean
  streamUid?: string | null
  createdBy: string | null
  createdAt: number
  updatedAt: number
  publishedAt: number | null
  trashedAt: number | null
  thumbUrl: string | null
  tags?: string[]
  mainUrl?: string | null
  captionsUrl?: string | null
  originalUrl?: string | null
}

export interface AdminYear {
  id: string
  startYear: number
  description: string
  coverDocumentId: string | null
  label: string
  public: boolean
  counts: Partial<Record<DocStatusValue, number>>
}

export interface AdminEvent {
  id: string
  yearId: string
  year: number
  type: string
  title: string
  place: string
  startDate: string | null
  endDate: string | null
  branch: string | null
  coverDocumentId: string | null
}

export interface BatchResult {
  index: number
  ok: boolean
  id?: string
  error?: string
  hint?: string
}

const RANK: Record<AdminRole, number> = { contributor: 1, editor: 2, owner: 3 }

export function roleRank(role: AdminRole | undefined | null) {
  return role ? RANK[role] : 0
}

/** Administrateur connecté (mis en cache par le middleware admin) et droits par rôle (A-02). */
export function useAdmin() {
  const me = useState<AdminMe | null>('admin-me', () => null)
  const user = computed(() => me.value?.user ?? null)
  const can = (min: AdminRole) => roleRank(me.value?.user.role) >= RANK[min]

  async function logout() {
    await $fetch('/api/admin/logout', { method: 'POST' }).catch(() => {})
    me.value = null
    clearNuxtData('site')
    await navigateTo('/admin/connexion')
  }

  return { me, user, can, logout }
}

/** Toasts de succès / d'erreur (erreurs problem+json lisibles via apiError). */
export function useNotify() {
  const toast = useToast()
  return {
    ok: (title: string, description?: string) => toast.add({ title, description, color: 'success', icon: 'i-lucide-check' }),
    fail: (e: unknown, title = 'Erreur') => toast.add({ title, description: apiError(e), color: 'error', icon: 'i-lucide-circle-alert' }),
    warn: (title: string, description?: string) => toast.add({ title, description, color: 'warning', icon: 'i-lucide-triangle-alert' }),
  }
}

export async function adminCopy(text: string) {
  const toast = useToast()
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copié dans le presse-papiers', color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: 'Copie impossible', description: 'Sélectionnez le texte et copiez-le manuellement.', color: 'warning' })
  }
}

export function adminDate(ms: number | null | undefined, withTime = false) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('fr-FR', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' })
}

export const STATUS_COLORS: Record<string, 'neutral' | 'success' | 'warning' | 'error'> = {
  draft: 'warning', published: 'success', trashed: 'error',
}

export const VISIBILITY_COLORS: Record<string, 'neutral' | 'info' | 'warning' | 'error' | 'success'> = {
  inherit: 'neutral', forcePrivate: 'warning', forcePublic: 'info', hidden: 'error',
}

export const VISIBILITY_HELP: Record<DocVisibility, string> = {
  inherit: 'Public si l\'année est antérieure ou égale à l\'année pivot, sinon réservé aux familles (mot de passe).',
  forcePrivate: 'Toujours réservé aux familles, même pour une année publique (demande de retrait d\'image).',
  forcePublic: 'Visible de tous, même pour une année récente. À réserver aux documents sans mineurs identifiables.',
  hidden: 'Invisible sur le site, pour tout le monde (hors administrateurs).',
}

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  color?: 'error' | 'primary' | 'warning'
}

/** Confirmation des actions destructives, affichée par <AdminConfirmHost> (layout admin). */
export function useConfirm() {
  const req = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>('admin-confirm', () => null)
  return (opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    req.value?.resolve(false)
    req.value = { ...opts, resolve }
  })
}

export const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
