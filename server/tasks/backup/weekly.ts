export default defineTask({
  meta: { name: 'backup:weekly', description: 'Export JSON hebdomadaire de la base dans le bucket (L-14)' },
  async run() {
    return { result: await runWeeklyBackup() }
  },
})
