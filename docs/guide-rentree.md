# Guide « rentrée scoute »

À faire chaque année au mois de bascule (septembre par défaut). L'admin affiche un rappel : « Pensez à créer le mot de passe 2026-2027 » (R-08). Durée : 5 minutes. Rôle requis : *editor* ou *owner*.

## 1. Vérifier l'année pivot

Les années ≤ pivot sont publiques ; les autres demandent le mot de passe annuel. Changer le pivot ne déplace aucun fichier : l'effet est immédiat (R-04).

| Mode | Ce qui se passe à la rentrée | Action |
|---|---|---|
| **Glissant** (par défaut, N = 10 ans) | Le pivot avance tout seul au 1er jour du mois de bascule : en septembre 2026, l'année 2016-2017 devient publique | Rien à faire ; vérifiez dans Paramètres → Accès que le pivot affiché est celui attendu |
| **Fixe** | Rien ne bouge tant que vous ne modifiez pas la valeur | Paramètres → Accès → année pivot **+ 1**, enregistrez |

Avant d'avancer le pivot, parcourez l'année qui va devenir publique et passez en « Toujours protégé » (`forcePrivate`) ou « Masqué » les documents qui ne doivent pas être exposés (demande de retrait, image sensible). Le changement de pivot est tracé dans le journal d'audit.

Exemple : en septembre 2026 avec un pivot glissant à 10 ans, le pivot passe de 2015 à 2016. L'année 2016-2017 devient visible de tous ; 2017-2018 et suivantes restent protégées.

## 2. Créer le mot de passe de l'année

1. Admin → **Mots de passe** → **Nouveau mot de passe**.
2. Choisissez l'année scoute qui commence (ex. **2026-2027**).
3. Acceptez la proposition (ex. `castor-boussole-feu-2027`) ou tapez la vôtre (8 caractères minimum ; majuscules, accents et espaces sont ignorés à la saisie).
4. **Copiez-le maintenant** : il est stocké haché et ne sera plus jamais affiché.

Ce mot de passe ouvre toutes les années protégées **jusqu'à 2026-2027 incluse** (R-05). Les mots de passe des années précédentes restent valides : une famille partie en 2025 garde l'accès à ses années, sans voir les suivantes.

## 3. Prévenir les familles

Bouton **Copier le message** à la création, ou adaptez ce modèle :

> Bonjour à toutes et à tous,
>
> Les archives du groupe (photos, montages vidéo des camps, carnets) sont en ligne : **https://archives.mongroupe.fr**
>
> Les années récentes sont protégées pour respecter l'image des jeunes. Pour les voir, cliquez sur une année marquée d'un cadenas et saisissez le mot de passe **2026-2027** :
>
> **castor-boussole-feu-2027**
>
> Merci de ne pas le diffuser en dehors du groupe. Le téléchargement des archives récentes n'est pas possible : elles se regardent en ligne uniquement. Pour toute demande de retrait d'une photo ou d'une vidéo, utilisez le bouton « Signaler / demander un retrait » sous le document.
>
> Bonne année scoute !
> L'équipe des archives

## 4. (Option) Lien de partage sans saisie

Admin → Mots de passe → ligne de l'année → **Lien de partage** : choisissez une durée (30 jours par défaut, 365 au plus). Vous obtenez une adresse du type `https://archives.mongroupe.fr/?cle=…` qui ouvre directement l'accès, sans saisie (R-11). Utile pour un message WhatsApp aux parents. Le lien cesse de fonctionner à son expiration ou si le mot de passe est révoqué.

## 5. Révoquer un ancien mot de passe (si nécessaire)

Révoquez un mot de passe s'il a fuité (publié sur un réseau social, transmis hors du groupe) :

1. Admin → Mots de passe → ligne concernée → **Révoquer**.
2. Toutes les sessions ouvertes avec ce mot de passe perdent l'accès **immédiatement**, ainsi que ses liens de partage.
3. Les familles concernées devront saisir un mot de passe plus récent : prévenez-les avec le nouveau.

Révoquer n'est pas nécessaire en temps normal : l'historique (année, date, nombre d'utilisations) aide à repérer un usage anormal (nombre d'utilisations qui explose).

## Liste de contrôle

- [ ] Pivot vérifié (glissant) ou avancé d'un an (fixe)
- [ ] Documents de l'année qui devient publique relus (retraits en `forcePrivate` / masqué)
- [ ] Nouveau mot de passe créé et copié dans le gestionnaire de mots de passe du groupe
- [ ] Message envoyé aux familles (et lien de partage si besoin)
- [ ] Mots de passe ayant fuité révoqués
- [ ] Nouvelle année scoute créée dans Admin → Années, prête pour le camp d'été
