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

## Deux produits, une console

**RedBox Gestion** sert les machines : chiffres, ventes, réassort, maintenance,
écran d’accueil, parc. **RedBox Connect** relie les gens : communauté, messages,
académie, carte du réseau. Même connexion, même base, mêmes comptes — comme
Messenger et Facebook —, mais chacun a son rail, sa barre du pouce et son
accueil (`/` et `/communaute`). Quelqu’un qui n’a pas encore de machine vit dans
Connect sans traverser un logiciel de gestion ; il y **arrive** à l’inscription
et à la connexion (`api/session` : une vraie borne appairée, ou l’équipe RedBox,
ouvre la gestion). La gestion en démonstration reste à un geste.

Le produit se déduit de la **page** (`PRODUITS`, `SECTIONS[].produit` et
`produitDe` dans `app/chrome.tsx`). Le menu, le compte, les notifications et le
mode démo servent les deux : ils gardent l’habillage d’où l’on vient, retenu
dans le biscuit `rbx_produit` que pose `src/middleware.ts` à chaque page qui
appartient clairement à l’un des deux. On passe de l’un à l’autre par **un seul
bouton** sous le logo — « RedBox Connect » depuis la Gestion, « RedBox Gestion »
depuis Connect, aux couleurs de l’autre —, par le quatrième onglet de la barre
du bas, et par la première ligne de la page Menu. Les messages non lus restent
visibles depuis la gestion : sur la bulle de l’en-tête et sur ce bouton.

**On sait où l’on est sans lire.** Le middleware transmet le produit de la page
dans l’en-tête `x-rbx-produit` ; `layout.tsx` le pose en `data-produit` sur
`<html>`, et la feuille de style fait le reste. **La Gestion est un outil de
nuit** : noir, rouge, angles nets, elle ne change pas. **Connect est un réseau, pas un tableau de bord** : pas de rail. Sur
ordinateur, une **barre du haut** (`.connect-nav` dans `chrome.tsx`) porte les
quatre destinations — Communauté, Messages (avec les non-lus), Académie, Carte
—, l’active soulignée de rouge ; le logo à gauche, le compte et un bouton rouge
« Gestion » à droite ; le contenu centré sur 1180 px, comme un fil. Au
téléphone, la barre du bas. Trois couleurs : le **bleu sombre** de la nuit
(`--fond` #0a1020), le **blanc**, et le **rouge RedBox en nuances** — corail
(`--accent` #ff4d57) pour ce qui est actif ou vivant, le rouge plein
(`--degrade`) pour ce qu’on presse, les bulles envoyées, les avatars. Un thème
clair dans la même langue (blanc, bleu-gris pâle, les mêmes rouges). Les pages
secondaires (notifications, profil, réglages) passent par la page Menu. En bas du plan de
la Gestion, « RedBox Connect » est une entrée ordinaire. Tout vit sous
`:root[data-produit="connect"]`.

**Une adresse qui ne mène nulle part** (`app/not-found.tsx`) dit « En cours de
construction » dans l’habillage du produit, avec les deux portes. Un chemin
inconnu compte pour la Gestion, sauf sur l’hôte de Connect. Sous le logo, le nom du produit en capitales avec son point de couleur ;
au téléphone, la même puce à côté du logo.

Ce n’est **qu’un seul projet** : la machine écrit dans son salon, les badges
viennent des ventes, l’académie s’ouvre selon qu’on a une borne. Deux dépôts
dupliqueraient la connexion, les notifications et le schéma.

### Deux adresses, un seul déploiement

Trois variables d’environnement donnent à chaque produit son adresse
(`lib/produits.ts`) ; **sans elles, rien ne change** :

    REDBOX_HOTE_GESTION=gestion.exemple.com
    REDBOX_HOTE_CONNECT=connect.exemple.com
    REDBOX_DOMAINE_BISCUIT=.exemple.com

- **Chaque hôte ne sert que son produit.** Une page de l’autre y renvoie avec
  son adresse entière (`middleware.ts`) : un lien gardé dans un message, une
  notification reçue par l’autre application, tout arrive au bon endroit. La
  racine de Connect est `/communaute`. Le menu, le compte et les notifications se
  servent sur place, avec l’habillage de l’hôte. L’API n’est jamais renvoyée, et
  un hôte qui n’est aucun des deux — l’ancienne adresse que les bornes
  appellent — sert tout, comme avant.
- **Une seule connexion, un seul compte.** Le biscuit de session est posé sur le
  domaine et porte une marque (`d.`, `MARQUE_PARTAGE`) : connecté dans l’une, on
  l’est dans l’autre, sur le même compte (le compte actif vit dans la session,
  en base) ; se déconnecter d’un côté détruit en base toutes les sessions que le
  navigateur présente, donc des deux côtés. Un biscuit d’avant le domaine, sans
  marque, ne vaut plus rien : la page l’ignore et le middleware l’efface — une
  reconnexion, une fois. Le thème et le rail sont eux aussi partagés sous le
  domaine (`biscuitPartage`). On reste dans l’application où l’on s’est
  connecté ; seul un prospect qui se connecte côté Gestion est conduit à Connect.
- **Une application installable par produit** : le manifeste de l’hôte Connect
  dit « RedBox Connect » et s’ouvre sur la communauté (`app/manifest.ts`).
- **Les notifications vont à la bonne application** (`versLaBonneApplication`) :
  un abonnement appartient à l’adresse où il a été pris. Une vente sonne dans la
  Gestion, un message dans Connect. Qui n’a installé qu’une des deux reçoit tout
  sur celle-là : personne ne perd une alerte le jour où la seconde adresse ouvre.
- Les redirections (`versPage`) se composent depuis l’hôte que le client a tapé,
  pas depuis `req.url`.

Pour l’essayer en local : `REDBOX_HOTE_GESTION=gestion.localhost:4311
REDBOX_HOTE_CONNECT=connect.localhost:4311 npx next start -p 4311`, puis
`curl -H "Host: connect.localhost:4311" http://127.0.0.1:4311/ventes`.

## Deux navigations, une par posture

**Sur écran large, un rail à gauche**, toujours visible, rangé en sections — pour
la gestion : Exploitation, Approvisionnement, Configuration. Il montre **tout** ce
que porte le produit où l’on est, y compris ce
qui se visite rarement — c’est la différence entre un menu qu’on parcourt et un
plan qu’on lit. Chaque entrée porte sa pastille : canaux vides, litiges à
regarder, produits épuisés en réserve. Une seule requête les calcule toutes les
trois : le rail est sur chaque page, il n’a pas le droit d’en coûter trois.

**Au téléphone, une barre en bas**, là où se trouve le pouce, avec les cinq
destinations qu’on atteint d’une main. Les autres se rejoignent depuis celles-ci —
Réception s’allume sous Stock, Catalogue sous Réglages.

Sur les trois pages qui se filtrent par machine — tableau de bord, analytiques,
ventes —, le sélecteur de RedBox prend une seconde ligne de l’en-tête au
téléphone, en pleine largeur : il n’est jamais caché.

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

## Un produit sur plusieurs spires

Le planogramme accepte le même produit sur deux spires ou plus (101 et 102,
par exemple). `canal.produit_id` n’est pas unique par borne, et c’est voulu :
l’article qui part vite se met en double. Côté machine (`Inventory`), un
produit peut occuper plusieurs racks : l’étal n’en montre **qu’une carte**,
le stock annoncé est la **somme**, et à la vente elle sert la **première spire
non vide** dans l’ordre du planogramme, en sautant celles qui ont échoué
dans la même commande. Il n’y a rien à décider dans la console.

La page du planogramme liste les produits doublés avec leurs spires et leur
total. Une spire qui se vide déclenche l’alerte « spire vide », en précisant
ce qu’il en reste sur les autres spires ; « produit épuisé » seulement quand
il n’en reste nulle part sur la machine.

## Tableau de bord et analytiques

Le tableau de bord ne répond qu'à deux questions : combien ça rapporte et dans
quel sens ça va, et qu'est-ce qui demande une main tout de suite. Il tient sur
un écran. Tout ce qui se lit en prenant le temps — jour par jour, quelle borne
marche le mieux, ce qui se vend, les catégories, ce qui va manquer — est sur la
page **Analytiques**, avec la même période et la même borne dans l'adresse.

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

**Instantané.** Un clic sur un salon ne charge plus de page : la messagerie
bascule dans le navigateur (`bascule.tsx`). Le serveur rend la page une fois,
comme avant — sans JavaScript rien ne change — ; puis, au repos, le navigateur
demande le dernier lot de chaque salon visible (`GET /api/salons/apercus`,
`apercusDe`, une lecture pour tous) et le garde. Un clic change l’adresse
(`pushState`), montre le fil déjà là (`ColonneFil`, `LienSalon`), éteint la
pastille et note la lecture au serveur sans l’attendre (`?lu=`). Précédent
et Suivant marchent (`popstate`). Le salon rendu par le serveur garde ses
panneaux (qui lit, fond) ; un salon ouvert sur place n’a pas de compte de
lecteurs (« … ») tant qu’on n’ouvre pas son panneau, qui reste une page.

**Vite.** Une page de salon coûtait vingt-cinq allers-retours vers la base, en
file ; elle en coûte une dizaine, en parallèle (`vue.tsx` : liste, portes,
salon, messages et lecteurs partent ensemble ; `assurerSalons` une fois par
compte et par quart d’heure ; la lecture se note après la réponse). La session
se résout une fois par rendu (`cache` de React) et se garde vingt secondes par
processus (`SESSIONS` dans `lib/auth.ts`, oubliée à la déconnexion et au
changement de compte) : un tour de sondage du fil, c’est trois requêtes. Le fil
charge un lot de quarante messages et le reste en remontant (« Voir les
messages précédents », `?avant=`) ; il sonde toutes les trois secondes, toutes
les douze après deux minutes sans rien, vif de nouveau au retour sur l’onglet
(`lib/fil.ts`). `REDBOX_TRACE_SQL=1` journalise chaque requête avec sa durée ;
au-delà d’une demi-seconde, elle est journalisée de toute façon — c’est ce qu’on
lit chez l’hébergeur quand une page traîne. Ce qui reste hors du code : la base
se rendort après inactivité et met quelques secondes à se réveiller — un appel
de `/api/ronde` chaque minute la garde éveillée.

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

Le fil se lit en bulles, comme sur un téléphone : les siennes à droite en
rouge, celles des autres à gauche avec leur portrait, la machine à gauche avec
sa marque et un filet rouge. Chaque auteur porte son niveau (« Niv. 3 ») ; dans
les salons qui traversent les comptes, son grade et son exploitation aussi.

Le bouton « qui » de chaque salon dit **qui peut le lire** : la règle en une
phrase, le nombre, les visages. Un gérant peut restreindre un salon d’équipe à
certaines personnes (`salon_membre` : aucune ligne, tout le compte ; des
lignes, seulement eux — même idée que `acces_borne`).

Un message se retire, il ne s’efface pas : « message retiré » garde sa place.
Ce qu’on n’a pas lu fait une pastille sur la bulle de l’en-tête et sur chaque
salon (`salon_lecture`). Les messages des collègues sont aussi poussés sur le
téléphone (sujet « Messages » des notifications).

## Communauté

**Qui est redboxer** : un compte auquel le super-admin a attribué au moins une
vraie RedBox — commandée, bientôt installée ou installée, appairée ou pas
encore (`SQL_REDBOX_ATTRIBUEE` dans `lib/communaute.ts`, alias `b`). Les
bornes de démonstration ne comptent jamais. Une seule condition, lue par
`groupeDuCompte` (salons, académie, SAV), par le comptage des lecteurs, par le
ciblage des notifications d’annonces et de communauté, et par la page
d’arrivée à la connexion. Avant, il fallait une machine appairée : un client
dont la machine était commandée restait devant un cadenas jusqu’au jour de
l’installation.
Un **super-admin est de l’équipe RedBox quel que soit le compte** où il se
trouve : salons de la plateforme ouverts, écriture dans les annonces, académie
complète, même depuis un second compte sans machine (`portee`, `peutEcrire`,
`lecteur`).

**Léger au téléphone.** Les badges se dessinent depuis des vignettes WebP
(`public/badges/petit`, 96 px, 82 Ko pour toute la page au lieu de 2,2 Mo ;
`moyen`, 192 px, pour les tailles intermédiaires) ; la pièce en 3D
(`piece3d/apercus`, three.js, 500 Ko) ne se photographie que sur ordinateur,
pour les badges obtenus, quand la tuile est à l’écran et le navigateur au
repos (`badge.tsx`). Les animations sans fin des tuiles rares sont coupées sous
980 px. Partout : plus de `backdrop-filter` sur les barres qui glissent
au-dessus du contenu (en-tête, barre du fil, barres de Connect — elles sont
opaques), plus de fond fixe, les longues listes en `content-visibility: auto`,
les images en `loading="lazy"`, les écouteurs de défilement une fois par image
et sans écriture inutile sur la racine (`hauteur-ecran.tsx`, `fil.tsx`), et un
cache de navigation de trente secondes (`staleTimes` dans `next.config.ts`)
pour que retour et aller-retour entre deux pages soient immédiats. Les pages
qu’on ouvre le plus — les cinq onglets du pouce, et dans le rail `PRECHARGEES`
(`chrome.tsx`) — sont préchargées dès que leur lien est à l’écran : le clic les
montre depuis le navigateur. Les autres montrent l’écran au logo RedBox
(`app/loading.tsx`) le temps du serveur.
`captures/perf.mjs` mesure octets, three.js et images longues au défilement.

Au-delà du compte, les exploitants se parlent entre eux, et à nous.

**Salons de la plateforme** (`salon.compte_id` nul) : `#annonces`, où seul
l’éditeur écrit et que tout le monde lit ; `#entrepreneurs` pour tous ;
`#proprietaires` pour les comptes qui ont au moins une vraie borne ;
`#prospects` pour ceux qui n’en ont pas. Et par compte, `#equipe-redbox`, la
ligne directe avec l’éditeur, que ses membres voient tous (section « Comptes »).
**L’éditeur est un compte** : celui qui porte `compte.editeur` (Outil Digital).

**Profils, grades, badges, points** (`src/lib/communaute.ts`, pages
`/communaute`, `/communaute/<id>`, `/communaute/moi`). Le grade dit la taille du
parc en *vraies* bornes — Curieux, Redboxer, Exploitant, Chef de parc, Baron du
réseau ; les bornes de la démo ne comptent pas. Les badges (Pionnier pour les dix
premiers, Première borne, Un an, Noctambule, Pilier de comptoir…) sont des règles
en code réévaluées à l’ouverture de la communauté ; la table `badge_obtenu` ne
garde que ce qui a été gagné, et un badge ne se perd pas. Les points se
recalculent depuis les faits — cent par borne, les badges pour ce qu’ils valent,
les messages, l’ancienneté — comme le stock. Le profil se personnalise : pseudo,
ville, deux lignes, couleur, ouvert ou fermé.

Les annonces sont poussées sur le téléphone à part (sujet « Annonces »).

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

### L’invitation à installer et à activer

Presque aucun appareil n’était abonné : il fallait aller chercher les
notifications dans Réglages. `app/invite-notifications.tsx` les propose donc à
l’ouverture. **Sur un téléphone, une grande fenêtre** qui monte du bas — d’abord
« Installez RedBox » (sur iPhone, Safari ne pousse rien à un site qui n’est pas
sur l’écran d’accueil : trois étapes illustrées ; sur Android, le bouton
« Installer » de Chrome quand il tend `beforeinstallprompt`, le chemin par le
menu sinon), puis « Activez les notifications » une fois installée. **Jamais
bloquante** : « Plus tard », la croix et le fond la ferment. Elle se tait alors
une journée, et il n’y en a qu’une par ouverture : fermer l’installation ne fait
pas surgir les notifications à la page suivante. **Sur ordinateur**, le bandeau
discret, deux semaines de silence après « Plus tard ». Le texte change selon le
produit (machines pour la gestion, messages et badges pour Connect).

La demande du navigateur ne part que du toucher sur « Activer » : une demande au
chargement est refusée par Safari et Firefox, et un « Bloquer » réflexe est
définitif. Tout se décide dans `decider` (`reglages/notifications/abonnement.ts`),
pure, vérifiable cas par cas.

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

## Carte

`/carte` pose les RedBox du compte sur une vraie carte : Leaflet et les tuiles
d'OpenStreetMap (assombries en thème sombre), dans `src/app/carte/carte-maps.tsx`.
**Un carré par ville** de loin, un par machine à partir du zoom de la rue ;
on le touche, la bulle liste les machines. Au survol, une fiche dit le stade,
l'état, l'adresse, le CA sur 30 jours et au total, la dernière vente (et, pour
l'éditeur, le compte, le numéro de série, la note). Sous la carte, la liste
par ville dit la même chose sans JavaScript.

La carte d'un compte **se regarde, elle ne se modifie pas**. Placer une machine
(`/carte/situer/[id]`) est réservé au super-admin, comme l'attribuer ou changer
son stade. L'adresse qu'un client écrit sur sa fiche sert l'écran d'assistance
et ne déplace pas la machine : le géocodage automatique ne pose que les machines
qui n'ont encore aucune place.

Les coordonnées viennent de l'adresse, par la **Base Adresse Nationale**
(`api-adresse.data.gouv.fr`, publique, sans clé) : à l'ouverture de `/admin`,
au plus huit machines sans place sont situées ; les autres le seront à
l'ouverture suivante. `borne.situee_pour` retient l'adresse qui a servi — si
elle change, le tableau de bord de la plateforme le signale ; si elle est introuvable, on le dit sous la carte
plutôt que de redemander à chaque fois. Le géocodeur doit renvoyer une **ville**
et un score d'au moins 0,5 — « TEST » tombait sur un lieu-dit. Une machine
sans place est listée sous la carte, avec le bouton « Placer » côté éditeur.

Le carré a **la couleur du stade** : violet en production, vert libre, ambre
commandée, bleu bientôt installée, rouge installée ; une ville qui en mêle
plusieurs est rayée à proportion. La pastille au coin dit la santé d'une
installée : vert en ligne, rouge silencieuse, ambre hors service, gris à
appairer.

## Le parc et le super-admin

Une borne n'existait qu'à partir de l'appairage. La machine, elle, existe bien
avant : `borne.statut` suit sa vie — `production`, `libre` (en stock, sans
compte), `commandee`, `bientot` (attribuée, adresse connue), `installee`
(appairée). Les bornes existantes sont `installee`. `borne.numero` est le
numéro de série, posé par l'éditeur ; `note_editeur` ce qu'il note pour lui.

**Le super-admin est une personne, pas un compte** : `utilisateur.super_admin`.
Les propriétaires et gérants du compte éditeur le sont d'office à chaque
migration ; le drapeau se donne et se retire sur `/admin/comptes`, jamais à
soi-même. Attribuer une machine, changer son stade et la placer sur la carte
lui sont réservés.

`/admin` est le tableau de bord de la plateforme : CA sur trente jours et sa
pente, santé du parc, machines à venir et en stock, comptes ; ce qui demande une
main (silencieuses, hors service, à placer, adresse changée depuis le
placement) ; la carte de tout le parc, où l'on place les machines ; les
machines qui rapportent le plus.

`/admin/parc` : les cinq compteurs et un tableau en cinq colonnes où l'on
**glisse une carte** d'un stade à l'autre (`POST /api/admin/parc/statut`).
Chaque colonne se tourne par pages de six. Chaque carte
porte aussi un formulaire complet — stade, compte, numéro, nom, adresse, note —
qui marche au doigt et sans JavaScript (`/api/admin/parc/modifier`). Une
machine libre n'a pas de compte ; en attribuer un la fait passer en commandée,
le lui retirer la rend libre. Le compte d'une machine appairée ne se change pas
d'ici : il faut la désappairer. On n'efface qu'une machine sans jeton et sans
vente. Les bornes de la démo ne font pas partie du parc.

`/admin/comptes` : tous les comptes avec leurs chiffres — personnes, RedBox
installées et en ligne, à venir, ventes et chiffre d'affaires sur trente jours
et depuis le début, dernière vente — et, par compte, ses membres.

**L'appairage reconnaît une machine attendue.** Si le compte a des machines
attribuées pas encore posées, la page « Ajouter une RedBox » demande laquelle
on appaire : la ligne existante reçoit le jeton et passe `installee`, avec son
lieu, sa place sur la carte et son historique. « Une autre RedBox » crée une
ligne comme avant.

## Centrale d’achat

`/centrale` est la boutique des redboxers : ce qu’on met dans une RedBox, où
l’acheter, à quel prix, et ce que ça rapporte (`lib/centrale.ts`). Un catalogue
de la **plateforme** — les super-admins l’écrivent, tous les comptes le lisent —,
qui se parcourt comme un site de vente ; l’achat lui-même se fait chez le
fournisseur, par son lien. Un seul guichet, `POST /api/centrale`, l’action dit
quoi ; des formulaires ordinaires, sans JavaScript.

**Les goûts d’un produit** (`centrale_produit.gouts`, JSON) : une liste à part,
dans l’ordre de l’éditeur, chaque goût portant au plus une étiquette —
best-seller (étoile ambre) ou nouveau (étincelle verte), et une photo
(`image_id`, rangée par `rangerImage` dans la transaction du produit). Sur la
fiche, **la description et les goûts sont côte à côte, à droite de la photo**,
séparés d’un filet, au-dessus des prix ; la photo cède de la place quand il y a
des goûts (`.ctr-fiche.avec-gouts`), et sous 1100 px la liste passe sous la
description (`.ctr-fiche-corps`). La liste : rang, vignette — un clic l’agrandit
dans une fenêtre (`gout-photo.tsx` ; sans JavaScript, le lien ouvre l’image) —,
nom, étiquette, best-sellers d’abord ; la carte de la grille dit « 18 goûts ·
4 best-sellers », et la recherche les trouve. L’éditeur (`gouts-editeur.tsx`,
côté client : il importe `lib/gouts.ts`, pas `lib/centrale.ts` qui ouvre la
base) est une ligne par goût — vignette cliquable pour la photo, nom, trois
boutons radio ; l’ancienne photo survit par un champ caché tant qu’on n’en
envoie pas une autre. Sans JavaScript, trois lignes vides. Un bloc « Coller une liste » lit une liste de fournisseur,
« - BEST SELLER » ou « - NOUVEAU » en fin de ligne posant l’étiquette
(`goutsDe`).
