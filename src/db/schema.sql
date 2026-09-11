-- =============================================================================
-- RedBox SaaS — schema Postgres
-- =============================================================================
--
-- UNE SEULE IDEE PORTE TOUT : on n'enregistre pas des quantites, on enregistre
-- des MOUVEMENTS. « Il reste 48 chez moi » n'est pas un nombre range quelque
-- part, c'est une somme, et elle se deplie toujours en la liste des lignes qui
-- l'ont produite.
--
-- Un compteur qu'on modifie ne sait pas dire pourquoi il a change. Un stock qui
-- ne s'explique pas, on cesse d'y croire ; et une fois qu'on n'y croit plus, on
-- cesse de le tenir. C'est comme ca qu'un outil de gestion meurt.
-- =============================================================================

-- --------------------------------------------------------------------- comptes

CREATE TABLE IF NOT EXISTS compte (
  id       BIGSERIAL PRIMARY KEY,
  nom      TEXT NOT NULL,
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS utilisateur (
  id        BIGSERIAL PRIMARY KEY,
  compte_id BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  email     TEXT NOT NULL UNIQUE,
  mdp       TEXT NOT NULL,             -- scrypt : sel:empreinte
  role      TEXT NOT NULL CHECK (role IN ('proprietaire','gerant','reassort','lecture')),
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
  jeton          TEXT PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  expire_le      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS invitation (
  id          BIGSERIAL PRIMARY KEY,
  compte_id   BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('gerant','reassort','lecture')),
  code        TEXT NOT NULL UNIQUE,
  par         TEXT,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  utilisee_le TIMESTAMPTZ
);

-- -------------------------------------------------------------------- produits

CREATE TABLE IF NOT EXISTS produit (
  id             BIGSERIAL PRIMARY KEY,
  compte_id      BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  sku            TEXT NOT NULL,
  nom            TEXT NOT NULL,
  categorie      TEXT NOT NULL DEFAULT 'divers',
  prix_vente_c   INTEGER NOT NULL DEFAULT 0,     -- centimes, ce que paie le client
  age_min        SMALLINT NOT NULL DEFAULT 0,
  capteur_fiable BOOLEAN NOT NULL DEFAULT true,  -- la cellule voit-elle tomber ce produit
  actif          BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (compte_id, sku)
);

-- ----------------------------------------------------------------------- lieux
--
-- Une reserve est un lieu, une borne est un lieu. Deux tables et deux facons de
-- compter, ce sont deux occasions de se contredire.

CREATE TABLE IF NOT EXISTS lieu (
  id        BIGSERIAL PRIMARY KEY,
  compte_id BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  genre     TEXT NOT NULL CHECK (genre IN ('reserve','borne')),
  nom       TEXT NOT NULL,
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS borne (
  id             BIGSERIAL PRIMARY KEY,
  compte_id      BIGINT REFERENCES compte(id) ON DELETE CASCADE,
  lieu_id        BIGINT REFERENCES lieu(id) ON DELETE SET NULL,
  nom            TEXT NOT NULL,
  adresse        TEXT,
  code_appairage TEXT UNIQUE,          -- efface des l'appairage fait
  jeton          TEXT UNIQUE,          -- ce que la borne presente ensuite
  appairee_le    TIMESTAMPTZ,
  vue_le         TIMESTAMPTZ,
  version        TEXT,
  catalogue_version TEXT,      -- l'empreinte du catalogue que la machine detient
  sante          JSONB
);

-- Le planogramme. `quantite` est ce que LA MACHINE remonte : c'est elle qui
-- compte, pas nous. Le stock theorique se deduit des mouvements, et l'ecart
-- entre les deux est l'information la plus precieuse du systeme — vol, casse,
-- capteur muet ou saisie ratee, il faut le voir, pas le lisser.
CREATE TABLE IF NOT EXISTS canal (
  id         BIGSERIAL PRIMARY KEY,
  borne_id   BIGINT NOT NULL REFERENCES borne(id) ON DELETE CASCADE,
  lane       INTEGER NOT NULL,
  rangee     SMALLINT NOT NULL DEFAULT 1,
  colonne    SMALLINT NOT NULL DEFAULT 1,
  produit_id BIGINT REFERENCES produit(id) ON DELETE SET NULL,
  quantite   INTEGER NOT NULL DEFAULT 0,
  capacite   INTEGER NOT NULL DEFAULT 10,
  seuil_bas  INTEGER NOT NULL DEFAULT 2,
  releve_le  TIMESTAMPTZ,
  UNIQUE (borne_id, lane)
);

-- ------------------------------------------------------------------ mouvements
--
-- Le grand livre. Chaque ligne dit : tant d'unites de tel produit ont quitte tel
-- lieu pour tel autre, tel jour, pour telle raison, sous la responsabilite de
-- telle personne.
--
-- de_lieu NULL  = ca entre dans le systeme (reception, correction a la hausse)
-- vers_lieu NULL = ca en sort (vente, perte, correction a la baisse)

CREATE TABLE IF NOT EXISTS mouvement (
  id           BIGSERIAL PRIMARY KEY,
  compte_id    BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  produit_id   BIGINT NOT NULL REFERENCES produit(id) ON DELETE RESTRICT,
  de_lieu_id   BIGINT REFERENCES lieu(id) ON DELETE SET NULL,
  vers_lieu_id BIGINT REFERENCES lieu(id) ON DELETE SET NULL,
  quantite     INTEGER NOT NULL CHECK (quantite > 0),
  motif        TEXT NOT NULL CHECK (motif IN
                 ('reception','transfert','vente','perte','retour','inventaire',
                  'casse','vol','peremption','autre')),
  prix_achat_c INTEGER,               -- renseigne sur les receptions : valeur du stock, marge
  lane         INTEGER,               -- canal vise, sur un transfert
  reference    TEXT,                  -- bon de livraison, commande, ce qu'on veut retrouver
  par          TEXT,
  fait_le      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un transfert n'est pas instantane : il est SAISI dans le SaaS, la reserve
  -- baisse aussitot, et la borne le CONFIRME a sa prochaine synchro. Entre les
  -- deux la marchandise est en route. Un transfert jamais confirme doit rester
  -- visible — sinon on croit avoir charge une borne qui n'a rien recu.
  confirme_le  TIMESTAMPTZ,
  annule_le    TIMESTAMPTZ,
  note         TEXT,

  CHECK (de_lieu_id IS NOT NULL OR vers_lieu_id IS NOT NULL),
  CHECK (de_lieu_id IS DISTINCT FROM vers_lieu_id)
);

CREATE INDEX IF NOT EXISTS i_mouvement_compte  ON mouvement(compte_id, fait_le DESC);
CREATE INDEX IF NOT EXISTS i_mouvement_produit ON mouvement(produit_id);
CREATE INDEX IF NOT EXISTS i_mouvement_route   ON mouvement(vers_lieu_id) WHERE confirme_le IS NULL AND annule_le IS NULL;

-- ---------------------------------------------------------------------- ventes

CREATE TABLE IF NOT EXISTS vente (
  id          BIGSERIAL PRIMARY KEY,
  borne_id    BIGINT NOT NULL REFERENCES borne(id) ON DELETE CASCADE,
  commande_id TEXT NOT NULL,
  -- Rang de l'article dans la commande, envoye par la borne 5.13. Null avant.
  article     SMALLINT,
  lane        INTEGER,
  produit_id  BIGINT REFERENCES produit(id) ON DELETE SET NULL,
  prix_c      INTEGER NOT NULL,
  -- Les valeurs sont enumerees plus bas, avec la contrainte qui les porte.
  statut      TEXT NOT NULL,
  faite_le    TIMESTAMPTZ NOT NULL,
  traite_le   TIMESTAMPTZ,
  traite_par  TEXT,
  note        TEXT,
  -- La remontee est rejouable sans doublon. Le rang distingue deux articles
  -- d'une meme commande servis par la meme spirale — ou sans spirale du tout.
  -- NULLS NOT DISTINCT : une ligne sans canal doit se dedoublonner comme les
  -- autres, et pour Postgres deux NULL ne sont pas egaux par defaut.
  CONSTRAINT vente_unicite UNIQUE NULLS NOT DISTINCT (borne_id, commande_id, lane, article)
);

CREATE INDEX IF NOT EXISTS i_vente_borne ON vente(borne_id, faite_le DESC);
CREATE INDEX IF NOT EXISTS i_vente_souci ON vente(borne_id) WHERE statut <> 'distribue' AND traite_le IS NULL;

-- ------------------------------------------------------------------------ vues
--
-- Le stock d'un lieu.
--
-- Asymetrie voulue : ce qui SORT compte des la saisie, ce qui ENTRE ne compte
-- qu'une fois confirme. Un transfert saisi vide la reserve tout de suite (la
-- marchandise est dans la voiture) mais ne remplit la borne qu'a l'acquittement
-- de la machine. La difference, c'est ce qui est en route.

CREATE OR REPLACE VIEW v_stock AS
  SELECT compte_id, lieu_id, produit_id, SUM(q)::INTEGER AS quantite
    FROM (
      SELECT compte_id, vers_lieu_id AS lieu_id, produit_id,  quantite AS q
        FROM mouvement
       WHERE vers_lieu_id IS NOT NULL AND annule_le IS NULL AND confirme_le IS NOT NULL
      UNION ALL
      SELECT compte_id, de_lieu_id AS lieu_id, produit_id, -quantite AS q
        FROM mouvement
       WHERE de_lieu_id IS NOT NULL AND annule_le IS NULL
    ) t
   GROUP BY compte_id, lieu_id, produit_id;

CREATE OR REPLACE VIEW v_en_route AS
  SELECT m.compte_id, m.vers_lieu_id AS lieu_id, m.produit_id,
         SUM(m.quantite)::INTEGER AS quantite,
         MIN(m.fait_le) AS depuis
    FROM mouvement m
   WHERE m.vers_lieu_id IS NOT NULL AND m.confirme_le IS NULL AND m.annule_le IS NULL
   GROUP BY m.compte_id, m.vers_lieu_id, m.produit_id;

-- Le prix d'achat retenu : le dernier paye. Simple, comprehensible, et suffisant
-- pour valoriser un stock de distributeur. Un PMP serait plus juste comptablement
-- et beaucoup moins lisible pour celui qui remplit la machine.
CREATE OR REPLACE VIEW v_prix_achat AS
  SELECT DISTINCT ON (produit_id) produit_id, prix_achat_c, fait_le
    FROM mouvement
   WHERE motif = 'reception' AND prix_achat_c IS NOT NULL AND annule_le IS NULL
   ORDER BY produit_id, fait_le DESC;

-- ------------------------------------------------------------------ appairage
--
-- Le sens compte. Avant, le SaaS emettait un code qu'il fallait taper SUR LA
-- BORNE — c'est-a-dire sur le clavier le plus penible du dispositif.
--
-- Desormais c'est la borne qui demande : elle affiche un QR et un code court, et
-- c'est le proprietaire qui les porte a son compte, depuis son telephone. La
-- borne recupere ensuite son jeton en interrogeant sa propre demande. Meme
-- principe qu'une application de television.

CREATE TABLE IF NOT EXISTS appairage (
  id         BIGSERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,     -- six caracteres, lisibles a voix haute
  secret     TEXT NOT NULL UNIQUE,     -- ce que la borne presente pour reclamer son jeton
  modele     TEXT,
  version    TEXT,
  cree_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_le  TIMESTAMPTZ NOT NULL,
  borne_id   BIGINT REFERENCES borne(id) ON DELETE CASCADE,
  jeton      TEXT,                     -- pose a la confirmation, efface des qu'il est reclame
  reclame_le TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS i_appairage_vif ON appairage(code) WHERE borne_id IS NULL;

-- Le mouvement engendre par une vente ne doit exister qu'une fois, meme si la
-- borne rejoue son lot dix fois. Il est donc rattache a la vente elle-meme.
ALTER TABLE mouvement ADD COLUMN IF NOT EXISTS vente_id BIGINT UNIQUE REFERENCES vente(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------ categories
--
-- La categorie etait une chaine libre posee sur le produit. Trois inconvenients :
-- on ne peut pas la renommer sans toucher chaque ligne, deux fautes de frappe
-- font deux categories, et on ne peut pas choisir l'ordre dans lequel elles
-- apparaissent sur la borne. Elle devient une table.

CREATE TABLE IF NOT EXISTS categorie (
  id        BIGSERIAL PRIMARY KEY,
  compte_id BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  nom       TEXT NOT NULL,
  -- L'ordre d'affichage. Il classe le SaaS, et il est transmis a la borne dans
  -- /api/borne/config ; l'APK 5.0 ne s'en sert pas encore — son ecran d'accueil
  -- est construit a partir d'une liste ecrite en dur.
  ordre     INTEGER NOT NULL DEFAULT 100,
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (compte_id, nom)
);

ALTER TABLE produit ADD COLUMN IF NOT EXISTS categorie_id BIGINT REFERENCES categorie(id) ON DELETE RESTRICT;

-- Reprise de l'existant : chaque valeur textuelle distincte devient une ligne, et
-- les produits sont rattaches. Rejouable — la migration doit pouvoir tourner deux
-- fois sans rien casser.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'produit' AND column_name = 'categorie') THEN

    INSERT INTO categorie (compte_id, nom, ordre)
      SELECT DISTINCT p.compte_id, COALESCE(NULLIF(p.categorie, ''), 'divers'), 100
        FROM produit p
    ON CONFLICT (compte_id, nom) DO NOTHING;

    UPDATE produit p SET categorie_id = c.id
      FROM categorie c
     WHERE c.compte_id = p.compte_id
       AND c.nom = COALESCE(NULLIF(p.categorie, ''), 'divers')
       AND p.categorie_id IS NULL;

    ALTER TABLE produit DROP COLUMN categorie;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS i_produit_categorie ON produit(categorie_id);

-- ------------------------------------------------------------------- reveil
--
-- On ne peut pas appeler une borne : elle est derriere le routeur d'un bar, sans
-- adresse publique. On fait donc l'inverse — c'est ELLE qui tient une question
-- ouverte (« as-tu quelque chose pour moi ? »), et le serveur y repond a la
-- seconde ou l'on pose ce drapeau.
--
-- L'effet est celui d'une notification, sans rien a installer : pas de service
-- tiers, pas de connexion permanente a maintenir, rien qui casse quand le bar
-- change de box internet.
ALTER TABLE borne ADD COLUMN IF NOT EXISTS reveil_le TIMESTAMPTZ;
ALTER TABLE borne ADD COLUMN IF NOT EXISTS reveil_motif TEXT;


/* ─────────────────────────────────────────────────────────────────────────────
   LA PUBLICITE DE L'ECRAN D'ACCUEIL

   Une PLAYLIST est une campagne : « Promo rentree », « Soiree du samedi ». Elle
   porte ce qui vaut pour l'ensemble — ou ca passe, a partir de quand, jusqu'a
   quand, et si ca tourne. On ne choisit pas des bornes et des dates douze fois
   pour douze photos de la meme operation.

   Les MEDIAS qu'elle contient ne portent que leur duree et leur rang. Le fichier
   vit ICI, dans la base : un compte de moins a creer, une cle de moins a perdre,
   et la borne le tire par le meme jeton que le reste. Le prix de ce choix est
   une limite dure sur la taille — voir TAILLE_MAX cote application. Le jour ou
   la video prend de la place, `octets` devient une URL et rien d'autre ne bouge.

   L'EMPREINTE EST LA CLE. La borne garde les fichiers qu'elle a deja et ne
   retelecharge que ce qu'elle ne connait pas. Sans elle, une machine en 4G
   rapatrierait quinze megaoctets toutes les trente secondes.
   ───────────────────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS playlist (
  id        BIGSERIAL PRIMARY KEY,
  compte_id BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  nom       TEXT NOT NULL,
  ordre     INTEGER NOT NULL DEFAULT 0,
  actif     BOOLEAN NOT NULL DEFAULT TRUE,
  partout   BOOLEAN NOT NULL DEFAULT TRUE,    -- sinon, voir playlist_borne
  debut_le  DATE,                             -- bornes de diffusion, facultatives
  fin_le    DATE,
  reprise_de BIGINT REFERENCES borne(id) ON DELETE SET NULL,  -- nee d'une reprise de machine
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playlist_compte ON playlist (compte_id, ordre);

CREATE TABLE IF NOT EXISTS playlist_borne (
  playlist_id BIGINT NOT NULL REFERENCES playlist(id) ON DELETE CASCADE,
  borne_id    BIGINT NOT NULL REFERENCES borne(id) ON DELETE CASCADE,
  PRIMARY KEY (playlist_id, borne_id)
);

CREATE TABLE IF NOT EXISTS visuel (
  id          BIGSERIAL PRIMARY KEY,
  compte_id   BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  playlist_id BIGINT NOT NULL REFERENCES playlist(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL,
  genre       TEXT NOT NULL CHECK (genre IN ('image','video')),
  type_mime   TEXT NOT NULL,
  octets      BYTEA NOT NULL,
  taille      INTEGER NOT NULL,
  empreinte   TEXT NOT NULL,                  -- sha256 du contenu
  duree_s     INTEGER NOT NULL DEFAULT 7,     -- une image dure ce qu'on dit ; une video, ce qu'elle dure
  ordre       INTEGER NOT NULL DEFAULT 0,     -- son rang dans la playlist
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visuel_playlist ON visuel (playlist_id, ordre);

-- ------------------------------------------------------------------ assistance

-- LE NUMERO A APPELER QUAND CA COINCE.
--
-- Une borne est seule dans un bar, la nuit. Quand elle refuse une carte, avale
-- un paiement ou ne descend pas un produit, le client n'a personne a qui le
-- dire : il s'en va, et l'exploitant ne saura jamais qu'il a perdu une vente et
-- un client. Un numero affiche coute une ligne de texte et rattrape les deux.
--
-- Il vit sur le COMPTE : c'est le meme exploitant qui repond pour toutes ses
-- machines. Une borne peut porter le sien (un bar qui repond pour la machine
-- qu'il heberge) ; vide, elle affiche celui du compte.
ALTER TABLE compte ADD COLUMN IF NOT EXISTS sav_tel   TEXT;
ALTER TABLE compte ADD COLUMN IF NOT EXISTS sav_texte TEXT;
ALTER TABLE borne  ADD COLUMN IF NOT EXISTS sav_tel   TEXT;
ALTER TABLE borne  ADD COLUMN IF NOT EXISTS sav_texte TEXT;

-- ------------------------------------------------------- fiche produit

-- CE QU'ON PEUT DIRE D'UN PRODUIT AU CLIENT, DEVANT LA MACHINE.
--
-- Un distributeur ne laisse pas retourner la boite pour lire l'etiquette. Le
-- client voit un nom, un prix, et doit decider. Ces deux champs sont ce qui
-- remplace l'etiquette : la description, qui aide a choisir, et la mention
-- legale, qui n'est pas facultative sur des produits reglementes.
--
-- LA MENTION EST ECRITE PAR L'EXPLOITANT, pas devinee par nous. Le libelle
-- exact engage sa responsabilite, il varie avec le produit et avec la loi ; une
-- phrase que nous aurions fabriquee serait fausse quelque part. La machine, elle,
-- ajoute d'office ce qu'elle SAIT — la restriction d'age, qu'elle applique deja.
ALTER TABLE produit ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE produit ADD COLUMN IF NOT EXISTS mention     TEXT;

-- --------------------------------------------------- mot de passe de maintenance

-- LE CODE QUI OUVRE LA CONSOLE DE LA MACHINE.
--
-- Il valait 123450 pour tout le parc, ecrit en dur dans l'application : un code
-- que personne ne change est un code que tout le monde finit par connaitre, et
-- la console commande les moteurs, vide les compteurs et remet la machine a
-- neuf. Il devient donc propre a chaque borne, et il tourne.
--
-- IL EST DELIVRE, PAS DECIDE. Le SaaS ne le renouvelle qu'au moment ou la
-- machine vient le chercher : ce que cette page affiche est ce que la borne
-- porte VRAIMENT. Une machine hors ligne garde son code, et le technicien qui
-- se deplace entre dedans — l'inverse l'aurait laisse devant une porte fermee.
ALTER TABLE borne ADD COLUMN IF NOT EXISTS maintenance_pin    TEXT;
ALTER TABLE borne ADD COLUMN IF NOT EXISTS maintenance_pin_le TIMESTAMPTZ;

-- Ce que la borne DIT porter comme code, a son dernier passage. Vide tant
-- qu'elle tourne sur une version qui ignore le champ : le SaaS s'abstient alors
-- de renouveler quoi que ce soit, et la machine reste sur le code d'usine.
ALTER TABLE borne ADD COLUMN IF NOT EXISTS maintenance_vu TEXT;

-- --------------------------------------------------------- sorties de stock

-- POURQUOI LA MARCHANDISE A DISPARU.
--
-- Une bouteille tombe, un carton part avec quelqu'un, une date limite passe :
-- ces unites quittent la reserve sans passer par une machine. Elles n'avaient
-- pas de motif — l'ecart se retrouvait au prochain inventaire, des mois plus
-- tard, sous la forme d'un chiffre faux et sans explication.
--
-- Des motifs SEPARES plutot qu'une perte unique commentee : douze casses sur un
-- produit appellent un autre geste que douze vols, et une note libre ne se
-- compte pas. La contrainte est refaite ici parce que la table existe deja —
-- un CREATE TABLE IF NOT EXISTS ne la reprendrait pas.
ALTER TABLE mouvement DROP CONSTRAINT IF EXISTS mouvement_motif_check;
ALTER TABLE mouvement ADD CONSTRAINT mouvement_motif_check CHECK (motif IN
  ('reception','transfert','vente','perte','retour','inventaire',
   'casse','vol','peremption','autre'));

-- ------------------------------------------------- compteur du SaaS et compteur de la borne

-- DEUX CHIFFRES, ET L'ECART ENTRE EUX.
--
-- `canal.quantite` etait ce que la machine annonçait, ecrase a chaque releve.
-- Un chargement saisi ici disparaissait donc des que la borne parlait, et
-- l'exploitant ne pouvait pas corriger un stock : la machine avait toujours le
-- dernier mot.
--
-- Desormais `quantite` est NOTRE compte, tenu par les evenements — solde
-- d'ouverture a l'appairage, plus les transferts confirmes, moins les ventes
-- distribuees et les sorties. `quantite_borne` garde ce que la machine dit
-- porter. L'ecart entre les deux n'est pas un defaut a lisser : c'est le vol,
-- la casse, le capteur muet et la saisie ratee, et c'est la seule facon de les
-- voir.
ALTER TABLE canal ADD COLUMN IF NOT EXISTS quantite_borne INTEGER;
ALTER TABLE canal ADD COLUMN IF NOT EXISTS releve_borne_le TIMESTAMPTZ;

-- Les bornes deja en service n'ont jamais rien eu d'autre que le compteur de la
-- machine : on part de la plutot que de zero, sinon tout le parc s'annoncerait
-- vide au premier deploiement.
UPDATE canal SET quantite_borne = quantite WHERE quantite_borne IS NULL;

-- ------------------------------------------------------- reconciliation d'un canal

-- METTRE LES DEUX COMPTEURS D'ACCORD.
--
-- Nos livres disent 3, la machine dit 10. L'un des deux a tort, parfois les
-- deux. Corriger nos livres seuls laisse la borne vendre sur un chiffre faux ;
-- corriger la machine seule laisse notre stock faux. La reconciliation ecrit
-- donc des DEUX cotes.
--
-- Cote SaaS, la correction est un mouvement d'inventaire — le motif existait
-- deja et n'avait jamais servi. Cote machine, elle voyage ici : une valeur
-- ABSOLUE pour une spire, que la borne pose sur son compteur. Ce n'est pas un
-- transfert, qui est un ecart et s'ajoute ; c'est un « ta spire 3 contient 8 »,
-- et un ecart n'aurait pas su corriger une machine qui a deja tort.
--
-- `applique_le` la ferme. Sans lui, une correction repartirait a chaque appel et
-- ecraserait indefiniment les ventes survenues depuis.
CREATE TABLE IF NOT EXISTS correction_canal (
  id          BIGSERIAL PRIMARY KEY,
  borne_id    BIGINT NOT NULL REFERENCES borne(id) ON DELETE CASCADE,
  lane        INTEGER NOT NULL,
  quantite    INTEGER NOT NULL CHECK (quantite >= 0),
  par         TEXT,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  applique_le TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS i_correction_vive
  ON correction_canal (borne_id) WHERE applique_le IS NULL;

-- ------------------------------------------------------- mise hors service

-- ARRETER LA VENTE SANS SE DEPLACER.
--
-- Une spirale bloquee, un produit rappele, un bar ferme trois semaines : la
-- machine fonctionne mais ne doit plus servir. Jusqu'ici la seule facon d'y
-- arriver etait de la debrancher — ce qui coupe aussi la synchronisation, donc
-- la remontee des ventes et toute possibilite de la reprendre a distance.
--
-- L'ecran hors service existait deja, mais seule la machine pouvait le decider,
-- sur une panne materielle. C'est maintenant aussi une decision d'exploitant.
--
-- LE MOTIF EST AFFICHE AU CLIENT. « Momentanement indisponible » sans plus
-- laisse quelqu'un devant une machine muette ; « Reouverture lundi » lui evite
-- d'attendre.
ALTER TABLE borne ADD COLUMN IF NOT EXISTS hors_service       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE borne ADD COLUMN IF NOT EXISTS hors_service_texte TEXT;
ALTER TABLE borne ADD COLUMN IF NOT EXISTS hors_service_le    TIMESTAMPTZ;

-- ------------------------------------------------- appartenance et acces

-- UNE PERSONNE, PLUSIEURS EXPLOITANTS.
--
-- `utilisateur.compte_id` liait une adresse a un compte et un seul. C'etait
-- juste tant qu'un utilisateur etait un associe ; ca ne l'est plus des qu'on
-- invite le patron d'un bar, ou un reassortisseur independant qui tourne pour
-- trois exploitants. Il lui fallait autant d'adresses que de clients.
--
-- L'appartenance devient donc une ligne a part, avec son role. La colonne
-- `utilisateur.compte_id` reste : c'est le compte d'origine, celui de
-- l'inscription, et elle sert de reprise pour tout ce qui existait avant.
CREATE TABLE IF NOT EXISTS membre (
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  compte_id      BIGINT NOT NULL REFERENCES compte(id)      ON DELETE CASCADE,
  role           TEXT   NOT NULL,
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (utilisateur_id, compte_id)
);

-- La reprise de l'existant. Idempotente : elle peut tourner a chaque migration.
INSERT INTO membre (utilisateur_id, compte_id, role)
  SELECT id, compte_id, role FROM utilisateur
  ON CONFLICT (utilisateur_id, compte_id) DO NOTHING;

-- L'ACCES PAR BORNE.
--
-- AUCUNE LIGNE VEUT DIRE TOUTES LES BORNES. C'est ce qui permet a la refonte de
-- ne rien casser : un associe n'a aucune ligne ici et voit tout le parc, comme
-- avant. Une ligne restreint — et c'est ce qu'on pose en invitant quelqu'un
-- pour une machine et une seule.
CREATE TABLE IF NOT EXISTS acces_borne (
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  borne_id       BIGINT NOT NULL REFERENCES borne(id)       ON DELETE CASCADE,
  PRIMARY KEY (utilisateur_id, borne_id)
);

-- LE COMPTE SUR LEQUEL LA SESSION TRAVAILLE.
--
-- Une personne qui appartient a deux comptes doit pouvoir passer de l'un a
-- l'autre sans se reconnecter, et la borne qu'elle regarde ne doit jamais
-- dependre de l'ordre des lignes en base. Nul = le compte d'origine.
ALTER TABLE session ADD COLUMN IF NOT EXISTS compte_id BIGINT REFERENCES compte(id) ON DELETE CASCADE;

-- UNE INVITATION PEUT NE DONNER QU'UNE BORNE.
-- Nul = tout le compte, ce qu'elle a toujours fait.
ALTER TABLE invitation ADD COLUMN IF NOT EXISTS borne_id BIGINT REFERENCES borne(id) ON DELETE CASCADE;

-- ------------------------------------------------------- la fiche d'une borne

-- CE QU'ON MET SUR UNE MACHINE POUR LA RECONNAITRE.
--
-- Une borne n'avait qu'un nom, saisi une fois a l'adoption et jamais repris. Un
-- parc de vingt machines devient alors une liste de vingt lignes qui se
-- ressemblent, et le reassortisseur qui part en tournee ne sait pas laquelle est
-- au fond du bar et laquelle est a l'entree.
--
-- La description dit ce qu'aucun champ structure ne dira jamais : « au fond a
-- gauche, derriere le flipper », « le patron ouvre a 17 h », « prise derriere le
-- comptoir ». La photo, elle, se reconnait avant d'etre lue.
ALTER TABLE borne ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE borne ADD COLUMN IF NOT EXISTS image_id BIGINT REFERENCES image(id) ON DELETE SET NULL;

-- ------------------------------------------------------------ le profil

-- QUI EST DERRIERE UNE ADRESSE.
--
-- Un utilisateur n'avait qu'un e-mail. Dans une equipe de six, la liste des
-- membres et les traces d'action — « charge par », « traite par » — ne disaient
-- que « j.dupont@… », qu'il faut lire pour reconnaitre. Un nom et une photo se
-- reconnaissent avant d'etre lus.
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS nom TEXT;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS image_id BIGINT REFERENCES image(id) ON DELETE SET NULL;

-- --------------------------------------------------- on retire, on n'efface pas

-- UNE CATEGORIE SE DESACTIVE.
--
-- Elle etait SUPPRIMEE, et ses produits detaches au passage. Deux mois de ventes
-- deja remontees basculaient alors dans « sans categorie » : l'historique se
-- reecrivait pour un menage d'aujourd'hui.
--
-- Le produit avait deja son drapeau `actif` ; la categorie n'en avait pas. Elle
-- l'a maintenant, et le meme geste — « retirer » — la sort des listes sans
-- toucher a ce qui s'est vendu sous son nom.
ALTER TABLE categorie ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;

-- ------------------------------------------------------- le « i » d'un produit

-- LA FICHE PEUT NE PAS ETRE PROPOSEE.
--
-- Le « i » est pose sur CHAQUE carte de l'etal, et sur un article dont il n'y a
-- rien a dire — un briquet, une pile — il ouvre une fiche qui repond « aucune
-- description n'a ete renseignee ». C'est un bouton qui promet et ne tient pas :
-- le client le touche, lit qu'il n'y a rien, et revient. Un geste perdu a
-- l'instant precis ou il choisissait.
--
-- L'exploitant tranche donc produit par produit, la ou il ecrit deja la fiche.
-- VRAI PAR DEFAUT : une description ecrite doit se lire sans qu'on ait rien a
-- cocher, et le parc en service ne change pas de comportement au deploiement.
ALTER TABLE produit ADD COLUMN IF NOT EXISTS fiche_visible BOOLEAN NOT NULL DEFAULT true;

-- --------------------------------------------- l'ecran d'accueil et l'attente

-- L'ECRAN D'ACCUEIL PEUT ETRE COUPE.
--
-- La veille — le grand logo, « Touchez l'ecran pour commencer », la publicite —
-- fait gagner la dalle et la marque dans un bar ou la machine est vue de loin.
-- Elle coute une porte : le client doit toucher une fois pour voir ce qui est en
-- vente, et devant une machine posee en libre-service au milieu d'un passage,
-- cette porte est ce qui separe quelqu'un de l'etal.
--
-- Coupee, la borne reste EN PERMANENCE sur son catalogue. On n'annonce plus, on
-- montre. C'est une decision d'implantation, pas de gout : elle se prend par
-- machine, ici, sans monter au mur avec un cable.
ALTER TABLE borne ADD COLUMN IF NOT EXISTS veille_active BOOLEAN NOT NULL DEFAULT true;

-- LE DELAI D'INACTIVITE, EN SECONDES.
--
-- Il etait fige a soixante dans l'APK. Soixante secondes, c'est court pour qui
-- lit une fiche produit, cherche sa carte, ou hesite a deux devant l'etal : le
-- panier se vidait sous les yeux du client. Il passe a QUATRE-VINGT-DIX par
-- defaut, et l'exploitant l'ajuste selon le lieu — un bar bruyant n'a pas le
-- meme tempo qu'une salle d'attente.
--
-- Ce qu'on mesure est le temps SANS AUCUN GESTE, pas le temps passe sur une
-- page : quelqu'un qui prend son temps ne perd rien tant qu'il touche l'ecran.
-- A l'echeance, la borne repart au repos — la veille, ou l'etal quand la veille
-- est coupee — panier vide et filtre efface, prete pour le suivant.
--
-- Les bornes: 20 s au moins (en dessous, on coupe quelqu'un en pleine lecture),
-- 600 s au plus (au-dela, le panier d'un client parti serait paye par le suivant).
ALTER TABLE borne ADD COLUMN IF NOT EXISTS inactivite_s INT NOT NULL DEFAULT 90;

-- ------------------------------------------------------- le prix par borne

-- LE MEME CATALOGUE, PAS LE MEME PRIX.
--
-- `produit.prix_vente_c` valait pour tout le parc. C'est juste tant que les
-- machines se ressemblent, et faux des la deuxieme implantation : une borne
-- dans un bar de nuit, une autre dans le hall d'une salle de sport et une
-- troisieme sur une aire d'autoroute ne se vendent pas au meme prix. Le loyer
-- n'est pas le meme, la clientele non plus, et la concurrence d'a cote encore
-- moins. Sans ce reglage, l'exploitant n'avait que deux issues : aligner tout
-- le parc sur le moins cher, ou tenir un catalogue par machine — c'est-a-dire
-- ressaisir onze produits autant de fois qu'il a de bornes, et les voir
-- diverger au premier changement de nom.
--
-- CE SONT DES EXCEPTIONS, PAS UN SECOND CATALOGUE. Meme forme que
-- `borne_masque` : aucune ligne ici veut dire « cette borne suit le catalogue ».
-- Le produit reste unique — un nom, une photo, une fiche, un SKU, un stock —
-- et seule la ligne du prix se dedouble, la ou elle doit l'etre. Rien a
-- reprendre pour le parc en service : sans exception, il vend exactement ce
-- qu'il vendait hier.
--
-- ET UNE EXCEPTION QUI VAUT LE PRIX GENERAL N'EN EST PAS UNE. La route qui
-- enregistre efface la ligne dans ce cas plutot que de la poser : sinon le parc
-- se remplit de prix propres invisibles, identiques au catalogue le jour ou on
-- les pose, et qui cessent de le suivre sans que personne l'ait voulu.
--
-- LE PRIX PAYE, LUI, NE SE DEDUIT JAMAIS D'ICI. `vente.prix_c` est ce que la
-- machine a REELLEMENT encaisse et qu'elle remonte avec la vente. Recalculer un
-- chiffre d'affaires a partir du prix d'aujourd'hui reecrirait l'histoire a
-- chaque changement de tarif.
CREATE TABLE IF NOT EXISTS prix_borne (
  borne_id   BIGINT NOT NULL REFERENCES borne(id)   ON DELETE CASCADE,
  produit_id BIGINT NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
  prix_c     INTEGER NOT NULL CHECK (prix_c >= 0),
  par        TEXT,
  pose_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (borne_id, produit_id)
);

-- « Ce produit a-t-il un prix propre quelque part ? » est la question que pose
-- le catalogue general, sur chacune de ses lignes : elle se lit par produit et
-- non par borne, ce que la cle primaire ne sait pas servir.
CREATE INDEX IF NOT EXISTS i_prix_borne_produit ON prix_borne (produit_id);

-- ------------------------------------------------------------------ statuts de vente
--
-- La borne 5.13 dit ou une vente s'est arretee. Avant, tout ce qui n'aboutissait
-- pas avant la spirale (carte absente, carte refusee, age refuse) arrivait en
-- `non_distribue` sans canal, et la page Ventes le mettait avec les incidents.
-- Les mots sont ceux de `StatutVente` cote borne et de `src/lib/ventes.ts` ici.

ALTER TABLE vente DROP CONSTRAINT IF EXISTS vente_statut_check;
ALTER TABLE vente ADD CONSTRAINT vente_statut_check CHECK (statut IN (
  'distribue',
  'chute_non_detectee',    -- paye, la spirale a tourne, la cellule n'a rien vu ; VEND FAILURE envoye
  'non_distribue',         -- paye, la spirale n'a pas tourne (carte, delai, plus de rack) ; VEND FAILURE envoye
  'litige',                -- paye, rien n'est tombe, et de l'argent est reste chez le lecteur
  'age_refuse',            -- article retire avant paiement : age non verifie
  'carte_absente',         -- aucune carte presentee, ou client parti
  'carte_refusee',         -- refusee par le terminal
  'terminal_indisponible', -- pas de terminal joignable
  'avortee'                -- interrompue avant la spirale, motif non remonte (bornes <= 5.12)
));

-- Reprise : ce que les bornes <= 5.12 ont remonte sans canal n'a jamais fait
-- tourner de spirale. C'etait une tentative de paiement, pas un incident. Borne
-- dans le temps pour ne pas reprendre ce que la 5.13 enverra ensuite.
UPDATE vente SET statut = 'avortee'
 WHERE statut = 'non_distribue' AND lane IS NULL AND faite_le < '2026-09-08';

-- Le rang de l'article et la contrainte d'unicite du CREATE, pour les bases qui
-- ont recu la table sous sa premiere forme `UNIQUE (borne_id, commande_id, lane)`.
-- Celle-ci perdait le second article d'une commande servi par la meme spirale, et
-- ne dedoublonnait pas les lignes sans canal.
ALTER TABLE vente ADD COLUMN IF NOT EXISTS article SMALLINT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vente_unicite') THEN
    ALTER TABLE vente DROP CONSTRAINT IF EXISTS vente_borne_id_commande_id_lane_key;
    ALTER TABLE vente ADD CONSTRAINT vente_unicite
      UNIQUE NULLS NOT DISTINCT (borne_id, commande_id, lane, article);
  END IF;
END $$;

-- ---------------------------------------------------------------- journaux
-- Ce que la borne ecrit sur son disque, recopie ligne a ligne.
--
-- La machine tient deux fichiers : `commandes` (le journal d'ecriture anticipee
-- de chaque vente : ouverture, paiement, spirale, resultat, cloture) et
-- `diagnostic` (la trace technique : trames de la carte et du terminal, reprise
-- de liaison, synchronisations). Sur place, ils ne se lisent qu'en exportant un
-- fichier depuis l'ecran d'administration ; et le second ne garde qu'une ou deux
-- heures, parce qu'il est plafonne a 512 Ko. Ici on garde tout ce qui a du sens.
--
-- `position` est l'adresse de la ligne dans le fichier de la borne (en octets,
-- cumulee au travers des troncatures) et `lot` change quand la borne repart de
-- zero (reinstallation). A eux deux ils rendent l'envoi rejouable : une borne
-- qui n'a pas recu notre accuse renvoie le meme paquet, et rien n'est compte deux
-- fois. La borne n'envoie PAS les battements de supervision (POLL du terminal,
-- heartbeat de la carte), qui font l'essentiel du volume et ne disent rien.
CREATE TABLE IF NOT EXISTS journal_borne (
  id          BIGSERIAL PRIMARY KEY,
  borne_id    BIGINT NOT NULL REFERENCES borne(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('commandes', 'diagnostic')),
  lot         TEXT NOT NULL,
  position    BIGINT NOT NULL,
  horodatage  TIMESTAMPTZ,            -- lu dans la ligne ; NULL si elle n'en porte pas
  commande_id TEXT,                   -- ORD-XXXXXXXX si la ligne en parle
  ligne       TEXT NOT NULL,
  recu_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (borne_id, source, lot, position)
);
CREATE INDEX IF NOT EXISTS i_journal_borne ON journal_borne (borne_id, id DESC);
CREATE INDEX IF NOT EXISTS i_journal_borne_commande
  ON journal_borne (borne_id, commande_id) WHERE commande_id IS NOT NULL;
-- La purge du diagnostic (60 jours) passe par la.
CREATE INDEX IF NOT EXISTS i_journal_borne_purge ON journal_borne (recu_le) WHERE source = 'diagnostic';

-- ----------------------------------------------------------------- mode demo

-- UN COMPTE NEUF S'OUVRE SUR DES DONNEES INVENTEES.
--
-- Une console vide n'apprend rien : pas de borne, pas de vente, un tableau de
-- bord qui dit zero partout, et rien a toucher pour comprendre ce que l'outil
-- fait. Le compte nait donc avec un parc fictif — trois bornes, un catalogue,
-- trois semaines de ventes — que l'on peut manipuler comme s'il etait vrai, et
-- un bandeau sur chaque page pour qu'on ne l'oublie pas.
--
-- `demo` dit que le compte est encore dans ce bac a sable. Le quitter efface
-- tout ce que le compte contient et le rend vierge ; ce n'est pas reversible,
-- sauf a repartir de zero. `demo_vie` est la derniere fois que les bornes
-- fictives ont « parle » : c'est ce qui permet de leur faire vendre quelques
-- articles entre deux visites, confirmer un chargement, et rester en ligne.
ALTER TABLE compte ADD COLUMN IF NOT EXISTS demo     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE compte ADD COLUMN IF NOT EXISTS demo_vie TIMESTAMPTZ;

-- ------------------------------------------------------------- notifications

-- ETRE PREVENU SANS AVOIR LA CONSOLE OUVERTE.
--
-- Une borne vend a deux heures du matin, avale un paiement, se vide : personne
-- ne le sait avant d'ouvrir la console le lendemain. Le telephone, lui, est
-- dans la poche. La console s'installe donc comme une application (manifeste
-- et service worker) et pousse des notifications par le protocole Web Push :
-- pas de compte chez un tiers, pas d'application a publier, ca marche sur
-- Android et sur iOS des que la console est posee sur l'ecran d'accueil.
--
-- UN ABONNEMENT EST UN APPAREIL. Le navigateur fournit une adresse (endpoint)
-- et deux cles ; c'est tout ce qu'il faut pour lui parler, et ca ne dit rien
-- de la personne. On le rattache a l'utilisateur, pas au compte : quelqu'un
-- qui sert deux exploitants est prevenu pour les deux, et une restriction par
-- borne (acces_borne) s'applique au moment d'envoyer, pas ici.
--
-- Les preferences sont PAR APPAREIL : on veut chaque vente sur le telephone
-- qu'on a la nuit, et seulement les incidents sur l'ordinateur du bureau.
CREATE TABLE IF NOT EXISTS abonnement_push (
  id             BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  origine        TEXT,                        -- l'adresse de la console vue par l'appareil
  appareil       TEXT,                        -- ce qu'on sait du navigateur, pour le reconnaitre dans la liste
  ventes         BOOLEAN NOT NULL DEFAULT true,
  incidents      BOOLEAN NOT NULL DEFAULT true,
  vides          BOOLEAN NOT NULL DEFAULT true,
  chargements    BOOLEAN NOT NULL DEFAULT false,
  echecs         INTEGER NOT NULL DEFAULT 0,  -- envois rates de suite ; l'abonnement saute au dixieme
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  envoye_le      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS i_abonnement_push_utilisateur ON abonnement_push (utilisateur_id);

-- LA PAIRE DE CLES QUI SIGNE LES ENVOIS (VAPID).
--
-- Le service de push de chaque navigateur exige que l'expediteur se signe.
-- Une seule paire pour toute la console ; elle est generee au premier
-- abonnement et rangee ici plutot que dans l'environnement, pour qu'il n'y
-- ait rien a configurer. REDBOX_VAPID_PUBLIQUE / REDBOX_VAPID_PRIVEE dans
-- l'environnement passent devant, pour un hebergeur qui prefere les tenir.
-- Changer de paire invalide tous les abonnements : chaque appareil devra se
-- reabonner.
CREATE TABLE IF NOT EXISTS cle_vapid (
  id       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  publique TEXT NOT NULL,
  privee   TEXT NOT NULL,
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- messagerie

-- SE PARLER LA OU L'ON TRAVAILLE.
--
-- Une equipe de distributeurs se parle deja : par SMS, sur WhatsApp, au
-- telephone. Ce qui s'y dit — « j'ai recharge le Duplex », « la spire 301
-- coince », « qui passe a Montreuil samedi ? » — parle des bornes, et se perd
-- loin d'elles. La console a donc ses SALONS, comme Discord a les siens : un
-- « general », et un par borne, ou la machine elle-meme ecrit ce qui lui
-- arrive. On lit ses ventes et on repond a son collegue au meme endroit.
--
-- Un salon appartient au compte. Ceux d'une borne ne se montrent qu'a ceux
-- qui voient la borne — meme regle que les pages. Le nom est celui qu'on
-- tape apres le diese : minuscules, tirets, unique dans le compte.
CREATE TABLE IF NOT EXISTS salon (
  id         BIGSERIAL PRIMARY KEY,
  compte_id  BIGINT NOT NULL REFERENCES compte(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  sujet      TEXT,                                       -- la ligne sous le nom
  borne_id   BIGINT REFERENCES borne(id) ON DELETE CASCADE,  -- le salon d'une machine
  ordre      INTEGER NOT NULL DEFAULT 100,
  cree_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_le TIMESTAMPTZ,
  UNIQUE (compte_id, nom)
);
CREATE UNIQUE INDEX IF NOT EXISTS i_salon_borne ON salon (borne_id) WHERE borne_id IS NOT NULL;

-- UN MESSAGE NE S'EFFACE PAS, IL SE RETIRE. Le trou dit qu'il y a eu quelque
-- chose ; un fil qui se reecrit fait douter de tout le reste. Sans auteur,
-- c'est la machine qui parle — ou le systeme, pour dire qu'une borne est
-- arrivee.
CREATE TABLE IF NOT EXISTS message (
  id             BIGSERIAL PRIMARY KEY,
  salon_id       BIGINT NOT NULL REFERENCES salon(id) ON DELETE CASCADE,
  utilisateur_id BIGINT REFERENCES utilisateur(id) ON DELETE SET NULL,
  texte          TEXT NOT NULL,
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS i_message_salon ON message (salon_id, id DESC);

-- OU CHACUN EN EST. Le dernier message lu, par salon : c'est ce qui fait la
-- pastille, et ce qui distingue « rien de neuf » de « rien du tout ».
CREATE TABLE IF NOT EXISTS salon_lecture (
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  salon_id       BIGINT NOT NULL REFERENCES salon(id) ON DELETE CASCADE,
  dernier_id     BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (utilisateur_id, salon_id)
);

-- Les messages des collegues se poussent aussi sur le telephone.
ALTER TABLE abonnement_push ADD COLUMN IF NOT EXISTS messages BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------- communaute

-- LES EXPLOITANTS SE PARLENT ENTRE EUX, ET A NOUS.
--
-- Un compte etait une ile : ses bornes, son equipe, ses salons. Or ceux qui
-- font tourner des RedBox ont les memes questions, les memes bars, les memes
-- pannes — et l'editeur a des choses a leur dire a tous, une mise a jour a
-- installer par exemple. La messagerie s'ouvre donc au-dela du compte :
--
--   annonces     l'editeur ecrit, tout le monde lit ;
--   communaute   des salons par groupe — tous, proprietaires (au moins une
--                vraie borne), prospects (aucune) ;
--   support      un salon par compte, entre lui et l'editeur : la ligne directe.
--
-- L'EDITEUR EST UN COMPTE, pas un reglage : celui qui porte `editeur`. Ses
-- membres voient tous les salons de support, ecrivent dans les annonces, et
-- portent la marque dans la communaute.
ALTER TABLE compte ADD COLUMN IF NOT EXISTS editeur BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE salon ALTER COLUMN compte_id DROP NOT NULL;
ALTER TABLE salon ADD COLUMN IF NOT EXISTS portee TEXT NOT NULL DEFAULT 'compte';
ALTER TABLE salon ADD COLUMN IF NOT EXISTS groupe TEXT;
ALTER TABLE salon DROP CONSTRAINT IF EXISTS salon_portee_check;
ALTER TABLE salon ADD CONSTRAINT salon_portee_check CHECK (
  portee IN ('compte', 'support', 'annonces', 'communaute')
  AND (portee IN ('compte', 'support')) = (compte_id IS NOT NULL)
  AND (groupe IS NULL OR groupe IN ('tous', 'proprietaires', 'prospects')));
-- Deux NULL ne sont pas egaux pour UNIQUE (compte_id, nom) : les salons de la
-- plateforme ont leur propre unicite.
CREATE UNIQUE INDEX IF NOT EXISTS i_salon_plateforme ON salon (nom) WHERE compte_id IS NULL;

-- LE SAV EST PRIVE, UNE CONVERSATION PAR PERSONNE. Il etait un salon par
-- compte, que toute l'equipe lisait ; on n'y confiait donc rien de personnel.
-- Il suit desormais la personne (`utilisateur_id`) ; `compte_id` garde le
-- compte ou il a ete ouvert, pour que l'editeur sache qui lui ecrit. Les
-- anciens salons par compte partent s'ils sont vides, s'archivent sinon.
ALTER TABLE salon ADD COLUMN IF NOT EXISTS utilisateur_id BIGINT REFERENCES utilisateur(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS i_salon_support;
CREATE UNIQUE INDEX IF NOT EXISTS i_salon_sav ON salon (utilisateur_id) WHERE portee = 'support';
DELETE FROM salon s WHERE s.portee = 'support' AND s.utilisateur_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM message m WHERE m.salon_id = s.id);
UPDATE salon SET archive_le = now()
 WHERE portee = 'support' AND utilisateur_id IS NULL AND archive_le IS NULL;

-- LES SALONS DE COMMUNAUTE RENOMMES SUR PLACE, pour garder leurs messages :
-- #entrepreneurs devient #futurs-redboxers, #proprietaires #redboxers ;
-- #prospects, que personne n'animait, s'archive. Un doublon vide cree entre
-- le deploiement et cette migration s'efface d'abord. Les cles de groupe
-- (`proprietaires`, `prospects`) ne changent pas : on ne les voit nulle part.
DELETE FROM salon n WHERE n.compte_id IS NULL
   AND ((n.nom = 'futurs-redboxers' AND EXISTS (SELECT 1 FROM salon o WHERE o.compte_id IS NULL AND o.nom = 'entrepreneurs'))
     OR (n.nom = 'redboxers'        AND EXISTS (SELECT 1 FROM salon o WHERE o.compte_id IS NULL AND o.nom = 'proprietaires')))
   AND NOT EXISTS (SELECT 1 FROM message m WHERE m.salon_id = n.id);
UPDATE salon SET nom = 'futurs-redboxers',
                 sujet = 'Pas encore de RedBox ? Posez vos questions, les redboxers répondent'
 WHERE compte_id IS NULL AND nom = 'entrepreneurs';
UPDATE salon SET nom = 'redboxers',
                 sujet = 'Entre redboxers : ce qui marche, ce qui casse, ce qui se vend'
 WHERE compte_id IS NULL AND nom = 'proprietaires';
UPDATE salon SET archive_le = now()
 WHERE compte_id IS NULL AND nom = 'prospects' AND archive_le IS NULL;

-- LE PROFIL, CE QU'ON MONTRE DE SOI AUX AUTRES EXPLOITANTS. Le pseudo passe
-- devant le nom dans la communaute ; le nom reste ce que l'equipe voit. Un
-- profil ferme ne montre que le pseudo et le grade.
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS pseudo        TEXT;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS bio           TEXT;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS ville         TEXT;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS couleur       TEXT;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS profil_public BOOLEAN NOT NULL DEFAULT true;

-- LES BADGES. Les regles vivent dans le code (lib/communaute.ts) et sont
-- reevaluees quand on ouvre la communaute ; la table ne garde que ce qui a
-- ete obtenu, et quand — un badge ne se perd pas, meme si la regle cesse
-- d'etre vraie. `vu_le` fait le « nouveau ! » sur le profil.
CREATE TABLE IF NOT EXISTS badge_obtenu (
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  badge          TEXT NOT NULL,
  obtenu_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  vu_le          TIMESTAMPTZ,
  PRIMARY KEY (utilisateur_id, badge)
);

-- Les annonces de l'editeur se poussent sur le telephone, a part des messages.
ALTER TABLE abonnement_push ADD COLUMN IF NOT EXISTS annonces BOOLEAN NOT NULL DEFAULT true;

-- QUI LIT UN SALON D'EQUIPE.
--
-- Sans ligne ici, tout le compte — c'est le cas ordinaire, et c'est ce que
-- font « general » et les salons des bornes. Des lignes, et le salon ne se
-- montre qu'a ces personnes-la : les associes qui parlent chiffres, la tournee
-- du samedi. Meme idee que `acces_borne` : aucune ligne veut dire tout le monde.
CREATE TABLE IF NOT EXISTS salon_membre (
  salon_id       BIGINT NOT NULL REFERENCES salon(id) ON DELETE CASCADE,
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  PRIMARY KEY (salon_id, utilisateur_id)
);

-- LES REACTIONS.
--
-- Un pouce sous un message coute moins qu'une phrase, et dit la meme chose :
-- « lu, et d'accord ». Dans une communaute d'exploitants qui se croisent peu,
-- c'est le geste le plus frequent qu'on puisse offrir.
--
-- Une personne, un emoji, un message : la cle primaire dit qu'on ne peut pas
-- applaudir deux fois. Reappuyer retire — c'est un interrupteur, pas un
-- compteur. On ne reagit pas a soi-meme : la regle est en code, la ou elle se
-- lit, plutot qu'en contrainte qui demanderait une jointure a chaque insertion.
CREATE TABLE IF NOT EXISTS reaction (
  message_id     BIGINT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  utilisateur_id BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  emoji          TEXT NOT NULL,
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, utilisateur_id, emoji)
);
CREATE INDEX IF NOT EXISTS reaction_message ON reaction(message_id);

-- « Pilier de comptoir » (cent messages) s'appelle desormais « Bavard », et
-- « Pilier de la commu » est un autre badge, a deux mille. La cle `pilier`
-- n'est plus jamais posee par le code : ce renommage se rejoue sans effet.
-- Un badge ne se perd pas — il change de nom, avec sa date d'obtention.
UPDATE badge_obtenu o SET badge = 'bavard'
 WHERE o.badge = 'pilier'
   AND NOT EXISTS (SELECT 1 FROM badge_obtenu x
                    WHERE x.utilisateur_id = o.utilisateur_id AND x.badge = 'bavard');
DELETE FROM badge_obtenu WHERE badge = 'pilier';

-- La communaute se pousse aussi sur le telephone : une reaction a ses messages,
-- un badge debloque. A part des messages : on peut vouloir savoir qu'on vous a
-- applaudi sans vouloir chaque phrase de #entrepreneurs.
ALTER TABLE abonnement_push ADD COLUMN IF NOT EXISTS communaute BOOLEAN NOT NULL DEFAULT true;

-- LE BADGE DE BIENVENUE. Offert a l'inscription ; ceux qui etaient deja la le
-- recoivent aussi, date du jour de LEUR inscription — c'est ce qu'il celebre.
-- Les personnes inventees par la demo n'en ont pas : elles ne sont pas de la
-- communaute. Se rejoue sans effet.
INSERT INTO badge_obtenu (utilisateur_id, badge, obtenu_le)
SELECT u.id, 'newbie', u.cree_le FROM utilisateur u
 WHERE u.email NOT LIKE '%@redbox.invalid'
ON CONFLICT DO NOTHING;
