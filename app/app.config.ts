// Direction visuelle : musée d'art moderne — murs blancs, grotesque, filets fins, aucun arrondi.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'neutral',
      neutral: 'neutral',
    },
    button: {
      slots: { base: 'rounded-none font-normal tracking-wide' },
    },
    badge: {
      slots: { base: 'rounded-none font-normal uppercase tracking-[0.12em] text-[0.65rem]' },
    },
    input: { slots: { base: 'rounded-none' } },
    select: { slots: { base: 'rounded-none' } },
    selectMenu: { slots: { base: 'rounded-none' } },
    textarea: { slots: { base: 'rounded-none' } },
    modal: { slots: { content: 'rounded-none ring-0 shadow-none border border-default' } },
    header: { slots: { root: 'border-b border-default bg-default/95 backdrop-blur-none h-(--ui-header-height)' } },
  },
})
