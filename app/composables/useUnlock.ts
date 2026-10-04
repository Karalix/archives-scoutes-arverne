/** Fenêtre de saisie du mot de passe annuel, partagée par toutes les pages. */
export function useUnlock() {
  const open = useState('unlock-open', () => false)
  const reason = useState<string | null>('unlock-reason', () => null)
  return {
    open,
    reason,
    ask(msg?: string) {
      reason.value = msg ?? null
      open.value = true
    },
  }
}
