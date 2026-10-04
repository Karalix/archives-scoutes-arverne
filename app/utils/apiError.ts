/** Message lisible d'une erreur $fetch (corps application/problem+json, I-10). */
export function apiError(e: unknown): string {
  const err = e as { data?: { detail?: string, message?: string, hint?: string }, message?: string }
  const d = err?.data
  const msg = d?.detail || d?.message || err?.message || 'Erreur inattendue'
  return d?.hint ? `${msg} — ${d.hint}` : msg
}
