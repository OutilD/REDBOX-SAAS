import type { Acces, Genre, Icone } from "./academie";

/**
 * LE PLAN TYPE DE L'ACADEMIE.
 *
 * Un point de depart, pas un contenu fini : tout arrive en BROUILLON, et rien
 * ne s'ouvre aux redboxers avant que l'equipe RedBox l'ait relu et publie.
 * Ce qui se deduit du produit — ce que fait la machine, ce que montre la
 * console — est ecrit. Ce qui ne s'invente pas — les mesures de la fiche
 * usine, les certificats, les conditions faites au bar — est laisse en
 * « à compléter », en clair, pour qu'on ne publie pas un chiffre faux.
 */
export type BlocPlan = { genre: Genre; titre?: string; texte?: string; url?: string };
export type LeconPlan = { titre: string; resume: string; duree: number; acces: Acces; blocs: BlocPlan[] };
export type ModulePlan = { titre: string; resume: string; icone: Icone; acces: Acces; lecons: LeconPlan[] };

export const PLAN_TYPE: ModulePlan[] = [
  {
    titre: "Découvrir la RedBox",
    resume: "Ce qu’est la machine, ce qu’elle fait, sa fiche technique et ses certificats.",
    icone: "borne", acces: "tous",
    lecons: [
      {
        titre: "Ce qu’est une RedBox", duree: 4, acces: "tous",
        resume: "Un distributeur connecté pensé pour la nuit, et la console qui le pilote.",
        blocs: [
          { genre: "texte", texte:
`La RedBox est un distributeur connecté pensé pour les lieux de vie nocturne et à forte fréquentation : bars, clubs, discothèques, casinos. Les clients y achètent en libre-service, par carte bancaire, les produits utiles de la soirée — sans passer par le comptoir.

## Ce qu’il y a dans la machine
- Un écran tactile où le client choisit ses produits.
- Un terminal de paiement par carte.
- Des plateaux à spirales motorisées : chaque spirale porte un produit et le fait tomber dans le bac.
- Un contrôleur relié à Internet, qui remonte les ventes, le stock et les pannes.

## Ce qui la rend fiable
- **Aucune spirale ne tourne avant que le paiement soit confirmé.** Pas de produit offert par erreur.
- Pour un produit réservé aux majeurs, l’écran demande au client de scanner sa pièce d’identité.
- En cas de souci, l’écran affiche le numéro d’assistance que vous avez choisi.

## Et derrière, la console
C’est ici. Ventes en direct, stock de chaque spirale, réassort, écran d’accueil, pannes signalées sur votre téléphone : tout se pilote à distance, sans ouvrir la machine.` },
          { genre: "astuce", titre: "Pour la présenter",
            texte: "Partez de ce que vit le lieu, pas de la machine : la file au comptoir, les demandes auxquelles le personnel n’a pas le temps de répondre, les heures où personne ne peut vendre autre chose que des verres." },
        ],
      },
      {
        titre: "Dimensions et fiche technique", duree: 3, acces: "tous",
        resume: "Hauteur, largeur, profondeur, poids, alimentation : de quoi valider un emplacement.",
        blocs: [
          { genre: "texte", texte: "Avant toute visite, vérifiez que l’emplacement prévu accueille la machine : passage de porte, hauteur sous plafond, prise électrique à proximité, couverture réseau." },
          { genre: "fiche", titre: "RedBox — fiche technique", texte:
`Hauteur : à compléter
Largeur : à compléter
Profondeur : à compléter
Poids à vide : à compléter
Alimentation : à compléter
Consommation : à compléter
Écran : à compléter
Paiement : carte bancaire, sans contact
Nombre de spirales : à compléter
Connexion : à compléter` },
          { genre: "attention", titre: "À compléter avant publication",
            texte: "Reportez ici les mesures exactes de la fiche usine. Un bar qui mesure son passage de porte avec ces chiffres ne doit pas avoir de mauvaise surprise le jour de la livraison." },
        ],
      },
      {
        titre: "Certificats de conformité", duree: 2, acces: "tous",
        resume: "Les documents à montrer à un gérant, un assureur ou un propriétaire des murs.",
        blocs: [
          { genre: "texte", texte: "Un gérant de bar, son assureur ou le propriétaire des murs peuvent demander la preuve que la machine est conforme. Téléchargez les certificats ci-dessous et gardez-les sur votre téléphone : on vous les demandera souvent pendant le rendez-vous, rarement après." },
          { genre: "attention", titre: "À compléter avant publication",
            texte: "Ajoutez chaque certificat (PDF) avec un bloc « Fichier à télécharger », en nommant clairement ce qu’il certifie." },
        ],
      },
      {
        titre: "La RedBox en vidéo", duree: 2, acces: "tous",
        resume: "La machine en fonctionnement, du choix du produit à sa sortie.",
        blocs: [
          { genre: "attention", titre: "À compléter avant publication",
            texte: "Ajoutez la vidéo de présentation avec un bloc « Vidéo » : collez simplement le lien YouTube ou Vimeo." },
        ],
      },
    ],
  },
  {
    titre: "Convaincre un bar",
    resume: "Le pitch, les réponses aux objections, et le contrat type pour signer.",
    icone: "pitch", acces: "tous",
    lecons: [
      {
        titre: "Le pitch en une minute", duree: 5, acces: "tous",
        resume: "Ce qu’on dit au gérant, dans quel ordre, et ce qu’on garde pour la suite.",
        blocs: [
          { genre: "texte", texte:
`Un pitch qui marche tient en trois temps :

1. **Son problème à lui.** Ce qu’il perd aujourd’hui, en une phrase.
2. **Ce que fait la RedBox.** Sans jargon, sans fiche technique.
3. **Ce qu’il a à faire.** Presque rien — c’est ce qui fait signer.

Gardez les chiffres, la fiche technique et le contrat pour le deuxième rendez-vous. Le premier sert à ce qu’il ait envie d’en avoir un.` },
          { genre: "script", titre: "À dire au gérant", texte:
`Vous avez du monde jusqu’à la fermeture, et à deux heures du matin personne derrière le bar n’a le temps de vendre autre chose que des verres.

La RedBox, c’est un distributeur connecté qui vend en libre-service, par carte, ce que vos clients viennent vous demander pendant la soirée. Elle vérifie l’âge quand il le faut, elle ne demande pas de personnel, et c’est moi qui la remplis.

Vous, vous n’avez rien à gérer. [Votre proposition : part des ventes, loyer, service offert à vos clients…]` },
          { genre: "attention", titre: "À compléter avant publication",
            texte: "Remplacez la phrase entre crochets par les conditions réellement proposées aux établissements." },
        ],
      },
      {
        titre: "Répondre aux objections", duree: 6, acces: "tous",
        resume: "Les cinq questions qui reviennent, et la réponse qui les règle.",
        blocs: [
          { genre: "script", titre: "« Je n’ai pas la place. »",
            texte: "Elle se pose contre un mur, dans un passage que vos clients empruntent déjà — vers les toilettes ou la sortie. On regarde ensemble l’endroit, et si ça ne va pas, on ne la pose pas." },
          { genre: "script", titre: "« Et si elle tombe en panne ? »",
            texte: "La machine me prévient toute seule, sur mon téléphone, avant que vous ne le voyiez. Et si un client a un souci, l’écran lui affiche directement le numéro à appeler : ce n’est pas votre personnel qui gère." },
          { genre: "script", titre: "« Et les mineurs ? »",
            texte: "Pour un produit réservé aux majeurs, la machine demande au client de scanner sa pièce d’identité avant de vendre." },
          { genre: "script", titre: "« Je ne veux pas d’encaissement en plus. »",
            texte: "Rien ne passe par votre caisse : le client paie par carte directement sur la machine." },
          { genre: "script", titre: "« Qui la remplit ? »",
            texte: "Moi. Je vois le stock de chaque spirale à distance, je passe quand il faut, aux heures qui vous arrangent." },
        ],
      },
      {
        titre: "Les astuces pour signer", duree: 4, acces: "tous",
        resume: "Le bon moment, la bonne démonstration, le bon document.",
        blocs: [
          { genre: "astuce", titre: "Venez en heure creuse",
            texte: "Un gérant écoute en fin d’après-midi, jamais un vendredi à minuit. Passez une première fois pendant le service pour voir le lieu, revenez pour parler." },
          { genre: "astuce", titre: "Montrez la console, pas une plaquette",
            texte: "Ouvrez la console sur votre téléphone, en mode démo : les ventes qui tombent, le stock par spirale, l’alerte de panne. Il comprend en trente secondes qu’il n’aura rien à surveiller." },
          { genre: "astuce", titre: "Ayez le contrat sur vous",
            texte: "Quand il dit oui, il faut pouvoir signer tout de suite. Le contrat type est dans la leçon suivante." },
        ],
      },
      {
        titre: "Le contrat type avec le bar", duree: 3, acces: "redboxers",
        resume: "Le modèle à adapter, et les points à ne jamais laisser flous.",
        blocs: [
          { genre: "texte", texte:
`Le contrat fixe ce que chacun apporte et ce que chacun reçoit. Adaptez le modèle, mais ne laissez jamais flous :

- l’emplacement exact et qui fournit l’électricité ;
- ce que reçoit l’établissement, et à quelle fréquence ;
- qui assure la machine, et qui paie en cas de casse ;
- la durée, et comment on reprend la machine à la fin.` },
          { genre: "attention", titre: "À compléter avant publication",
            texte: "Déposez le modèle de contrat avec un bloc « Fichier à télécharger » : en DOCX pour qu’il se modifie, et en PDF pour le relire sur un téléphone." },
        ],
      },
    ],
  },
  {
    titre: "Vendre plus avec sa RedBox",
    resume: "L’emplacement, le catalogue, l’écran d’accueil et le réassort qui font le chiffre.",
    icone: "astuce", acces: "redboxers",
    lecons: [
      {
        titre: "Bien placer la machine", duree: 4, acces: "redboxers",
        resume: "Là où les clients passent, là où on la voit, là où elle capte.",
        blocs: [
          { genre: "astuce", titre: "Sur le passage",
            texte: "Le chemin vers les toilettes ou la sortie vaut mieux qu’un coin tranquille : on achète ce qu’on voit en passant." },
          { genre: "astuce", titre: "Dans la lumière",
            texte: "Un écran allumé dans un coin sombre attire l’œil. Évitez seulement le plein soleil d’une vitrine, qui efface l’écran en journée." },
          { genre: "attention", titre: "Vérifiez le réseau à l’emplacement exact",
            texte: "Une machine sans réseau ne remonte ni ses ventes ni ses pannes. Testez la couverture là où elle sera posée, pas à l’entrée du bar." },
        ],
      },
      {
        titre: "Composer son catalogue", duree: 5, acces: "redboxers",
        resume: "Peu de produits au départ, puis on garde ce qui se vend.",
        blocs: [
          { genre: "texte", texte:
`Le catalogue se règle dans **Configuration → Catalogue**, et se range par **Catégories**.

## La méthode
1. Commencez court : quelques produits évidents pour le lieu.
2. Laissez tourner quelques semaines.
3. Ouvrez **Analytiques** : gardez ce qui part, remplacez ce qui dort.` },
          { genre: "astuce", titre: "Une spirale vide ne vend rien",
            texte: "Mieux vaut deux spirales du produit qui part le plus qu’une spirale d’un produit qu’on ne rachète jamais." },
        ],
      },
      {
        titre: "L’écran d’accueil qui fait vendre", duree: 3, acces: "redboxers",
        resume: "Ce qui défile quand personne n’achète.",
        blocs: [
          { genre: "texte", texte: "Quand personne n’achète, la RedBox fait défiler son écran d’accueil. Il se règle dans **Configuration → Écran d’accueil** : une image par produit mis en avant, adaptée à la résolution de l’écran." },
          { genre: "astuce", titre: "Un message, une image",
            texte: "On lit un écran de loin, en marchant. Un produit et un prix par visuel valent mieux qu’un catalogue en miniature." },
        ],
      },
      {
        titre: "Réassort : ne jamais tomber en rupture", duree: 4, acces: "redboxers",
        resume: "Le stock au dépôt, la réception, et le passage à la machine.",
        blocs: [
          { genre: "texte", texte:
`Le cycle se fait en trois écrans :

1. **Réception** : vous enregistrez une livraison, votre stock au dépôt monte.
2. **Réassort** : devant la machine, vous chargez chaque spirale — le dépôt descend d’autant.
3. **Notifications** : la console vous prévient quand une spirale se vide.` },
          { genre: "astuce", titre: "Passez avant le week-end",
            texte: "Une machine pleine le jeudi vend tout le week-end. Une machine pleine le lundi attend." },
        ],
      },
    ],
  },
  {
    titre: "Faire tourner la machine",
    resume: "Appairer, traiter un litige, obtenir de l’aide : le quotidien du redboxer.",
    icone: "reassort", acces: "redboxers",
    lecons: [
      {
        titre: "Appairer sa RedBox", duree: 3, acces: "redboxers",
        resume: "Relier la machine à votre compte, une fois pour toutes.",
        blocs: [
          { genre: "texte", texte: "Dans **RedBox → Ajouter une RedBox**, suivez les étapes affichées. Une fois appairée, la machine apparaît dans votre parc, sur la carte, et commence à remonter ses ventes." },
        ],
      },
      {
        titre: "Traiter un litige", duree: 4, acces: "redboxers",
        resume: "Un client a payé et rien n’est tombé : que faire.",
        blocs: [
          { genre: "texte", texte: "Les ventes à problème apparaissent dans **Ventes**, marquées en litige. Ouvrez la vente : vous voyez ce qui a été payé, la spirale commandée et ce que la machine a constaté." },
          { genre: "attention", titre: "Répondez vite",
            texte: "Un client qui n’a pas de nouvelles appelle sa banque. Un client qu’on rappelle dans l’heure revient acheter." },
        ],
      },
      {
        titre: "Obtenir de l’aide", duree: 2, acces: "redboxers",
        resume: "Le SAV, les autres redboxers, et le développeur.",
        blocs: [
          { genre: "texte", texte:
`Trois endroits, selon la question :

- **Votre SAV**, dans Messages : une conversation privée avec l’équipe RedBox.
- **#redboxers** : ceux qui font tourner des machines comme vous. Ce qui marche, ce qui casse, ce qui se vend.
- **#developpeurs** : une idée, un bug, une question sur le logiciel.` },
        ],
      },
    ],
  },
];

/**
 * LE PLAN DU PARCOURS « TROUVER SES EMPLACEMENTS ». La prospection, de la liste
 * des lieux a la signature. Meme regle que le plan type : tout arrive en
 * brouillon, ouvert a tous — un acheteur qui attend sa machine n'a pas encore
 * de RedBox appairee, et c'est lui qui doit le suivre. Les conditions de la
 * garantie restent « à compléter » : elles sont au contrat de commande.
 */
export const PLAN_EMPLACEMENTS: ModulePlan[] = [
  {
    titre: "Préparer sa prospection",
    resume: "Pourquoi cette formation compte, où chercher, et comment garder la trace de chaque lieu démarché.",
    icone: "document", acces: "tous",
    lecons: [
      {
        titre: "Pourquoi cette formation est obligatoire", duree: 3, acces: "tous",
        resume: "La garantie emplacement, et ce qu’on attend de vous en échange.",
        blocs: [
          { genre: "texte", texte:
`Le risque principal de ce métier, c’est l’emplacement. La machine, le logiciel, le réassort : tout cela s’apprend en quelques jours. Trouver le lieu qui accepte la machine et où elle vend, c’est le vrai travail.

C’est pour cela que RedBox garantit votre premier emplacement : si aucun établissement n’est trouvé au bout de 6 mois, l’acompte est remboursé. En échange, on vous demande d’avoir réellement prospecté, avec la méthode qui marche.

## Ce que ce parcours vous apporte
- Une méthode : où chercher, qui aborder, quand, avec quels mots.
- Des réponses prêtes aux objections qu’on entend partout.
- Un fichier de prospection dans Connect, pour suivre chaque lieu de « à contacter » à « signé ».` },
          { genre: "attention", titre: "Formation obligatoire pour la garantie",
            texte: "Terminer toutes les leçons de ce parcours est obligatoire pour demander le remboursement au titre de la garantie emplacement. À la fin, vous recevez le certificat du parcours et le badge Prospecteur." },
          { genre: "attention", titre: "À compléter avant publication",
            texte: "Reprendre ici, mot pour mot, les conditions de la garantie telles qu’elles figurent au contrat de commande (délai, justificatifs demandés, démarche)." },
        ],
      },
      {
        titre: "Repérer 20 établissements dans sa ville", duree: 6, acces: "tous",
        resume: "La liste de départ : quels lieux, dans quel ordre, et comment les trouver.",
        blocs: [
          { genre: "texte", texte:
`Avant de pousser une porte, faites la liste. Vingt établissements, c’est le bon chiffre : assez pour ne pas dépendre d’un seul « oui », assez peu pour les visiter tous en deux ou trois semaines.

## Les lieux, du plus facile au plus long
1. **Bars et bars de nuit** : le patron décide seul, sur place.
2. **Boîtes de nuit** : un gérant, un rendez-vous, une décision rapide.
3. **Bowlings, billards, salles de loisirs** : des clients qui restent deux à trois heures.
4. **Casinos** : un dossier, une direction, plus de temps.
5. **Centres commerciaux** : un loyer fixe à négocier — gardez-les pour plus tard.

## Comment les trouver
- Ouvrez Google Maps sur votre ville, cherchez « bar », « bar de nuit », « discothèque », « bowling ». Regardez les horaires : ceux qui ferment tard passent en premier.
- Lisez les avis : beaucoup d’avis récents = beaucoup de passage.
- Sortez un soir de week-end : là où il y a la queue à l’entrée, il y a des clients pour la machine.
- Demandez autour de vous : un ami serveur, un client régulier, un patron qui en connaît un autre.` },
          { genre: "astuce", titre: "Ce qui fait un bon lieu",
            texte: "Du monde, tard, et des clients qui restent. Un bar qui ferme à 22 h vend peu ; une boîte qui ouvre jusqu’à 5 h vend la nuit, quand le comptoir et les commerces ne servent plus." },
          { genre: "astuce", titre: "Notez-les tout de suite",
            texte: "Chaque lieu repéré va dans votre fichier de prospection (Connect → Prospection), dans la colonne « À contacter ». Une liste sur papier se perd ; un tableau se tient à jour." },
        ],
      },
      {
        titre: "Tenir son fichier de prospection", duree: 3, acces: "tous",
        resume: "Le tableau de Connect : une carte par établissement, déplacée à chaque étape.",
        blocs: [
          { genre: "texte", texte:
`Dans Connect, l’onglet **Prospection** est un tableau en colonnes. Chaque établissement est une carte, et chaque colonne une étape :

1. **À contacter** — repéré, pas encore approché.
2. **Contacté** — vous êtes passé ou avez appelé.
3. **Rendez-vous** — une date est posée avec la personne qui décide.
4. **Négociation** — il réfléchit, l’essai est proposé.
5. **Signé** — la machine va s’installer.
6. **Refusé** — pas maintenant. On garde la carte : un refus se relance.

## Les bons gestes
- Ajoutez le nom du contact et son numéro dès que vous les avez.
- Écrivez dans la note ce qui a été dit : l’objection, la date de relance, le prénom du patron.
- Déplacez la carte le jour même. Sur ordinateur, prenez-la et posez-la dans la colonne ; au téléphone, choisissez l’étape dans la carte.` },
          { genre: "astuce", titre: "Votre tableau, c’est votre preuve",
            texte: "Un tableau tenu à jour montre ce que vous avez fait, lieu par lieu. Il vous sert à relancer au bon moment, et à montrer votre travail si l’équipe RedBox vous le demande." },
        ],
      },
    ],
  },
  {
    titre: "Approcher un établissement",
    resume: "Le premier contact, le pitch et les réponses aux objections.",
    icone: "pitch", acces: "tous",
    lecons: [
      {
        titre: "Le premier contact", duree: 5, acces: "tous",
        resume: "À qui parler, à quel moment, et ce qu’on apporte avec soi.",
        blocs: [
          { genre: "texte", texte:
`## Parlez à celui qui décide
Le serveur ne signe pas. Demandez le patron, le gérant ou le directeur d’exploitation. S’il n’est pas là, demandez quand il sera là, et revenez — ne laissez pas une plaquette en espérant un appel.

## Venez au bon moment
- **Bar** : en début de service, entre 17 h et 19 h.
- **Boîte de nuit** : en journée, sur rendez-vous.
- **Casino, centre commercial** : par téléphone ou par mail d’abord, pour obtenir un rendez-vous.
- Jamais un vendredi à minuit.

## Ce que vous avez sur vous
- Votre téléphone avec la console en mode démo : les ventes, le stock par spirale, l’alerte de panne.
- Des photos de la machine (Académie → Ressources).
- Le contrat type, pour le jour où il dit oui.` },
          { genre: "astuce", titre: "Présentez-vous en une phrase",
            texte: "« Bonjour, je m’appelle …, j’installe des distributeurs connectés dans les bars de la ville. Vous avez deux minutes ? » Court, clair, et une question qui appelle un oui." },
        ],
      },
      {
        titre: "Le pitch qui donne envie d’essayer", duree: 4, acces: "tous",
        resume: "Trois temps : ce qu’il vit, ce que fait la machine, ce qu’il y gagne.",
        blocs: [
          { genre: "texte", texte:
`1. **Ce que vit l’établissement.** Des clients qui sortent chercher une vape ou un chargeur, et ne reviennent pas toujours.
2. **Ce que fait la RedBox.** Un service en libre-service, toute la nuit, sans personnel.
3. **Ce qu’il y gagne, sans rien faire.** 15 % des ventes, zéro investissement, rien à gérer.

Le premier rendez-vous ne sert pas à signer : il sert à ce qu’il ait envie de tester.` },
          { genre: "script", titre: "À dire au gérant",
            texte: "Je vous installe gratuitement une machine qui rend service à vos clients toute la nuit. Vous touchez 15 % sur chaque vente, sans rien investir ni gérer : la machine, les produits, la maintenance, c’est moi. Et l’écran diffuse vos soirées et vos offres. On teste ?" },
        ],
      },
      {
        titre: "Les objections qu’on entend partout", duree: 5, acces: "tous",
        resume: "La place, les mineurs, les pannes, la caisse : les réponses courtes.",
        blocs: [
          { genre: "script", titre: "« Je n’ai pas la place. »",
            texte: "Le corps fait 60 cm de large et 36 cm de profondeur. En version murale, elle ne prend rien au sol. On choisit l’emplacement ensemble, et si ça ne va pas, on ne la pose pas." },
          { genre: "script", titre: "« Et les mineurs ? »",
            texte: "Le module DCM5 vérifie la pièce d’identité avant chaque vente réservée aux adultes. Pas de contrôle validé, pas de vente : vous êtes couvert." },
          { genre: "script", titre: "« Et si elle tombe en panne ? »",
            texte: "La machine me prévient toute seule, sur mon téléphone. Et si un client a un souci, l’écran lui affiche directement le numéro à appeler : ce n’est pas votre personnel qui gère." },
          { genre: "script", titre: "« Je ne veux pas d’encaissement en plus. »",
            texte: "Rien ne passe par votre caisse : le client paie par carte directement sur la machine." },
          { genre: "script", titre: "« Qui la remplit ? »",
            texte: "Moi. Je vois le stock de chaque spirale à distance, je passe quand il faut." },
          { genre: "astuce", titre: "Une objection, c’est une question",
            texte: "Celui qui objecte s’intéresse. Répondez court, puis reposez la question : « Si on règle ça, on teste ? »" },
        ],
      },
    ],
  },
  {
    titre: "Conclure",
    resume: "Proposer l’essai, choisir l’emplacement exact, et ne pas lâcher après un refus.",
    icone: "contrat", acces: "tous",
    lecons: [
      {
        titre: "Proposer l’essai de 14 jours", duree: 4, acces: "tous",
        resume: "« On teste ? » passe mieux que « on signe ? ».",
        blocs: [
          { genre: "texte", texte:
`Un essai de 14 jours, réversible, lève la plupart des hésitations : si la machine ne s’intègre pas, vous la reprenez. Le gérant ne prend aucun risque, et vous obtenez ce qui convainc le mieux : des ventes réelles, chez lui.

## Pour conclure l’essai
- Fixez la date d’installation pendant le rendez-vous, pas « on se rappelle ».
- Choisissez l’emplacement exact avec lui (leçon suivante).
- Notez dans votre tableau la date de fin d’essai : c’est votre rendez-vous de signature.` },
          { genre: "astuce", titre: "Revenez à la fin de l’essai avec les chiffres",
            texte: "Ouvrez la console devant lui : ce que la machine a vendu chez lui, et ce que représentent ses 15 %. C’est le meilleur argument que vous aurez jamais." },
        ],
      },
      {
        titre: "Choisir l’emplacement exact", duree: 4, acces: "tous",
        resume: "Dans le lieu, l’endroit où la machine vend.",
        blocs: [
          { genre: "texte", texte:
`## Un bon emplacement
- reste visible et accessible aux clients ;
- permet le réassort ;
- ne gêne ni la circulation ni les accès de sécurité ;
- respecte les contraintes de l’établissement.` },
          { genre: "astuce", titre: "Sur le passage",
            texte: "Le chemin vers les toilettes ou la sortie vaut mieux qu’un coin tranquille : on achète ce qu’on voit en passant." },
          { genre: "attention", titre: "Vérifiez le réseau à l’emplacement exact",
            texte: "Une machine sans réseau ne remonte ni ses ventes ni ses pannes. Testez la couverture 4G là où elle sera posée, pas à l’entrée du bar." },
        ],
      },
      {
        titre: "Après un refus", duree: 3, acces: "tous",
        resume: "Un « non » aujourd’hui n’est pas un « non » pour toujours.",
        blocs: [
          { genre: "texte", texte:
`Gardez la carte dans la colonne **Refusé**, avec la raison dans la note. Les raisons changent : un nouveau gérant, des travaux finis, un concurrent qui s’installe à côté.

## Quand relancer
- Après votre première machine installée ailleurs : vous avez maintenant une preuve qui tourne.
- Après un changement dans le lieu : nouvelle direction, réaménagement, nouvelle saison.
- Jamais en insistant le jour même.` },
          { genre: "astuce", titre: "La deuxième est plus facile",
            texte: "Sur 20 visites bien menées, il n’en faut qu’un pour lancer votre première machine. Dès qu’elle tourne, chaque refus devient une relance avec des chiffres." },
        ],
      },
    ],
  },
  {
    titre: "Garder le rythme",
    resume: "Une routine de prospection, et la garantie si rien n’aboutit.",
    icone: "chiffres", acces: "tous",
    lecons: [
      {
        titre: "Une routine de prospection", duree: 3, acces: "tous",
        resume: "Un peu chaque semaine vaut mieux que beaucoup une fois.",
        blocs: [
          { genre: "texte", texte:
`## Chaque semaine
1. Ouvrez votre tableau de prospection.
2. Ajoutez de nouveaux lieux dans « À contacter » si la colonne se vide.
3. Fixez-vous un nombre de visites, et tenez-le.
4. Relancez les cartes en « Négociation » depuis plus d’une semaine.
5. Racontez vos visites dans #futurs-redboxers : les autres ont peut-être eu la même objection.` },
          { genre: "astuce", titre: "Bloquez un créneau",
            texte: "Réservez le créneau 17 h – 19 h, deux soirs par semaine, à la prospection : c’est le moment où l’on trouve les patrons de bar." },
        ],
      },
      {
        titre: "Demander la garantie emplacement", duree: 2, acces: "tous",
        resume: "Si aucun emplacement n’est trouvé dans le délai : la démarche.",
        blocs: [
          { genre: "texte", texte:
`Si, malgré votre prospection, aucun établissement n’a signé dans le délai prévu au contrat, vous pouvez demander le remboursement de votre acompte.

## Avant de la demander
- Ce parcours doit être **terminé** : son certificat et le badge Prospecteur le prouvent.
- Votre tableau de prospection montre les lieux démarchés et leur étape.
- Écrivez à l’équipe RedBox dans votre salon d’assistance.` },
          { genre: "attention", titre: "À compléter avant publication",
            texte: "Indiquer le délai exact, les justificatifs demandés et l’adresse ou le salon où faire la demande, tels qu’au contrat de commande." },
        ],
      },
    ],
  },
];
