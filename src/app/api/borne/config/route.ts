import { q } from "@/db";
import { catalogueDe, empreinte, parJeton, RYTHME_CALME, RYTHME_VIF } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * GET /api/borne/config   (Bearer jeton)
 *
 * Tout ce que la borne doit savoir pour vendre : son catalogue complet
 * — categories dans l'ordre, produits, planogramme — et les transferts qu'elle
 * doit encore appliquer.
 *
 * LE CATALOGUE EST LA VERITE DU SAAS. La borne ne decide plus de ce qu'elle
 * vend : elle recoit la liste, la garde, et s'en sert meme hors ligne. Une
 * categorie ajoutee ici apparait sur la machine a sa prochaine synchronisation.
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

  // Le catalogue et son empreinte se calculent dans @/lib/borne : les pages du
  // SaaS lisent la meme fonction pour dire si une borne est a jour.
  const catalogue = await catalogueDe(borne.compte_id!, borne.id);

  const transferts = await q(`
    SELECT m.id, m.lane, m.quantite, p.sku, p.nom
      FROM mouvement m JOIN produit p ON p.id = m.produit_id
     WHERE m.vers_lieu_id = $1 AND m.motif = 'transfert'
       AND m.confirme_le IS NULL AND m.annule_le IS NULL
     ORDER BY m.id`, [borne.lieu_id]);

  // L'empreinte evite le travail inutile : la borne ne reconstruit son inventaire
  // que lorsqu'elle change, au lieu de tout refaire toutes les trente secondes.
  //
  // Un compte tout neuf n'a rien a dicter. On le dit franchement a la borne :
  // elle enverra alors SON catalogue au prochain releve, et le SaaS l'adoptera.
  // Une machine arrive chargee ; ressaisir onze produits a la main serait absurde.
  const vide = catalogue.produits.length === 0;
  const version = empreinte(catalogue);

  return Response.json({
    borne: { id: borne.id, nom: borne.nom, adresse: borne.adresse },
    catalogue: { version, vide, ...catalogue },
    transferts,
    prochain_appel_s: transferts.length > 0 ? RYTHME_VIF : RYTHME_CALME,
  });
}
