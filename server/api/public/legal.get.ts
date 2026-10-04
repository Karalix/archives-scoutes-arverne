// L-07 : mentions légales et politique de confidentialité (modèles à compléter par le groupe)
export default defineEventHandler(async () => {
  const inst = await getInstance()
  return {
    name: inst.name,
    legal: inst.legal,
    privacy: inst.privacy,
    contactEmail: inst.contactEmail,
    takedownDelayDays: inst.settings.takedownDelayDays,
  }
})
