# Guide installateur — votre instance en 15 minutes

Ce guide s'adresse à un bénévole sans compétence technique particulière. Aucune ligne de commande n'est nécessaire (D-01). Comptez 15 minutes, hors import des vidéos.

> Les captures d'écran sont à placer dans `docs/images/` sous les noms indiqués.

## Avant de commencer

| Il vous faut | Pourquoi |
|---|---|
| Une adresse e-mail **fonctionnelle du groupe** (ex. `archives@mongroupe.fr`) | Les comptes ne doivent pas dépendre d'un chef appelé à partir (D-05) |
| **Deux personnes** au moins qui auront accès aux comptes | Si l'une part, l'autre garde la main |
| Le nom du groupe, un logo (PNG/WebP carré), une couleur | Personnalisation de l'accueil |
| 15 minutes et un ordinateur | Le téléphone suffit ensuite pour gérer |

## Étape 1 — Créer le compte GitHub du groupe (3 min)

1. Allez sur <https://github.com/signup> et créez un compte avec l'adresse du groupe (ex. identifiant `scouts-saint-exupery`).
2. Activez l'authentification à deux facteurs (Settings → Password and authentication).
3. Pour un second administrateur : créez une **organisation** gratuite (bouton « + » → New organization) et invitez-y la seconde personne comme *Owner*. Le dépôt sera créé dans cette organisation.

![Création du compte GitHub](images/github-signup.png)

## Étape 2 — Créer le compte Cloudflare du groupe (3 min)

1. Allez sur <https://dash.cloudflare.com/sign-up> avec la même adresse du groupe. L'offre gratuite suffit.
2. Validez l'adresse e-mail, activez la double authentification (My Profile → Authentication).
3. Ajoutez le second administrateur : Manage Account → Members → Invite, rôle *Administrator*.

![Membres du compte Cloudflare](images/cloudflare-members.png)

## Étape 3 — Cliquer sur le bouton de déploiement (5 min)

1. Ouvrez la page du projet : <https://github.com/karalix/archives-scoutes> et cliquez sur **Deploy to Cloudflare**.

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/karalix/archives-scoutes)

2. Connectez votre compte GitHub (celui du groupe ou son organisation) et votre compte Cloudflare.
3. Dans le formulaire :
   - **Nom du projet / Worker** : par ex. `archives-saint-exupery` (il formera l'adresse `archives-saint-exupery.<compte>.workers.dev`).
   - **Base D1** et **bucket R2** : laissez les noms proposés, ils sont créés automatiquement.
   - **Commandes** : laissez celles proposées ; la commande de déploiement doit être `npm run deploy` (elle applique les migrations de la base avant de déployer).
   - **Secrets** : voir le tableau ci-dessous.

![Formulaire Cloudflare](images/deploy-form.png)

| Secret | À quoi il sert | Que mettre |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | Chiffre les cookies de session | La valeur générée proposée, ou 32 caractères aléatoires minimum |
| `NUXT_INSTALL_TOKEN` | Protège la page de premier lancement `/install` | Un mot de passe que **vous notez** : il vous sera demandé à l'étape 4 |
| `NUXT_MEDIA_SIGNING_KEY` | Signe les liens des vidéos et photos | La valeur générée proposée, ou 32 caractères aléatoires minimum |

Pour générer une valeur vous-même : un gestionnaire de mots de passe (« 32 caractères »), ou `openssl rand -base64 32` dans un terminal. Conservez ces valeurs dans le gestionnaire de mots de passe du groupe. **Ne modifiez plus `NUXT_MEDIA_SIGNING_KEY`** après l'installation : les mots de passe annuels deviendraient invalides.

4. Cliquez sur **Créer et déployer**. Cloudflare copie le projet dans votre GitHub, crée la base et le stockage, applique les migrations D1 et affiche l'adresse `https://….workers.dev` (2 à 4 minutes).

![Déploiement terminé](images/deploy-done.png)

> **Si la page `/install` affiche une erreur de table manquante** : les migrations n'ont pas été appliquées. Dans Cloudflare → Workers & Pages → votre Worker → Settings → Build, vérifiez que la commande de déploiement est `npm run deploy`, puis relancez le dernier déploiement (Deployments → Retry).

## Étape 4 — Premier lancement `/install` (3 min)

1. Ouvrez `https://<votre-worker>.workers.dev/install`.
2. Saisissez le **jeton d'installation** (`NUXT_INSTALL_TOKEN`).
3. Créez le compte **owner** : votre nom, l'adresse du groupe ou la vôtre, un mot de passe solide (≥ 10 caractères). Vous pourrez ajouter une passkey ensuite.
4. Renseignez le nom du groupe et sa couleur.
5. **Année pivot** : l'assistant propose le mode **glissant à 10 ans** (L-01) : sont publiques les années qui ont commencé il y a plus de 10 ans. Ce délai garantit que les jeunes visibles sont aujourd'hui majeurs. Ne le réduisez qu'après accord du groupe (RG, maîtrise) et vérification de la politique image du mouvement.
6. **Premier mot de passe annuel** : acceptez la proposition (ex. `castor-boussole-feu-2027` pour 2026-2027) ou saisissez le vôtre. Il n'est affiché **qu'une fois** : copiez-le.

![Assistant d'installation](images/install-wizard.png)

Ensuite, dans l'administration :

- **Paramètres** : logo, texte d'accueil, e-mail de contact, branches et types d'événements, mentions légales et politique de confidentialité (partez des modèles [mentions légales](modele-mentions-legales.md) et [confidentialité](modele-politique-confidentialite.md)).
- **Administrateurs** : invitez le second administrateur (lien à usage unique valable 7 jours, à lui transmettre vous-même : l'application n'envoie aucun e-mail).

## Étape 5 (option) — Domaine personnalisé

Pour une adresse comme `archives.mongroupe.fr` :

1. Le domaine doit être géré par Cloudflare. S'il est chez un autre registraire (OVH, Gandi…) : Cloudflare → **Add a domain** → saisissez `mongroupe.fr` → offre Free → Cloudflare affiche deux serveurs de noms ; remplacez ceux de votre registraire par ceux-ci (interface du registraire, rubrique « Serveurs DNS »). La propagation prend de quelques minutes à 24 h. Vérifiez auparavant que les enregistrements existants (site, e-mail MX) ont bien été repris par Cloudflare.
2. Cloudflare → Workers & Pages → votre Worker → **Settings → Domains & Routes → Add → Custom domain**.
3. Saisissez `archives.mongroupe.fr` et validez. Cloudflare crée l'enregistrement DNS et le certificat HTTPS automatiquement.
4. Testez l'adresse, puis communiquez celle-ci aux familles.

![Domaine personnalisé](images/custom-domain.png)

## Étape 6 (à vérifier) — Données hébergées dans l'Union européenne

R2 permet de restreindre un bucket à la **juridiction UE** (L-08), mais ce choix se fait **à la création du bucket**, et le bouton de déploiement crée un bucket sans juridiction. Ce point reste à vérifier avec la version actuelle du bouton. Si le groupe exige un stockage UE, avant d'importer des fichiers :

1. Cloudflare → R2 → **Create bucket** → nom `archives-scoutes-media-eu`, *Location* → **Specify jurisdiction → European Union**.
2. Dans votre dépôt GitHub, éditez `wrangler.jsonc` (crayon « Edit » sur GitHub) :

   ```jsonc
   "r2_buckets": [
     { "binding": "BLOB", "bucket_name": "archives-scoutes-media-eu", "jurisdiction": "eu" }
   ],
   ```

3. Validez (« Commit changes ») : Cloudflare redéploie. Supprimez l'ancien bucket vide.

La base D1 peut aussi recevoir un indice de localisation (`location hint` Europe) à sa création. Indiquez le choix retenu dans la politique de confidentialité.

## Étape 7 — Mises à jour automatiques (D-02)

Le dépôt contient une GitHub Action, `.github/workflows/sync-upstream.yml`, qui chaque lundi compare votre copie au dépôt source et ouvre une pull request **« Mise à jour depuis le dépôt source »**.

Une fois, pour l'activer :

1. GitHub → votre dépôt → **Actions** → si demandé, « I understand my workflows, go ahead and enable them ».
2. **Settings → Actions → General → Workflow permissions** : cochez **Read and write permissions** et **Allow GitHub Actions to create and approve pull requests**.
3. (Recommandé) Si une mise à jour modifie elle-même les fichiers `.github/workflows/`, GitHub refuse de la pousser avec le jeton par défaut. Créez un jeton personnel *fine-grained* (Settings du compte → Developer settings → Personal access tokens) limité à ce dépôt, avec les droits *Contents*, *Pull requests* et *Workflows* en écriture, et enregistrez-le dans le dépôt sous **Settings → Secrets and variables → Actions → New repository secret**, nom `SYNC_TOKEN`.

Ensuite, à chaque pull request : lisez le résumé, cliquez sur **Merge pull request**. Cloudflare reconstruit, applique les migrations et redéploie en quelques minutes. Les migrations sont uniquement additives entre versions mineures (D-03) ; une sauvegarde hebdomadaire de la base est faite dans le bucket (L-14). Vous pouvez aussi lancer la vérification à la main : Actions → *Synchronisation avec le dépôt source* → **Run workflow**. La version installée et la disponibilité d'une mise à jour sont affichées dans l'admin.

## Étape 8 (option) — Cloudflare Stream (D-07)

Par défaut, les vidéos sont encodées dans le navigateur de l'admin (ou par la CLI) et servies depuis R2 : environ 0 à 1 $ par mois. Cloudflare Stream encode à votre place et diffuse en HTTP Live Streaming adaptatif, pour environ 7 $ / mois pour le groupe pilote (5 $ / 1 000 min stockées + 1 $ / 1 000 min regardées). Pour l'activer :

1. Cloudflare → **Stream** → souscrivez l'offre (moyen de paiement requis).
2. My Profile → **API Tokens → Create Token → Custom token** : permission *Account → Stream → Edit*, limitée à votre compte. Copiez le jeton.
3. Notez l'**Account ID** (colonne de droite de la page d'accueil du compte).
4. Dans l'admin → **Paramètres → Stockage** (rôle owner) : activez Cloudflare Stream, collez l'identifiant de compte et le jeton. C'est la seule étape manuelle, et elle est facultative.

## Récapitulatif à conserver

| Élément | Où le retrouver |
|---|---|
| Comptes GitHub et Cloudflare du groupe | gestionnaire de mots de passe du groupe, 2 administrateurs |
| Les 3 secrets | gestionnaire de mots de passe ; modifiables dans Cloudflare → Worker → Settings → Variables and Secrets |
| Compte owner de l'application | personne responsable + second admin invité |
| Mot de passe annuel en cours | admin → Mots de passe (créer un nouveau à chaque rentrée : [guide rentrée](guide-rentree.md)) |
| Copie hors ligne des originaux | disque du groupe (l'application n'est pas une sauvegarde, V-05) |
