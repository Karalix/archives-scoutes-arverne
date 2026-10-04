export default defineEventHandler(async (event) => {
  const { admin, family } = await getAccess(event)
  if (!admin) throw problem(401, 'Non connecté')
  return { user: { id: admin.userId, name: admin.name, email: admin.email, role: admin.role }, family }
})
