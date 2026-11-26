# Ventes : filtres et période sur mesure — relevé des ventes groupé

Cahier des charges § 4.1 (« période personnalisée ») et § 4.7 (« Filtres par
date, machine, produit, montant et statut. Recherche par ID transaction »).
TACHES.md : « Relevé des ventes groupé côté SaaS ».

## 1. Page Ventes : recherche, filtres, période sur mesure

### Objectif
Retrouver une vente par son numéro de commande et filtrer la page Ventes — et
son export CSV — par période sur mesure, statut et produit.

### Règles
- Paramètres d'adresse, lus côté serveur (formulaires GET, pas de JavaScript) :
  - `f` (fenêtre toute faite) ou `du` + `au` (heure de Paris), résolus par
    `periodeDe` de `src/lib/tableau.ts` — la même règle que le tableau de bord
    et les analytiques (bornes à l'envers remises à l'endroit, saisie invalide
    → fenêtre par défaut) ;
  - `b` : la RedBox, vérifiée comme avant (du compte ET ouverte à la personne) ;
  - `q` : un morceau du numéro de commande, sans tenir compte de la casse
    (64 caractères au plus) ;
  - `statut` : un des statuts de `STATUTS` ; toute autre valeur est ignorée ;
  - `produit` : l'identifiant d'un produit ; un identifiant étranger au compte
    ne ramène rien.
- LA PORTÉE NE BOUGE PAS : toute requête garde `b.compte_id = <compte>` et la
  liste des bornes ouvertes. Un filtre ne peut que retirer des lignes, jamais en
  ajouter d'un autre exploitant ou d'une borne fermée.
- La période a désormais une fin (`faite_le < fin`) : une période sur mesure
  s'arrête à « au ».
- Les filtres s'appliquent à toutes les lectures de la page ; « À regarder »
  reste hors période (un souci non traité reste un souci) mais suit `q`,
  `statut`, `produit` et la borne.
- Nouvelle section « Transactions » : les 50 ventes les plus récentes qui
  répondent aux filtres ; l'export contient tout.
- L'export (`/api/ventes/export`) lit les mêmes paramètres et applique le même
  fragment SQL que la page (écrit une fois, dans `src/lib/ventes.ts`). Les liens
  d'export de la page portent les filtres en cours.
- Utilisable à 390 px : pas de débordement horizontal.

### Tests (`scripts/essai-ventes-filtres.mjs`, contre une console locale)
- Deux exploitants A et B, un même numéro de commande chez les deux : A ne voit
  jamais la vente de B, ni par `q`, ni par `b` = borne de B, ni par `produit` =
  produit de B, ni dans la page, ni dans l'export.
- Une personne restreinte à une borne ne voit que cette borne, même avec
  `b` = une autre borne du compte.
- `statut` filtre ; un statut inconnu est ignoré.
- `du`/`au` : une vente hors période est exclue, une dans la période incluse,
  bornes inversées acceptées.
- La page et l'export ramènent les mêmes commandes pour les mêmes paramètres.

## 2. Relevé des ventes groupé (`POST /api/borne/etat`)

### Objectif
Moins d'allers-retours vers la base par lot (la borne envoie jusqu'à 50 ventes).

### Règles
- Les produits du lot sont lus en UNE requête (`sku = ANY(...)`), rangés dans
  une Map.
- Par vente, l'INSERT de la vente, l'INSERT du mouvement et la décrémentation du
  canal partent en UNE instruction (CTE) au lieu de trois. Les ventes restent
  traitées une par une, dans l'ordre : le seuil « bas » d'une spire se franchit
  toujours une fois, au passage exact.
- Inchangés : `venteInvalide` (une vente illisible est écartée, pas le lot),
  `ON CONFLICT ... DO NOTHING` (un lot renvoyé n'ajoute rien), le double chemin
  `baseMigree`/`rabattu`, les notifications.

### Tests (`scripts/essai-releve-groupe.mjs`)
- Un lot (ventes distribuées, litige, avortée, sans SKU, SKU inconnu, sans
  canal, doublon dans le lot, une vente illisible au milieu, une spire qui passe
  son seuil et une qui se vide) envoyé deux fois : le second envoi ne retient
  rien et ne change rien.
- L'état produit (ventes, mouvements, canaux, messages du salon) est comparé à
  un instantané pris avec le code d'avant, sur une base migrée et sur une base
  d'avant la 5.13.

## Hors périmètre
- Filtre par montant (§ 4.7) : à ajouter au même fragment SQL si on le demande.
- Pagination de la liste des transactions (50 lignes, l'export a le reste).
- Regrouper la décrémentation des canaux de tout un lot : elle déciderait du
  franchissement des seuils autrement qu'aujourd'hui.
