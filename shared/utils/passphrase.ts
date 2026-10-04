// Génération de passphrases lisibles (R-07) : « castor-boussole-feu-2026 ».
// Mots sans accent pour faciliter la saisie sur téléphone.
export const WORDS = (
  'abeille abri acacia aigle aiguille ajonc alouette amande ancre anis arbre arc ardoise argile arnica '
  + 'astre aube aurore autour avoine badge baie balise bambou banjo barque bateau baton belette berger '
  + 'bivouac blaireau bleuet bois bouleau boussole bruyere buisson butte cabane cacao caillou camp canoe '
  + 'canyon cape carte castor cedre cerf chalet chamois chanson charme chene cheval chevreuil chouette '
  + 'cigale cime citron clairiere colline comete compas copain corde corbeau coteau coucou courage crapaud '
  + 'crete cuillere cygne dauphin delta dune ecureuil eclair ecorce elan erable escale etang etoile faucon '
  + 'fanion faon feu figue flambeau fleuve foret fougere fourmi framboise frene fusain galet gamelle gazelle '
  + 'genet glacier gland gourde grenier griotte grive guepe hache hamac herisson heron hetre hibou horizon '
  + 'houx ile iris jasmin jonc jungle kayak lac lagune lanterne lapin laurier lavande lezard lievre lilas '
  + 'loup lucane lune lynx machette mailloche marmotte marron menthe merle mesange meule miel moineau '
  + 'montagne mousse mouette myrtille noisette noyer nuage oasis olivier ombre orage orme ours outarde pagaie '
  + 'paille panda papillon pelle perdrix phare pierre pin pinson piquet piste plaine plateau plume pomme '
  + 'pont prairie puma quartz radeau raisin rameau raquette refuge renard riviere rocher roseau rossignol '
  + 'ruisseau sable sac sapin sauge saule sentier serpe silex sirop soleil source sureau tamis tente terrier '
  + 'thym tilleul tipi tisane tonnerre torrent totem tournesol trefle troupe truite tulipe vallee vent '
  + 'verger veillee violette volcan voile zebre '
  + 'agate algue antilope aubepine avalanche baleine banane bergeronnette biche bison boucle braise brindille '
  + 'cactus caravane carpe cascade cerise chaudron chevalet ciboulette clochette corail cormoran crevette '
  + 'dahlia daim datte dindon dragon epicea epine escargot faisan falaise fenouil flute fontaine gaufre '
  + 'girafe griffon groseille guitare hirondelle igloo jardin javelot koala lichen limace luciole mangue '
  + 'marais melon meteore narval nenuphar noix orque otarie papyrus pelican perche pivert poney prune'
).split(/\s+/)

export function randomInt(max: number): number {
  const buf = new Uint32Array(1)
  // Rejet pour éviter le biais modulo
  const limit = Math.floor(0xFFFFFFFF / max) * max
  do crypto.getRandomValues(buf)
  while (buf[0]! >= limit)
  return buf[0]! % max
}

export function generatePassphrase(scoutYear: number, words = 3): string {
  const picked: string[] = []
  while (picked.length < words) {
    const w = WORDS[randomInt(WORDS.length)]!
    if (!picked.includes(w)) picked.push(w)
  }
  return [...picked, String(scoutYear + 1)].join('-')
}

/** Normalisation avant hachage : casse, accents, espaces et séparateurs. */
export function normalizePassphrase(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_.,;:]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
