import { q1, transaction, type PgClient } from "@/db";
import { parJeton, RYTHME_CALME, RYTHME_VIF } from "@/lib/borne";

export const dynamic = "force-dynamic";

/** Ce que la borne propose quand le compte n'a encore aucun catalogue. */
type CatalogueLocal = {
  categories?: { nom: string; ordre?: number }[];
  produits?: { sku: string; nom: string; categorie?: string | null;
               prix_centimes?: number; age_min?: number; capteur_fiable?: boolean }[];
  planogramme?: { lane: number; rangee?: number; colonne?: number;
                  sku?: string | null; capacite?: number; seuil_bas?: number;
                  quantite?: number }[];
};

type Releve = {
  version?: string;
  catalogue_version?: string;
  sante?: unknown;
  catalogue_local?: CatalogueLocal;
  canaux?: { lane: number; sku?: string | null; quantite: number; capacite?: number }[];
  ventes?: { commande_id: string; lane?: number | null; sku?: string | null;
             prix_centimes: number; statut: string; faite_le: string }[];
  transferts_appliques?: number[];
};

const STATUTS = new Set(["distribue", "non_distribue", "litige"]);

/**
 * POST /api/borne/etat   (Bearer jeton)
 *
 * Le releve periodique. Quatre regles le gouvernent :
 *
 *  1. LA BORNE A RAISON sur les quantites. On recopie ses compteurs, on n'ecrase
 *     jamais les siens avec les notres.
 *  2. LA REMONTEE EST REJOUABLE. Une machine qui a perdu le reseau renvoie son
 *     lot entier ; la cle (borne, commande, canal) absorbe les doublons, et le
 *     mouvement de vente est rattache a la vente pour ne jamais compter deux fois.
 *  3. UN TRANSFERT N'EST CONFIRME QUE PAR LA MACHINE. Tant qu'elle ne l'a pas
 *     acquitte, la marchandise est « en route » et reste visible.
 *  4. TOUT OU RIEN. Une seule transaction : un releve a moitie enregistre ferait
 *     mentir le stock sans que personne puisse dire ou.
 */
export async function POST(req: Request) {
  const borne = await parJeton(req.headers);
  if (!borne) return Response.json({ erreur: "jeton invalide" }, { status: 401 });

  let r: Releve;
  try { r = await req.json(); }
  catch { return Response.json({ erreur: "corps illisible" }, { status: 400 }); }

  const bilan = await transaction(async (c) => {
    await c.query(
      `UPDATE borne SET vue_le = now(), version = COALESCE($1, version),
              catalogue_version = COALESCE($4, catalogue_version), sante = $2
        WHERE id = $3`,
      [r.version ?? null, r.sante ? JSON.stringify(r.sante) : null, borne.id,
       r.catalogue_version ?? null]);

    // 0. Adoption du catalogue de la machine.
    //
    //    Seulement si le compte n'a RIEN — la garde est dans la transaction, donc
    //    deux bornes qui se synchronisent en meme temps ne peuvent pas importer
    //    deux fois. Passe ce moment, c'est le SaaS qui dicte : une machine ne
    //    reecrit jamais un catalogue que quelqu'un a compose.
    let adopte = 0;
    if (r.catalogue_local && borne.compte_id && borne.lieu_id) {
      const combien = await c.query<{ n: number }>(
        "SELECT COUNT(*)::int n FROM produit WHERE compte_id = $1", [borne.compte_id]);
      if (combien.rows[0].n === 0) {
        adopte = await adopter(c, borne.compte_id, borne.id, borne.lieu_id, r.catalogue_local);
      }
    }

    // 1. Acquittements d'abord : le releve qui suit est deja celui d'apres
    //    chargement, et on ne veut pas le lire comme un ecart inexplique.
    let confirmes = 0;
    const ids = (r.transferts_appliques ?? []).filter(Number.isInteger);
    if (ids.length > 0 && borne.lieu_id) {
      const u = await c.query(`
        UPDATE mouvement SET confirme_le = now()
         WHERE id = ANY($1::bigint[]) AND vers_lieu_id = $2
           AND motif = 'transfert' AND confirme_le IS NULL AND annule_le IS NULL`,
        [ids, borne.lieu_id]);
      confirmes = u.rowCount ?? 0;
    }

    // 2. Les compteurs de la machine.
    let canaux = 0;
    for (const ca of r.canaux ?? []) {
      if (!Number.isInteger(ca.lane) || !Number.isInteger(ca.quantite)) continue;
      const produit = ca.sku
        ? (await c.query<{ id: number }>(
            "SELECT id FROM produit WHERE compte_id = $1 AND sku = $2",
            [borne.compte_id, ca.sku])).rows[0]?.id ?? null
        : null;
      const maj = await c.query(`
        UPDATE canal SET quantite = $1,
                         produit_id = COALESCE($2, produit_id),
                         capacite = COALESCE($3, capacite),
                         releve_le = now()
         WHERE borne_id = $4 AND lane = $5`,
        [ca.quantite, produit, ca.capacite ?? null, borne.id, ca.lane]);
      if ((maj.rowCount ?? 0) === 0) {
        // Un canal apparu sur la machine : on l'enregistre plutot que de l'ignorer.
        await c.query(`
          INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, capacite, releve_le)
          VALUES ($1,$2,$3,$4,$5,$6,$7, now())`,
          [borne.id, ca.lane, Math.ceil(ca.lane / 10), ((ca.lane - 1) % 10) + 1,
           produit, ca.quantite, ca.capacite ?? 10]);
      }
      canaux++;
    }

    // 3. Les ventes. Le mouvement n'est cree que si la vente etait nouvelle :
    //    `RETURNING` ne rend rien quand le conflit a joue.
    let retenues = 0;
    for (const v of r.ventes ?? []) {
      if (!v.commande_id || !STATUTS.has(v.statut)) continue;
      const produit = v.sku
        ? (await c.query<{ id: number }>(
            "SELECT id FROM produit WHERE compte_id = $1 AND sku = $2",
            [borne.compte_id, v.sku])).rows[0]?.id ?? null
        : null;
      const ins = await c.query<{ id: number }>(`
        INSERT INTO vente (borne_id, commande_id, lane, produit_id, prix_c, statut, faite_le)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (borne_id, commande_id, lane) DO NOTHING
        RETURNING id`,
        [borne.id, v.commande_id, v.lane ?? null, produit,
         Math.max(0, Math.round(v.prix_centimes)), v.statut, v.faite_le]);
      if (ins.rowCount === 0) continue;
      retenues++;

      // Seule une distribution confirmee sort du stock. Un litige est un
      // probleme d'argent, pas de marchandise : elle est toujours dans la machine.
      if (v.statut === "distribue" && produit && borne.lieu_id) {
        await c.query(`
          INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, quantite, motif,
                                 lane, par, fait_le, confirme_le, vente_id)
          VALUES ($1,$2,$3,1,'vente',$4,'borne',$5,$5,$6)`,
          [borne.compte_id, produit, borne.lieu_id, v.lane ?? null, v.faite_le, ins.rows[0].id]);
      }
    }

    const attente = await c.query<{ n: number }>(`
      SELECT COUNT(*)::int n FROM mouvement
       WHERE vers_lieu_id = $1 AND motif = 'transfert'
         AND confirme_le IS NULL AND annule_le IS NULL`, [borne.lieu_id]);

    return { canaux, retenues, confirmes, adopte, attente: attente.rows[0].n };
  });

  return Response.json({
    ok: true,
    canaux: bilan.canaux,
    catalogue_adopte: bilan.adopte,
    ventes_retenues: bilan.retenues,
    transferts_confirmes: bilan.confirmes,
    transferts_en_attente: bilan.attente,
    prochain_appel_s: bilan.attente > 0 ? RYTHME_VIF : RYTHME_CALME,
  });
}

/**
 * Adopte le catalogue d'une borne dans un compte encore vierge.
 *
 * Le stock deja present dans la machine entre par un mouvement d'INVENTAIRE, pas
 * de reception : on ne connait pas son prix d'achat, et pretendre le contraire
 * fausserait la valeur du stock des le premier jour. C'est un solde d'ouverture,
 * et il se lit comme tel dans le grand livre.
 */
async function adopter(c: PgClient, compte_id: number, borne_id: number, lieu_id: number,
                       cat: CatalogueLocal): Promise<number> {
  const parNom = new Map<string, number>();
  let ordre = 10;
  for (const k of cat.categories ?? []) {
    const nom = String(k.nom ?? "").trim();
    if (!nom) continue;
    const r = await c.query<{ id: number }>(`
      INSERT INTO categorie (compte_id, nom, ordre) VALUES ($1,$2,$3)
      ON CONFLICT (compte_id, nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
      [compte_id, nom, k.ordre ?? ordre]);
    parNom.set(nom, r.rows[0].id);
    ordre += 10;
  }

  const parSku = new Map<string, number>();
  let n = 0;
  for (const p of cat.produits ?? []) {
    const sku = String(p.sku ?? "").trim().toUpperCase();
    const nom = String(p.nom ?? "").trim();
    if (!sku || !nom) continue;
    let cid = p.categorie ? parNom.get(p.categorie) ?? null : null;
    if (p.categorie && !cid) {
      const k = await c.query<{ id: number }>(`
        INSERT INTO categorie (compte_id, nom, ordre) VALUES ($1,$2,$3)
        ON CONFLICT (compte_id, nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
        [compte_id, p.categorie, ordre]);
      cid = k.rows[0].id; parNom.set(p.categorie, cid); ordre += 10;
    }
    const r = await c.query<{ id: number }>(`
      INSERT INTO produit (compte_id, sku, nom, categorie_id, prix_vente_c, age_min, capteur_fiable)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (compte_id, sku) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
      [compte_id, sku, nom, cid, Math.max(0, Math.round(p.prix_centimes ?? 0)),
       p.age_min ?? 0, p.capteur_fiable ?? true]);
    parSku.set(sku, r.rows[0].id);
    n++;
  }

  for (const ca of cat.planogramme ?? []) {
    if (!Number.isInteger(ca.lane)) continue;
    const pid = ca.sku ? parSku.get(String(ca.sku).toUpperCase()) ?? null : null;
    await c.query(`
      INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, capacite, seuil_bas, releve_le)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
      ON CONFLICT (borne_id, lane) DO UPDATE
        SET produit_id = EXCLUDED.produit_id, capacite = EXCLUDED.capacite,
            seuil_bas = EXCLUDED.seuil_bas, quantite = EXCLUDED.quantite, releve_le = now()`,
      [borne_id, ca.lane, ca.rangee ?? Math.ceil(ca.lane / 10),
       ca.colonne ?? ((ca.lane - 1) % 10) + 1, pid,
       Math.max(0, ca.quantite ?? 0), ca.capacite ?? 10, ca.seuil_bas ?? 2]);

    // Le stock deja en machine devient un solde d'ouverture.
    if (pid && (ca.quantite ?? 0) > 0) {
      await c.query(`
        INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                               motif, lane, note, par, fait_le, confirme_le)
        VALUES ($1,$2,NULL,$3,$4,'inventaire',$5,'solde d’ouverture — stock trouvé dans la machine',
                'borne', now(), now())`,
        [compte_id, pid, lieu_id, ca.quantite, ca.lane]);
    }
  }
  return n;
}
