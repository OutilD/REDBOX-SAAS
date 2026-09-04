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
  lane        INTEGER,
  produit_id  BIGINT REFERENCES produit(id) ON DELETE SET NULL,
  prix_c      INTEGER NOT NULL,
  statut      TEXT NOT NULL CHECK (statut IN ('distribue','non_distribue','litige')),
  faite_le    TIMESTAMPTZ NOT NULL,
  traite_le   TIMESTAMPTZ,
  traite_par  TEXT,
  note        TEXT,
  UNIQUE (borne_id, commande_id, lane)   -- la remontee est rejouable sans doublon
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
-- Il vit sur le COMPTE et non sur la borne : c'est le meme exploitant qui
-- repond pour toutes ses machines. Une borne qui aurait besoin du sien pourra
-- l'obtenir plus tard sans defaire celui-ci.
ALTER TABLE compte ADD COLUMN IF NOT EXISTS sav_tel   TEXT;
ALTER TABLE compte ADD COLUMN IF NOT EXISTS sav_texte TEXT;

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
