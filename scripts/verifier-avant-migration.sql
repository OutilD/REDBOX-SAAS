-- A passer AVANT `npm run migrate`, a la main, sur la connexion directe.
-- LECTURE SEULE : rien n'est ecrit, aucun SET.
--
--   psql "$DATABASE_URL_UNPOOLED" -f scripts/verifier-avant-migration.sql
--
-- Si la contrainte manque et qu'il reste des doublons, la migration echouera
-- en posant `vente_unicite` (et sera annulee en entier) : traiter les doublons
-- d'abord, sans effacer de vente sans savoir laquelle est la bonne.
BEGIN READ ONLY;

-- 1. La contrainte est-elle deja la ? (une ligne = oui ; alors 2 et 3 sont informatifs)
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint WHERE conname = 'vente_unicite';

-- 2. Doublons sans canal, par commande.
SELECT borne_id, commande_id, count(*)
  FROM vente WHERE lane IS NULL
 GROUP BY 1, 2 HAVING count(*) > 1;

-- 3. Ce qui bloquerait vraiment la contrainte (NULLS NOT DISTINCT, avec le rang).
SELECT borne_id, commande_id, lane, article, count(*)
  FROM vente
 GROUP BY 1, 2, 3, 4 HAVING count(*) > 1;

ROLLBACK;
