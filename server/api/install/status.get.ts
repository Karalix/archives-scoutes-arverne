export default defineEventHandler(async () => {
  const inst = await getInstance()
  const admins = await countAdmins()
  if (!admins && !useRuntimeConfig().installToken) {
    // Déclenche la génération du jeton (affiché dans les logs du Worker)
    await installTokenMatches('')
  }
  return { installed: admins > 0, name: inst.name, tokenFromEnv: !!useRuntimeConfig().installToken }
})
