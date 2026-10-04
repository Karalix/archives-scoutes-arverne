// Erreurs au format application/problem+json (RFC 9457) avec un champ hint actionnable (I-10).
const TITLES: Record<number, string> = {
  400: 'Requête invalide', 401: 'Non authentifié', 403: 'Accès refusé', 404: 'Introuvable',
  409: 'Conflit', 413: 'Fichier trop volumineux', 415: 'Type de fichier refusé', 422: 'Données invalides', 429: 'Trop de tentatives',
}

export function problem(status: number, detail: string, extra: Record<string, unknown> = {}) {
  return createError({
    statusCode: status,
    statusMessage: TITLES[status] ?? 'Erreur',
    message: detail,
    data: { type: 'about:blank', title: TITLES[status] ?? 'Erreur', status, detail, ...extra },
  })
}

/** Valide un corps de requête avec Zod et renvoie une 422 lisible. */
export async function readValid<T>(event: Parameters<typeof readBody>[0], schema: { safeParse: (v: unknown) => { success: true, data: T } | { success: false, error: { issues: { path: PropertyKey[], message: string }[] } } }): Promise<T> {
  const body = await readBody(event).catch(() => undefined)
  return parseValid(body, schema)
}

export function parseValid<T>(value: unknown, schema: { safeParse: (v: unknown) => { success: true, data: T } | { success: false, error: { issues: { path: PropertyKey[], message: string }[] } } }): T {
  const r = schema.safeParse(value)
  if (!r.success) {
    const errors = r.error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message }))
    throw problem(422, errors.map(e => `${e.path || '(corps)'} : ${e.message}`).join(' ; '), { errors })
  }
  return r.data
}
