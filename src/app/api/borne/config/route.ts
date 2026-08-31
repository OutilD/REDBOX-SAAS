import { q } from "@/db";
import { parJeton, RYTHME_CALME, RYTHME_VIF } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * GET /api/borne/config   (Bearer jeton)
 *
 * Ce que la borne doit savoir pour vendre, et ce qu'elle doit charger.
 *
 * Les transferts sont des ECARTS (« +4 sur le canal 3 »), pas des valeurs
 * absolues : le compteur de la machine reste le sien, on ne le remplace pas par
 * un chiffre calcule ici qui aurait vieilli entre-temps. L'idempotence tient a
 * l'identifiant, que la borne retient une fois applique.
 */
export async function GET(req: Request) {
  const borne = await parJeton(req.headers);
  if (!borne) return Response.json({ erreur: "jeton invalide" }, { status: 401 });
  await q("UPDATE borne SET vue_le = now() WHERE id = $1", [borne.id]);

  const planogramme = await q(`
    SELECT c.lane, c.rangee, c.colonne, c.capacite, c.seuil_bas,
           p.sku, p.nom, COALESCE(cat.nom, 'divers') AS categorie,
           cat.ordre AS categorie_ordre,
           p.prix_vente_c AS prix_centimes, p.age_min
      FROM canal c
      LEFT JOIN produit p   ON p.id = c.produit_id
      LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE c.borne_id = $1
     ORDER BY c.lane`, [borne.id]);

  const transferts = await q(`
    SELECT m.id, m.lane, m.quantite, p.sku, p.nom
      FROM mouvement m JOIN produit p ON p.id = m.produit_id
     WHERE m.vers_lieu_id = $1 AND m.motif = 'transfert'
       AND m.confirme_le IS NULL AND m.annule_le IS NULL
     ORDER BY m.id`, [borne.lieu_id]);

  return Response.json({
    borne: { id: borne.id, nom: borne.nom, adresse: borne.adresse },
    planogramme,
    transferts,
    prochain_appel_s: transferts.length > 0 ? RYTHME_VIF : RYTHME_CALME,
  });
}
