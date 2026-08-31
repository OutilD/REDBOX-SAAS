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
                 ('reception','transfert','vente','perte','retour','inventaire')),
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
