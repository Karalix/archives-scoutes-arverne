# API REST, serveur MCP et CLI d'import

L'application expose une API REST versionnée (`/api/v1`) et un serveur MCP (`/mcp`) qui utilisent la même couche métier que l'admin (I-15). Un agent IA (Claude Code, par exemple) ou la CLI peut importer un dossier de camp en lot sans passer par l'interface. **Tout ce qu'un agent crée arrive en brouillon**, sauf jeton explicitement autorisé à publier.

- Contrat OpenAPI 3.1 : `GET /api/v1/openapi.json` ; documentation interactive : `/api/v1/docs` (I-04).
- Un agent n'a besoin que de cette URL et d'un jeton.

## Authentification et portées

Jetons personnels créés dans **Administration → Jetons d'API** : nom, portées, expiration (90 jours par défaut, 365 au plus). Le jeton (`asc_…`) n'est affiché qu'une fois, il est stocké haché et révocable (I-01). Envoi : `Authorization: Bearer asc_…`.

| Portée | Permet | Exemple |
|---|---|---|
| `read` | Lire documents, années, événements, taxonomie ; `plan_import` | `GET /api/v1/documents?year=2019` |
| `write` | Créer / modifier **en brouillon**, téléverser, mettre à la corbeille | `POST /api/v1/documents:batch` |
| `publish` | Publier / dépublier, changer la visibilité, créer un document `forcePublic` | `POST /api/v1/documents:publish` |

- Un jeton ne dépasse jamais le rôle de son créateur : un *contributor* ne peut pas obtenir `publish` (I-02).
- **Aucun jeton** n'accède aux réglages sensibles : pivot, mots de passe annuels, administrateurs, jetons (`/api/admin/**` exige une session admin : réponse `401`).
- Chaque action est tracée dans le journal d'audit avec l'acteur `token:<nom>` ; limite de 600 requêtes / minute par jeton (I-03).

## Ressources REST

| Méthode et chemin | Portée | Rôle |
|---|---|---|
| `GET /api/v1/settings` | read | Branches, types d'événements, années existantes |
| `GET/POST /api/v1/years`, `PATCH/DELETE /api/v1/years/{startYear}` | read / write (`DELETE` : publish) | Années scoutes (`startYear` = année de début, 2019 pour 2019-2020) |
| `GET/POST /api/v1/events`, `PATCH/DELETE /api/v1/events/{id}` | read / write | Événements (camp, week-end…) |
| `GET/POST /api/v1/documents`, `GET/PATCH/DELETE /api/v1/documents/{id}` | read / write | Documents (`DELETE` = corbeille, jamais de suppression définitive) |
| `POST /api/v1/documents/{id}/restore` | write | Sortie de corbeille |
| `PUT /api/v1/documents/{id}/files/{main\|thumb\|captions\|original}` | write | Envoi direct jusqu'à 50 Mo |
| `POST /api/uploads`, `GET /api/uploads/{id}`, `PUT {partUrl}`, `POST /api/uploads/{id}/complete`, `DELETE /api/uploads/{id}` | write | Téléversement multipart (parties de 50 Mo) |
| `POST /api/v1/documents:batch` | write | Jusqu'à 100 créations / mises à jour |
| `POST /api/v1/documents:publish`, `:unpublish` | publish | Liste d'identifiants |
| `POST /api/v1/documents:trash` | write | Mise à la corbeille en lot (rétention 30 jours) |
| `POST /api/v1/plan-import` | read | Classement proposé d'une liste de fichiers, n'écrit rien |
| `GET /api/v1/tags` | read | Mots-clés existants |

### Idempotence et reprise (I-07)

- `externalId` (ex. chemin du fichier source) est **unique par instance** : renvoyer le même document met à jour au lieu de dupliquer.
- En-tête `Idempotency-Key` sur toute création : la même clé rejoue la réponse d'origine (en-tête `Idempotent-Replayed: true`) pendant 7 jours.

### Simulation (I-08)

`?dryRun=true` sur les écritures : renvoie ce qui serait créé (année déduite, événement rattaché, conflits) sans rien écrire.

### Lots (I-06)

Réponse ligne par ligne, jamais tout-ou-rien silencieux :

```json
{ "dryRun": false, "ok": false, "results": [
  { "index": 0, "ok": true, "action": "create", "id": "01J…", "externalId": "2019_camp-ete/SG_montage.mp4" },
  { "index": 1, "ok": false, "status": 422, "error": "Année 2031-2032 inexistante", "hint": "Créez-la avec POST /api/v1/years {\"startYear\": 2031}" }
] }
```

### Erreurs (I-10)

Format `application/problem+json` (RFC 9457) avec un champ `hint` actionnable :

```json
{ "type": "about:blank", "title": "Données invalides", "status": 422,
  "detail": "Vidéo non conforme : codec mp4v (H.264 attendu)",
  "problems": ["codec mp4v (H.264 attendu)"],
  "ffmpeg": "ffmpeg -i \"camp.mp4\" -c:v libx264 … -movflags +faststart \"camp_720p.mp4\"",
  "hint": "Encodez localement : ffmpeg … puis renvoyez le fichier." }
```

| Code | Cas typique |
|---|---|
| 401 | Jeton absent, invalide, expiré ou révoqué ; route admin appelée avec un jeton |
| 403 | Portée manquante (ex. publication sans `publish`) |
| 409 | Conflit (année non vide, envoi déjà finalisé, originaux désactivés) |
| 413 | Fichier > 50 Mo en envoi direct : passer en multipart |
| 415 | Type réel refusé (signature binaire ; HTML/SVG toujours refusés, L-13) |
| 422 | Validation (champ manquant, vidéo non conforme avec la commande ffmpeg exacte) |
| 429 | Limite de débit, en-tête `Retry-After` |

## Exemples curl

```bash
export URL=https://archives.mongroupe.fr TOKEN=asc_…
H="Authorization: Bearer $TOKEN"

# Année et brouillon (idempotent)
curl -sf -X POST "$URL/api/v1/years" -H "$H" -H 'content-type: application/json' -d '{"startYear":2018}'
curl -sf -X POST "$URL/api/v1/documents" -H "$H" -H 'content-type: application/json' \
  -H 'Idempotency-Key: 2019_camp-ete_SG_montage' \
  -d '{"externalId":"2019_camp-ete/SG_montage.mp4","year":2018,"kind":"video","title":"Montage","branch":"SG","event":{"title":"Camp d'\''été","type":"Camp d'\''été"}}'

# Envoi direct (≤ 50 Mo) : vignette
curl -sf -X PUT "$URL/api/v1/documents/$DOC/files/thumb?filename=vignette.jpg" -H "$H" \
  -H 'content-type: image/jpeg' --data-binary @vignette.jpg
```

### Téléversement multipart (T-04, I-09)

1. Créer l'envoi : la réponse contient `id`, `partSize` (52 428 800 octets), `partCount`, `missing` et `partUrls` (URL **signées valables 15 min**, relatives en REST, absolues via MCP ; pas besoin de jeton pour les appeler).
2. Envoyer chaque partie `n` avec `dd` (la dernière est plus courte).
3. Finaliser : vérification du type réel, de la conformité vidéo (V-01), génération des métadonnées.

```bash
FILE=camp_720p.mp4; SIZE=$(stat -c %s "$FILE")
UP=$(curl -sf -X POST "$URL/api/uploads" -H "$H" -H 'content-type: application/json' \
  -d "{\"documentId\":\"$DOC\",\"variant\":\"main\",\"filename\":\"$FILE\",\"size\":$SIZE,\"mime\":\"video/mp4\"}")
ID=$(echo "$UP" | jq -r .id); PS=$(echo "$UP" | jq -r .partSize)

echo "$UP" | jq -r '.partUrls[] | "\(.partNumber) \(.url)"' | while read -r N PART; do
  dd if="$FILE" bs="$PS" skip=$((N-1)) count=1 2>/dev/null \
    | curl -sf -X PUT --data-binary @- -H 'content-type: application/octet-stream' "$URL$PART"
done

curl -sf -X POST "$URL/api/uploads/$ID/complete" -H "$H" -H 'content-type: application/json' -d '{}'
```

Reprise après coupure : `GET /api/uploads/$ID` renvoie `missing` et de nouvelles `partUrls` pour les seules parties manquantes. Une URL de partie expirée répond `403` : redemandez-la de la même façon.

### Format vidéo attendu (V-01)

MP4, H.264 High, AAC 128 kbit/s, 720p, 1,5 à 2 Mbit/s, **faststart**. Une source déjà en H.264 ≤ 1080p et ≤ 4 Mbit/s avec faststart est acceptée telle quelle. Sinon :

```bash
ffmpeg -i "source.mp4" -c:v libx264 -profile:v high -preset slow -crf 23 -maxrate 2M -bufsize 4M \
  -vf "scale=-2:'min(720,ih)'" -c:a aac -b:a 128k -movflags +faststart "rendu.mp4"
ffmpeg -ss 12 -i "rendu.mp4" -frames:v 1 -vf "scale=640:-2" -q:v 3 "vignette.jpg"   # vignette à ~10 % de la durée
```

## Serveur MCP `/mcp`

Serveur MCP distant, transport *Streamable HTTP* sans état, dans le même Worker, authentifié par le même jeton (I-11). Les outils visibles dépendent des portées du jeton : un jeton sans `publish` ne voit pas `publish_documents`.

```bash
claude mcp add --transport http archives https://archives.mongroupe.fr/mcp \
  --header "Authorization: Bearer asc_…"
```

| Outil | Rôle | Portée |
|---|---|---|
| `get_conventions` | Branches, types d'événements, années, règle de nommage, format vidéo et commandes ffmpeg, limites | read |
| `search_documents` | Recherche plein texte et filtres (année, branche, statut, type, externalId) | read |
| `get_document` | Détail d'un document, avec URL média signées « admin » (`&a=1`, 6 h) valables sans session, y compris pour les brouillons : ne les partagez pas | read |
| `plan_import` | Reçoit une liste de fichiers (chemin, taille, durée), renvoie le classement proposé ; n'écrit rien | read |
| `upsert_year`, `upsert_event` | Créer ou compléter une année, un événement (`dryRun` possible) | write |
| `create_documents` | Crée ou met à jour (par `externalId`) jusqu'à 100 brouillons | write |
| `request_upload` | URL signées (15 min) des parties à envoyer avec curl ; `uploadId` pour reprendre | write |
| `complete_upload` | Finalise, vérifie la conformité ; sinon renvoie la commande ffmpeg | write |
| `update_documents` | Métadonnées en lot | write |
| `trash_documents` | Corbeille (aucune suppression définitive par MCP, I-14) | write |
| `publish_documents` | Passe des brouillons en publié | publish |

Les binaires ne transitent **jamais** par MCP (I-13) : l'agent les envoie avec `curl` depuis son terminal.

### Prompt `import_camp_folder`

Déroulé recommandé, fourni par le serveur (`prompts/get`, argument `folder`) :

1. `get_conventions` ;
2. lister les fichiers (chemin, taille ; durée avec `ffprobe -v error -show_entries format=duration -of csv=p=0`) ;
3. `plan_import`, présenter le plan sous forme de tableau et **attendre la validation humaine** ;
4. `upsert_year` / `upsert_event` pour ce qui manque ;
5. ré-encoder les vidéos marquées `needsEncoding` avec la commande fournie, extraire une vignette ;
6. `create_documents` en brouillon avec `externalId` = chemin source ;
7. pour chaque fichier : `request_upload`, `curl` de chaque partie, `complete_upload` (et la vignette, variante `thumb`) ;
8. donner le lien `/admin/documents?status=draft` pour relecture ; `publish_documents` seulement sur demande et si le jeton le permet.

Relancé après une coupure, l'agent ne crée aucun doublon (externalId, reprise des envois par `uploadId`).

## CLI d'import

Simple client de l'API REST (6.3 voie 2, I-15). Prérequis : Node ≥ 20, `ffmpeg` et `ffprobe` dans le PATH, `pdftoppm` facultatif.

```bash
npx archives-scoutes import ./Archives --url https://archives.mongroupe.fr --token asc_… [--dry-run] [--yes] [--publish]
```

| Étape | Comportement |
|---|---|
| Analyse | Parcourt le dossier, mesure les vidéos (`ffprobe`), appelle `plan-import`, affiche le classement |
| Validation | Demande confirmation (`--yes` pour l'omettre, `--dry-run` pour s'arrêter là) |
| Années | Crée les années manquantes |
| Brouillons | `documents:batch` par lots de 100, `externalId` = chemin relatif |
| Vidéos | Conforme → réécriture faststart sans ré-encodage ; sinon ré-encodage 720p ; vignette à 10 % |
| Photos | WebP 1 600 px et 400 px, métadonnées (dont GPS) supprimées (V-06) |
| Envoi | Direct ≤ 50 Mo, multipart au-delà, 3 parties en parallèle, nouvel essai progressif en cas de coupure |
| Reprise | État dans `<dossier>/.archives-import.json` : relancez la même commande, les fichiers terminés sont sautés et un multipart interrompu reprend aux parties manquantes |
| Publication | `--publish` publie les documents envoyés si le jeton a la portée `publish` |

Autres commandes : `export <manifeste.json> --out <dossier>` (télécharge métadonnées et fichiers depuis un manifeste d'export) et `reset-link --email … [--remote]` (lien de réinitialisation du mot de passe owner, via `wrangler d1`).

## Convention de nommage

Segments séparés par `_` (ou des espaces), dans n'importe quel ordre ; les dossiers comptent comme des segments (`plan_import` joint les trois derniers niveaux du chemin).

| Segment | Signification | Exemple |
|---|---|---|
| `2019-2020` | Année scoute explicite (début 2019) | `2019-2020_week-end_LJ_rando.mp4` → 2019-2020 |
| `2021-07-14` | Date complète : l'année scoute en est déduite (bascule en septembre) | → 2020-2021, date conservée |
| `2019` seul | Année scoute qui **commence** en 2019, **sauf camp d'été** : c'est l'été 2019, donc **2018-2019** | `2019_camp-ete_SG_montage.mp4` → 2018-2019 |
| Code de branche | `FA`, `LJ`, `SG`, `PK`, `CO`, `CH` (paramétrables), casse indifférente | `SG` → Scouts-Guides |
| Type d'événement | Slug du type (`camp-dete`, `week-end`, `fete-de-groupe`, `sortie`…) ; `camp-ete`, `ete`, `grand-camp` valent camp d'été | `week-end` → Week-end |
| Reste | Forme le titre (tirets et points → espaces, majuscule initiale) | `soiree-feu` → « Soiree feu » |

Exemples :

| Fichier | Année | Événement | Branche | Titre |
|---|---|---|---|---|
| `2019_camp-ete_SG_montage.mp4` | 2018-2019 | Camp d'été | SG | Montage |
| `2019-2020_week-end_LJ_rando.mp4` | 2019-2020 | Week-end | LJ | Rando |
| `2021-07-14_camp_PK_soiree-feu.mp4` | 2020-2021 | Camp | PK | Soiree feu |
| `2010/journal-de-bord.pdf` | 2010-2011 | — | — | Journal de bord |
