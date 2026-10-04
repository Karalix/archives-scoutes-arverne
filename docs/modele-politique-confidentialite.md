# Modèle de politique de confidentialité

> **Modèle à compléter par le groupe (L-07)**, cohérent avec le fonctionnement de l'application (L-05, L-06), à coller dans Administration → Paramètres → Politique de confidentialité. Remplacez chaque `[…]`. À faire relire par l'association ou le mouvement : le groupe est responsable du traitement pour son instance.

Dernière mise à jour : [date]

## Responsable du traitement

**[Nom de l'association / du groupe]**, [adresse], représenté par [Prénom Nom, fonction]. Contact pour toute question ou demande : **[adresse e-mail du groupe]**.

## Ce que nous ne faisons pas

- Pas de compte visiteur, pas d'inscription, aucune adresse e-mail demandée aux familles.
- **Aucun traceur** : pas de publicité, pas d'outil de mesure d'audience tiers, pas de réseaux sociaux intégrés.
- Pas de reconnaissance faciale ; pas d'identification nominative des personnes sur les photos et vidéos par défaut.
- Aucune donnée n'est vendue ni cédée.

## Données traitées

| Données | Personnes concernées | Finalité | Base légale | Durée de conservation |
|---|---|---|---|---|
| Nom, adresse e-mail, mot de passe haché, passkeys | Administrateurs du site | Gérer les archives, tracer les modifications | Intérêt légitime du groupe | Durée de la fonction, puis suppression du compte |
| Journal d'audit (qui a publié, modifié, retiré) | Administrateurs | Sécurité, responsabilité des publications | Intérêt légitime | [Durée de vie de l'instance / à préciser] |
| Adresse IP **hachée** (jamais en clair), date, type d'événement | Visiteurs | Sécurité : limiter les essais de mot de passe, détecter les abus | Intérêt légitime | **30 jours** |
| Demandes de retrait (message, contact facultatif) | Personnes qui en font la demande | Traiter la demande | Obligation légale / intérêt légitime | [Durée du traitement + 1 an] |
| Photos, vidéos, documents d'archive | Membres du groupe, anciens, familles | Mémoire du groupe | [Consentement / autorisations parentales / intérêt légitime — à préciser] | Durée de l'archive ; retrait sur demande |
| Statistiques de consultation (si activées) | Visiteurs | Connaître l'usage du site | Intérêt légitime | Agrégées côté serveur, sans cookie ni identifiant |

## Cookies

Le seul cookie déposé est un **cookie de session strictement nécessaire**, chiffré, `httpOnly`, déposé uniquement lorsque :

- une famille saisit le mot de passe annuel (il mémorise l'année jusqu'à laquelle l'accès est ouvert, pour [30] jours) ;
- un administrateur se connecte (7 jours).

Ce cookie étant indispensable au service demandé, il ne nécessite pas de consentement : il n'y a donc pas de bandeau cookies. Le bouton « Verrouiller » efface la session famille.

## Archives récentes

Les documents des **[10]** dernières années scoutes ne sont accessibles qu'avec le mot de passe annuel ; leurs titres et vignettes ne sont pas affichés sans ce mot de passe et ne sont pas indexés par les moteurs de recherche. Les liens vers les fichiers sont signés et expirent au bout de 6 heures. Le téléchargement de ces archives est impossible.

## Hébergement et transferts

Les données sont hébergées par **Cloudflare, Inc.** (États-Unis) : application (Workers), base de données (D1), fichiers (R2)[, vidéos (Stream)]. Localisation des fichiers : [Union européenne — juridiction EU du stockage R2 / non restreinte]. Cloudflare adhère au cadre de protection des données UE–États-Unis (Data Privacy Framework) ; voir <https://www.cloudflare.com/privacypolicy/>. [À vérifier et compléter.]

## Vos droits

Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de limitation sur les données qui vous concernent, ainsi que du droit de demander le **retrait d'une image** :

- bouton « Signaler / demander un retrait » sous chaque document ;
- ou e-mail à **[adresse]**.

Le document concerné est masqué sous **[7] jours**. Si la réponse ne vous satisfait pas, vous pouvez saisir la CNIL : <https://www.cnil.fr/fr/plaintes>.

## Sauvegardes

Une copie de la base de données (sans les fichiers) est réalisée chaque semaine dans le stockage du site et conservée **8 semaines**. Une donnée supprimée disparaît donc des sauvegardes au plus tard 8 semaines après sa suppression. Les documents mis à la corbeille sont définitivement supprimés après **30 jours**.
