import type { AdminMe, AdminRole } from '~/composables/useAdmin'

declare module '#app' {
  interface PageMeta {
    /** Rôle minimal pour afficher la page (A-02). */
    minRole?: AdminRole
  }
}

// Session admin requise : sinon redirection vers la connexion
export default defineNuxtRouteMiddleware(async (to) => {
  const me = useState<AdminMe | null>('admin-me', () => null)
  if (!me.value) {
    try {
      me.value = await $fetch<AdminMe>('/api/admin/me')
    }
    catch (e) {
      const status = (e as { statusCode?: number, response?: { status?: number } })?.statusCode ?? (e as { response?: { status?: number } })?.response?.status
      if (status === 401) return navigateTo({ path: '/admin/connexion', query: to.fullPath !== '/admin' ? { redirect: to.fullPath } : {} })
      throw e
    }
  }
  const min = to.meta.minRole
  if (min && roleRank(me.value!.user.role) < roleRank(min)) {
    useToast().add({ title: 'Accès réservé', description: `Cette page demande le rôle « ${ROLE_LABELS[min]} ».`, color: 'warning' })
    return navigateTo('/admin')
  }
})
