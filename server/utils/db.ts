// `db` et `schema` sont auto-importés par NuxtHub (hub:db)
export const nowMs = () => Date.now()
export function instanceId(): string {
  return useRuntimeConfig().instanceId || 'default'
}
