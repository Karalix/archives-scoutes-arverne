declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string
    role: 'owner' | 'editor' | 'contributor'
  }
  interface UserSession {
    /** Session admin : version pour révocation immédiate (A-03), connexion pour les 7 jours (L-12). */
    admin?: { version: number, loggedInAt: number }
    /** Session famille (R-09) : années ≤ maxYear, rattachée au mot de passe utilisé. */
    family?: { maxYear: number, passwordId: string, expiresAt: number }
  }
}
export {}
