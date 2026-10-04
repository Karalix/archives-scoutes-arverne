export interface SiteInfo {
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string
  intro: string
  contactEmail: string
  branches: { key: string, label: string, color?: string }[]
  eventTypes: string[]
  switchMonth: number
  pivot: number
  installed: boolean
  takedownDelayDays: number
  peopleField: boolean
  family: { maxYear: number, expiresAt: number } | null
  admin: { name: string, role: string } | null
}

/** Réglages publics de l'instance + état de session (famille / admin). */
export function useSite() {
  return useFetch<SiteInfo>('/api/public/site', { key: 'site', dedupe: 'defer' })
}

export function branchLabel(site: SiteInfo | null | undefined, key: string | null | undefined) {
  if (!key) return ''
  return site?.branches.find(b => b.key === key)?.label ?? key
}
