# Archives scoutes

Application web qui publie les archives d'un groupe scout (montages vidéo de camps, photos, carnets PDF, chants), classées par **année scoute** (septembre → août). Les années anciennes sont publiques ; les années récentes, où figurent des jeunes encore inscrits, ne s'ouvrent qu'avec le **mot de passe annuel** distribué aux familles. Elle est conçue pour qu'un autre groupe déploie sa propre instance en un clic sur un compte Cloudflare gratuit, et reste propriétaire de ses données.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/karalix/archives-scoutes)

Nuxt 4 · Nuxt UI · NuxtHub (D1 + R2) · Cloudflare Workers · licence MIT.

## Fonctionnalités

| Domaine | Ce que fait l'application | Exigences |
|---|---|---|
| Accès | Années ≤ année pivot publiques ; pivot fixe ou glissant (année courante − N, 10 ans par défaut) ; surcharge par document (`forcePrivate`, `forcePublic`, `hidden`) | R-01 → R-04, L-01 |
| Mot de passe annuel | Passphrase lisible (`castor-boussole-feu-2026`), stockée hachée, ouvre toutes les années jusqu'à la sienne ; révocation immédiate ; lien de partage signé `/?cle=…` ; 5 essais / 15 min par IP | R-05 → R-11 |
| Confidentialité | Années protégées : seuls le libellé et le nombre de documents sont visibles ; titres, vignettes et médias jamais servis sans session ; `noindex` | 3.4, L-04, L-11 |
| Consultation | Frise des années, page année par événement et branche, filtres, lecteur vidéo (Range), visionneuse PDF, galerie, audio, mode « soirée » TV | F-01 → F-09 |
| Recherche | Plein texte FTS5 limité aux documents autorisés, filtre par lieu | F-10, F-11 |
| Retrait | Bouton « Signaler / demander un retrait », file de signalements dans l'admin | F-12, L-02 |
| Administration | Passkey ou e-mail + mot de passe, rôles owner / editor / contributor, invitations par lien, brouillons, corbeille 30 jours, édition en lot, audit | A-01 → A-17 |
| Médias | URL signées HMAC (6 h pour le protégé), `206 Partial Content`, vérification du type réel, vidéos MP4 H.264 720p faststart | T-01 → T-04, V-01 → V-08, L-13 |
| Intégration | API REST `/api/v1` (OpenAPI 3.1), serveur MCP `/mcp`, CLI d'import reprenable | I-01 → I-15 |
| Exploitation | Sauvegarde hebdomadaire JSON (8 semaines), export complet, quota avec alerte, Action GitHub de mise à jour | A-15, A-16, L-14, D-02 |

## Installer une instance (sans ligne de commande)

Suivez le **[guide installateur](docs/guide-installateur.md)** (15 minutes). En résumé :

1. Prérequis : un compte **GitHub** et un compte **Cloudflare** gratuits, ouverts avec une adresse e-mail fonctionnelle du groupe, avec au moins deux administrateurs (D-05).
2. Cliquez sur le bouton **Deploy to Cloudflare** ci-dessus. Cloudflare copie le dépôt sur votre GitHub, crée la base D1 et le bucket R2, et déploie le Worker.
3. Renseignez les trois secrets demandés par le formulaire :

| Secret | Rôle | Valeur |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | Chiffre les cookies de session (admin et familles) | ≥ 32 caractères aléatoires |
| `NUXT_INSTALL_TOKEN` | Autorise le premier lancement `/install` | un mot de passe que vous notez |
| `NUXT_MEDIA_SIGNING_KEY` | Signe les URL des médias, liens de partage, jetons d'envoi | ≥ 32 caractères aléatoires |

Pour générer une valeur : `openssl rand -base64 32` (ou acceptez la valeur proposée par le formulaire). **Ne changez plus** `NUXT_MEDIA_SIGNING_KEY` ensuite : les mots de passe annuels y sont indexés.

4. Ouvrez `https://<votre-worker>.workers.dev/install`, saisissez le jeton d'installation, créez le compte owner, le nom du groupe, l'année pivot (10 ans proposés) et le premier mot de passe annuel.

Chaque rentrée : **[guide « rentrée scoute »](docs/guide-rentree.md)**.

## Développement local

```bash
npm i
cp .env.example .env        # puis remplacez les valeurs
npm run dev                 # http://localhost:3000, puis /install (jeton = NUXT_INSTALL_TOKEN)
```

- En développement, NuxtHub utilise une base SQLite locale et un stockage de fichiers local dans `.data/` (émulation de D1 et R2) ; supprimez `.data/` pour repartir de zéro.
- `npm run preview` construit le Worker et le lance avec `wrangler dev` (bindings D1/R2 émulés dans `.wrangler/`).
- `npm run deploy` déploie manuellement (build, migrations D1 distantes, `wrangler deploy`) ; en temps normal, chaque push sur `main` redéploie via Cloudflare.
- Les migrations sont dans `server/db/migrations/sqlite` (`npm run db:generate` après une modification du schéma ; migrations uniquement additives, D-03).

## Tests

| Commande | Contenu |
|---|---|
| `npx vitest run` | Tests unitaires : matrice d'accès exhaustive (statut × visibilité × année × session, pivot fixe et glissant), nommage des fichiers, passphrases, markdown, signatures de fichiers et conformité MP4 (fichiers générés avec ffmpeg si présent) |
| `npx vitest run --coverage` | Idem avec couverture ; seuil **100 %** imposé sur `shared/utils/access.ts` (L-09) |
| `node tests/e2e/access.e2e.mjs http://localhost:3000` | Recette HTTP des critères 12.2 contre un serveur lancé : anonyme, famille, révocation, URL signées, Range, jeton sans `publish`, MCP. Variables : `E2E_EMAIL`, `E2E_PASSWORD` (compte owner), `E2E_MEDIA_SIGNING_KEY` (facultatif). Consomme 1 des 5 essais de déverrouillage / 15 min de votre IP. |

La CI GitHub (`.github/workflows/ci.yml`) lance tests unitaires, typecheck et build à chaque push et pull request.

## CLI d'import

Pour reprendre un fonds existant (ex. 60 Go de vidéos) : la CLI ré-encode avec ffmpeg en 720p, crée les brouillons et envoie les fichiers par l'API REST. Elle est **reprenable** (état dans `.archives-import.json`) et **idempotente** (`externalId` = chemin du fichier).

```bash
# Jeton créé dans Administration → Jetons d'API (portées read + write, + publish pour --publish)
npx archives-scoutes import ./Archives --url https://archives.mongroupe.fr --token asc_… --dry-run
npx archives-scoutes import ./Archives --url https://archives.mongroupe.fr --token asc_…
npx archives-scoutes export ./archives-export-2026-10-04.json --out ./sauvegarde
npx archives-scoutes reset-link --email owner@mongroupe.fr --remote --url https://archives.mongroupe.fr
```

Depuis ce dépôt : `npm run cli -- import …`. Prérequis : Node ≥ 20, `ffmpeg`/`ffprobe` (vidéos, photos), `pdftoppm` facultatif (vignettes PDF). Convention de nommage : voir [docs/api-agents.md](docs/api-agents.md#convention-de-nommage).

## API REST et serveur MCP (agents IA)

- Contrat OpenAPI : `GET /api/v1/openapi.json`, documentation interactive : `/api/v1/docs`.
- Authentification : `Authorization: Bearer asc_…` (jeton créé dans l'admin, portées `read`, `write`, `publish`). Aucun jeton n'accède au pivot, aux mots de passe annuels, aux admins ni aux jetons.
- Serveur MCP (Streamable HTTP, sans état) :

```bash
claude mcp add --transport http archives https://archives.mongroupe.fr/mcp \
  --header "Authorization: Bearer asc_…"
```

Puis demandez par exemple : « Utilise le prompt import_camp_folder pour importer ./Camp-2025 ». Détails, exemples curl et liste des outils : **[docs/api-agents.md](docs/api-agents.md)**.

## Architecture

```text
            navigateur (public, familles, admin)          agent IA / CLI
                       │                                        │ Bearer
                       ▼                                        ▼
┌──────────────────────────── Worker Cloudflare (Nuxt 4 / Nitro) ──────────────────────────┐
│  pages SSR + /admin (SPA)   /api/public  /api/access  /api/admin   /api/v1 (REST)  /mcp │
│                    └──────── canView() : décision d'accès unique ────────┘               │
│                                   │ signe /m/{id}/{variante}?exp&sig (HMAC)             │
│  /m/:id/:variant ── vérifie la signature ── lit R2 avec Range → 206                      │
│  tâches planifiées : sauvegarde hebdo (lun. 3 h UTC), purge corbeille / journaux (3 h 15)│
└───────────────┬──────────────────────────────────────────┬──────────────────────────────┘
                ▼                                          ▼
        D1 (SQLite + FTS5)                       R2 (bucket privé, clés opaques)
  instance, year, event, document,           {instance}/docs/{documentId}/main|thumb|…
  access_password, admin_user, audit_log…    {instance}/originals/, {instance}/backups/
                                     ┆
                         Cloudflare Stream (option)
```

- Le contrôle d'accès vit dans `shared/utils/access.ts` (fonctions pures testées à 100 %) ; la route média ne fait que vérifier un jeton qu'elle a signé.
- Changer le pivot ne déplace aucun fichier : la décision est prise à la signature des URL (R-04).

## Estimateur de coût

Tarifs publics R2 (octobre 2026, hors TVA) : **0,015 $/Go-mois au-delà de 10 Go gratuits**, sortie de données **gratuite** (le coût ne dépend pas de l'audience). Workers + D1 restent dans l'offre gratuite pour un groupe type. Hypothèse : originaux ≈ 4,5 × le volume des rendus 720p (environ 13 Mo par minute de vidéo rendue).

| Vidéo rendue (720p) | ≈ durée | Coût R2 / mois, rendus seuls | Originaux (≈ 4,5×) | Coût R2 / mois, rendus + originaux |
|---:|---:|---:|---:|---:|
| 5 Go | ~6 h | **0 $** (offre gratuite) | 22,5 Go | 0,26 $ |
| 13 Go (groupe pilote) | ~16 h | **0,05 $** | 58,5 Go | 0,92 $ |
| 30 Go | ~38 h | **0,30 $** | 135 Go | 2,33 $ |
| 60 Go | ~77 h | **0,75 $** | 270 Go | 4,80 $ |
| 100 Go | ~128 h | **1,35 $** | 450 Go | 8,10 $ |
| 200 Go | ~256 h | **2,85 $** | 900 Go | 16,35 $ |

Calcul : `max(0, Go stockés − 10) × 0,015 $`. Ajoutez quelques Go pour les photos, PDF et sauvegardes.

**Option Cloudflare Stream** (encodage par Cloudflare, HLS adaptatif) : 5 $ / 1 000 min stockées (par blocs) + 1 $ / 1 000 min regardées. Pour le groupe pilote (~1 000 min stockées, ~2 000 min regardées / mois) : ≈ 7 $ / mois. À réserver à un groupe qui ne veut pas encoder lui-même.

## Documentation

| Document | Pour qui |
|---|---|
| [docs/guide-installateur.md](docs/guide-installateur.md) | Bénévole qui installe l'instance |
| [docs/guide-rentree.md](docs/guide-rentree.md) | Archiviste, chaque septembre |
| [docs/api-agents.md](docs/api-agents.md) | Import en masse : REST, MCP, CLI |
| [docs/modele-mentions-legales.md](docs/modele-mentions-legales.md) | Modèle à compléter par le groupe (L-07) |
| [docs/modele-politique-confidentialite.md](docs/modele-politique-confidentialite.md) | Modèle à compléter par le groupe (L-07) |

## Licence

[MIT](LICENSE). Le dépôt source doit rester public pour que le bouton « Deploy to Cloudflare » fonctionne (D-06).
