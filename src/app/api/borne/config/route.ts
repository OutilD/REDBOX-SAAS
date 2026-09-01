import { q } from "@/db";
import { catalogueDe, empreinte, parJeton, RYTHME_CALME, RYTHME_VIF } from "@/lib/borne";
import { empreintePub, pubVide, visuelsPour } from "@/lib/pub";
import { illustrationsDe } from "@/lib/illustration";

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
  // Tout ce que la borne doit recevoir se lit d'un seul elan. L'horodatage de
  // passage part avec le reste : il n'interesse personne dans cette reponse.
  const [, catalogue, visuels, pubDeserte, illustrations, transferts] = await Promise.all([
    q("UPDATE borne SET vue_le = now() WHERE id = $1", [borne.id]),

    catalogueDe(borne.compte_id!, borne.id),

    // La publicite voyage a part : elle change a un tout autre rythme que le
    // catalogue, et une affiche qui expire ne doit pas forcer la machine a
    // reconstruire son inventaire. Sa propre empreinte, donc.
    visuelsPour(borne.compte_id!, borne.id),

    // Un compte sans la moindre playlist n'a rien a dicter. On le dit franchement
    // a la borne : elle proposera alors CE QU'ELLE PORTE, et le SaaS l'adoptera.
    // Une machine qui change de mains arrive chargee ; refaire douze affiches a
    // la main serait absurde.
    pubVide(borne.compte_id!),

    // Ce que la machine doit montrer a la place de ses animations dessinees.
    // Une liste vide veut dire « garde les tiennes ».
    illustrationsDe(borne.compte_id!),

    q(`SELECT m.id, m.lane, m.quantite, p.sku, p.nom
         FROM mouvement m JOIN produit p ON p.id = m.produit_id
        WHERE m.vers_lieu_id = $1 AND m.motif = 'transfert'
          AND m.confirme_le IS NULL AND m.annule_le IS NULL
        ORDER BY m.id`, [borne.lieu_id]),
  ]);

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
    pub: { version: empreintePub(visuels), vide: pubDeserte, visuels },
    ecrans: illustrations,
    transferts,
    prochain_appel_s: transferts.length > 0 ? RYTHME_VIF : RYTHME_CALME,
  });
}
