// Réglages publics de l'instance et état de la session famille
export default defineEventHandler(async (event) => {
  const inst = await getInstance()
  const access = await getAccess(event)
  return {
    ...publicInstance(inst),
    family: access.family ? { maxYear: access.family.maxYear, expiresAt: access.family.expiresAt } : null,
    admin: access.admin ? { name: access.admin.name, role: access.admin.role } : null,
  }
})
