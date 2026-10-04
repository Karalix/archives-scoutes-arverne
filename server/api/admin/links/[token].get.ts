// Infos d'un lien d'invitation / de réinitialisation (A-03)
export default defineEventHandler(async (event) => {
  const link = await findValidLink(getRouterParam(event, 'token')!)
  return { kind: link.kind, email: link.email, name: link.name, role: link.role, expiresAt: link.expiresAt }
})
