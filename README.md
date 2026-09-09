# RedBox — console

Postgres (Neon) + Next 15. Sombre par défaut, mode clair, pensée pour un
téléphone tenu d’une main devant une machine ouverte.

```bash
npm install
npm run migrate      # applique src/db/schema.sql
npm run seed         # jeu d'essai, affiche les identifiants
npm run build && npm start        # http://localhost:4310
```

`.env.local` porte `DATABASE_URL` (poolée, pour servir les pages) et
`DATABASE_URL_UNPOOLED` (directe, pour les migrations : pgbouncer en mode
transaction refuse une partie du DDL).

## L’idée qui porte tout

**On n’enregistre pas des quantités, on enregistre des mouvements.**

« Il me reste 48 Puff Menthe » n’est pas un nombre rangé quelque part : c’est une
somme, et elle se déplie toujours en la liste des lignes qui l’ont produite.

```
lieu        réserve | borne          une réserve est un lieu comme une borne
mouvement   de_lieu → vers_lieu, quantité, motif, prix d'achat, qui, quand
```

Motifs : `reception`, `transfert`, `vente`, `perte`, `retour`, `inventaire`.

Un compteur qu’on modifie ne sait pas dire pourquoi il a changé. Un stock qui ne
s’explique pas, on cesse d’y croire ; et une fois qu’on n’y croit plus, on cesse
de le tenir. C’est comme ça qu’un outil de gestion meurt.

## Deux navigations, une par posture

**Sur écran large, un rail à gauche**, toujours visible, rangé en trois sections :
Exploitation, Approvisionnement, Configuration. Il montre **tout**, y compris ce
qui se visite rarement — c’est la différence entre un menu qu’on parcourt et un
plan qu’on lit. Chaque entrée porte sa pastille : canaux vides, litiges à
regarder, produits épuisés en réserve. Une seule requête les calcule toutes les
trois : le rail est sur chaque page, il n’a pas le droit d’en coûter trois.

**Au téléphone, une barre en bas**, là où se trouve le pouce, avec les cinq
destinations qu’on atteint d’une main. Les autres se rejoignent depuis celles-ci —
Réception s’allume sous Stock, Catalogue sous Réglages.

## Catégories

Une table, pas une chaîne libre posée sur le produit. Elles rangent le stock ici
**et décident de l’ordre d’affichage sur l’écran d’accueil des bornes** — le plus
petit `ordre` passe en premier. Une catégorie ne se supprime pas tant qu’elle
contient un produit.

Le stock et l’écran de chargement sont groupés par catégorie, en `<details>`
natifs : ça s’ouvre au doigt et au clavier, sans une ligne de JavaScript. **Les
sections qui ont un problème s’ouvrent seules** — l’écran s’ouvre sur ce qui
demande une décision, pas sur le début de l’alphabet.

Le chargement suit le geste réel : on remplit avec un carton dans les mains, pas
en marchant le long des rangées. On fait tous les canaux de Puffs, puis on prend
le carton suivant. Le numéro de canal reste sur chaque bloc — c’est lui qui dit où
poser la main.

## Tableau de bord

Il répond à quatre questions, dans cet ordre : est-ce que ça tourne, combien ça
rapporte, quelle borne marche le mieux, qu’est-ce qui va manquer.

**Seule une vente distribuée compte.** Un litige est un problème d’argent, pas un
chiffre d’affaires ; le compter gonflerait le total d’exactement le montant qu’il
faudra rembourser.

Le croisement **catégorie × borne** est en barres empilées, une couleur par borne,
la même d’une catégorie à l’autre — c’est ce qui permet de suivre une machine sans
relire la légende à chaque bloc.

**L’autonomie** divise le stock total — réserve, bornes et en route — par la
cadence de vente constatée. C’est le chiffre qui décide quand racheter : huit
unités, c’est trois semaines pour un briquet et deux jours pour une Puff, le stock
seul ne dit rien. Un produit qui ne s’est pas vendu n’a pas d’autonomie calculable
— on affiche `null`, jamais un infini déguisé en « tout va bien ».

Aucune bibliothèque de graphes : quelques `div`, et la page s’ouvre
instantanément sur un téléphone au fond d’un bar.

## Le transfert a deux dates

`fait_le` — vous saisissez le chargement, **votre réserve baisse aussitôt** : la
marchandise est dans vos mains.
`confirme_le` — la machine l’a inscrit sur ses compteurs.

Entre les deux, c’est « en route » : ni chez vous, ni dans la borne. Un transfert
jamais confirmé reste visible, parce que c’est exactement le cas où l’on croit
avoir chargé une machine qui n’a rien reçu.

La vue `v_stock` encode cette asymétrie : **ce qui sort compte dès la saisie, ce
qui entre ne compte qu’une fois confirmé.**

## Les transferts sont des écarts, pas des valeurs

La borne reçoit « +6 sur le canal 3 », jamais « mets le canal 3 à 8 ». Son
compteur reste le sien : on ne le remplace pas par un chiffre calculé ici, qui
aurait pu vieillir entre-temps.

L’idempotence tient donc à l’**identifiant**, que la machine retient une fois
appliqué et acquitte au relevé suivant. C’est la raison technique pour laquelle
la borne a besoin d’une vraie base locale : elle doit se souvenir durablement de
ce qu’elle a déjà appliqué.

## Appairage : le sens a été inversé

Avant, le SaaS émettait un code qu’il fallait taper **sur la borne** — sur le
clavier le plus pénible du dispositif, en équilibre devant une machine ouverte.

Maintenant c’est la borne qui demande :

1. `POST /api/borne/demande` → elle reçoit un code de six caractères et un secret
2. Elle affiche le code et son QR, et interroge `GET /api/borne/demande?secret=…`
3. Le propriétaire saisit ou scanne le code depuis son téléphone, nomme la borne
4. La machine récupère son jeton — **une seule fois** : il disparaît de la demande

Rien n’est authentifié côté machine : n’importe qui peut demander. Ce qui rattache
la borne à un compte, c’est un humain connecté qui lit le code — donc quelqu’un
qui est physiquement devant elle.

## API machine

| Route | Sens | Rôle |
|---|---|---|
| `POST /api/borne/demande` | borne → | demande d’adoption, renvoie code + secret |
| `GET /api/borne/demande?secret=` | borne → | attend le jeton |
| `GET /api/borne/config` | → borne | planogramme, prix, âges, **transferts à appliquer** |
| `POST /api/borne/etat` | borne → | canaux, ventes, santé, **transferts appliqués** |
| `POST /api/borne/journal` | borne → | les lignes nouvelles de `commandes.log` et `diagnostic.log` (5.13) |

Config et état renvoient `prochain_appel_s` : **30 s** tant qu’il reste
quelque chose à prendre, **300 s** sinon. La borne s’accélère toute seule quand il
se passe quelque chose.

Le relevé est rejouable de bout en bout : la clé `(borne, commande, canal, rang
de l'article)` absorbe les ventes en double, et le mouvement de vente est rattaché
à la vente elle-même — donc jamais compté deux fois, même après dix rejeux. Le rang
arrive avec la borne 5.13 : sans lui, deux articles d'une même commande servis par
la même spirale n'en faisaient qu'un.

### Ce qu'une vente peut être

Chaque article remonté porte un statut, qui dit **où** la vente s'est arrêtée
(borne 5.13 et plus ; la liste fait foi dans `src/lib/ventes.ts`) :

| statut | où ça s'arrête | ce qu'on en fait |
|---|---|---|
| `distribue` | la cellule a vu tomber l'article | chiffre d'affaires |
| `chute_non_detectee` | payé, la spirale a tourné, rien vu | **à regarder** — remboursement demandé au terminal |
| `non_distribue` | payé, la spirale n'a pas tourné | **à regarder** — remboursement demandé au terminal |
| `litige` | payé, rien n'est tombé, argent conservé | **à regarder** — rembourser chez Nayax |
| `age_refuse` | article retiré avant paiement | vente avortée |
| `carte_absente` | aucune carte présentée, ou annulé | vente avortée |
| `carte_refusee` | le terminal a dit non | vente avortée |
| `terminal_indisponible` | pas de terminal joignable | vente avortée |
| `avortee` | avant la spirale, sans motif (bornes ≤ 5.12) | vente avortée |

Seuls les trois « à regarder » demandent une action et portent un bouton
« Traité ». Les ventes avortées sont un compteur sur la fenêtre choisie : elles ne
coûtent rien à la caisse, mais dix par soir disent que le terminal ou le lecteur
d'identité font fuir des clients.

## Sans JavaScript

Toutes les mutations passent par des formulaires HTML vers des gestionnaires de
route. Ce n’est pas un archaïsme : sur cette version de Next, `cookies()` perd le
contexte de requête dans une Server Action appelée sans JS — vérifié sur une
action minimale de trois lignes. Le détour a un bénéfice réel : la console
fonctionne sur le téléphone qu’on a en main dans un bar mal couvert.

Une seule exception, le compteur `− [n] +` de l’écran de chargement : rendu par
le serveur comme un champ nombre ordinaire, il gagne ses deux boutons quand le
JavaScript arrive. Sans lui, on tape la quantité et ça marche.

## Rôles

| rôle | équipe | catalogue, planogramme | charger, litiges | lecture |
|---|---|---|---|---|
| `proprietaire` | oui | oui | oui | oui |
| `gerant` | non | oui | oui | oui |
| `reassort` | non | non | oui | oui |
| `lecture` | non | non | non | oui |

Le propriétaire ne peut ni se retirer ni se dégrader : un compte sans propriétaire
est un compte que plus personne ne reprend.

## Messagerie

Des **salons**, comme sur Discord : `#general` pour l’équipe, un salon par borne
où **la machine écrit elle-même** ce qui lui arrive — ventes du relevé,
incidents, spires vides, chargements reçus — et où l’on répond dessous. Les
salons d’une borne ne se montrent qu’à ceux qui voient la borne. Gérant ou
propriétaire peut en créer d’autres (`POST /api/salons`).

Le fil est rendu par le serveur, puis vivant : toutes les trois secondes, onglet
visible, le navigateur demande ce qui est arrivé après le dernier message qu’il
connaît (`GET /api/messages?salon=&depuis=`). Pas de connexion ouverte à tenir,
ça marche derrière n’importe quel hébergeur. Le composeur est un formulaire :
sans JavaScript il envoie et revient sur le fil ; avec, Entrée envoie, Maj+Entrée
passe à la ligne, et le message apparaît aussitôt.

Un message se retire, il ne s’efface pas : « message retiré » garde sa place.
Ce qu’on n’a pas lu fait une pastille sur la bulle de l’en-tête et sur chaque
salon (`salon_lecture`). Les messages des collègues sont aussi poussés sur le
téléphone (sujet « Messages » des notifications).

## Notifications

La console s’installe comme une application (manifeste, service worker
`public/sw.js`, icônes de `scripts/icones-pwa.mjs`) et pousse des notifications
par **Web Push** : rien à publier sur un store, pas de compte chez un tiers.

Réglages › Notifications : chaque personne abonne ses appareils, et règle par
appareil ce qu’il reçoit — **ventes** (un message par relevé, avec le total),
**incidents** (payé, rien n’est tombé), **spires vides**, **chargements**
confirmés par la machine. Un abonnement suit la personne, pas le compte ; une
restriction par borne s’applique à l’envoi.

L’envoi part **après** la transaction du relevé (`/api/borne/etat`) et après le
passage des bornes fictives, sans être attendu. Un message par borne et par
sujet, avec un `tag` : trois relevés de suite mettent à jour la même ligne sur
l’écran de verrouillage. Un appareil disparu (404/410) est effacé ; dix échecs
de suite aussi.

La paire de clés VAPID est générée au premier abonnement et rangée dans
`cle_vapid` ; `REDBOX_VAPID_PUBLIQUE` / `REDBOX_VAPID_PRIVEE` (et
`REDBOX_VAPID_SUJET`) dans l’environnement passent devant. Changer de paire
oblige chaque appareil à se réabonner.

**Il faut du https.** Les navigateurs n’enregistrent ni service worker ni
abonnement sur une adresse `http://` autre que `localhost`. Sur iPhone, il faut
en plus poser la console sur l’écran d’accueil (Partager › Sur l’écran
d’accueil) et l’ouvrir depuis cette icône — iOS 16.4 ou plus.

## Mode démo

Un compte qui vient de s’inscrire **s’ouvre sur un parc inventé** : trois
bornes, onze produits en six catégories, trois semaines de ventes, une réserve
avec deux livraisons, une tournée hebdomadaire, une équipe et une invitation en
attente, deux playlists, un prix propre sur une machine, une autre hors
service. Un bandeau ambre reste dans l’en-tête de chaque page tant que le mode
est actif.

Tout est du vrai dans la base — des lignes de `borne`, `vente`, `mouvement` —
donc aucune page n’a à savoir qu’elle montre une démonstration. Ce qui
distingue une borne fictive, c’est son jeton, qui commence par `demo_`.

**Les bornes fictives vivent.** À chaque ouverture de la console (au plus une
fois par minute, en arrière-plan, depuis `parJeton`), elles confirment les
chargements saisis depuis plus d’une minute et demie, appliquent les
corrections de compteur, vendent ce qu’elles auraient vendu depuis le dernier
passage au rythme d’un bar, l’écrivent dans leur journal, et se déclarent en
ligne et à jour du catalogue.

**On en sort en effaçant tout** (`/demo`, propriétaire seulement, deux appuis) :
bornes, catalogue, stock, ventes, écran d’accueil, y compris ce qui a été ajouté
pendant l’essai. Restent le compte, ses membres et leurs photos, les invitations
adressées à de vraies adresses, et une réserve vide. Une vraie machine ne peut
pas être appairée tant que la démo est active. La même page remet la démo à
neuf, ou la relance sur un compte resté vide.

Les catégories et les produits ont une image, et les playlists trois affiches :
dessinées une fois par `node scripts/demo-images.mjs` (sharp, à partir des
pictogrammes de la machine) et embarquées en base64 dans
`src/lib/demo-images.ts`, pour que le semis ne dépende ni d’une police, ni d’un
dossier lisible sur le serveur.

`REDBOX_SANS_DEMO=1` dans l’environnement ouvre les comptes vides, comme avant.
Tout est dans `src/lib/demo.ts`.
