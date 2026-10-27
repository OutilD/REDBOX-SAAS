import { q } from "@/db";
import { peutCharger, utilisateurDe, versPage } from "@/lib/auth";
import { champ } from "@/lib/academie";
import { CONTACT_MAX, NOM_MAX, NOTE_MAX, VILLE_MAX, estEtape } from "@/lib/crm";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm — ajouter, modifier, deplacer, effacer un lieu du CRM.
 *
 * Toujours dans le compte de la session : un identifiant d'un autre compte ne
 * touche a rien. Un membre en lecture seule regarde le tableau, il n'y ecrit pas.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutCharger(u)) return versPage(req, "/prospection?e=lecture");
  const f = await req.formData();
  const action = String(f.get("action") ?? "");
  const id = Number(f.get("id"));
  const brut = String(f.get("etape") ?? "");
  const etape = estEtape(brut) ? brut : null;
  const nom = champ(f, "nom", NOM_MAX);

  if (action === "creer") {
    if (!nom) return versPage(req, "/prospection?e=nom");
    await q(`
      INSERT INTO crm_lieu (compte_id, cree_par, nom, ville, contact, note, etape)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [u.compte_id, u.id, nom, champ(f, "ville", VILLE_MAX), champ(f, "contact", CONTACT_MAX),
       champ(f, "note", NOTE_MAX), etape ?? "a_contacter"]);
    return versPage(req, "/prospection");
  }
  if (!Number.isInteger(id)) return versPage(req, "/prospection");

  if (action === "deplacer" && etape) {
    await q("UPDATE crm_lieu SET etape = $3, modifie_le = now() WHERE id = $1 AND compte_id = $2",
            [id, u.compte_id, etape]);
  } else if (action === "maj") {
    if (!nom) return versPage(req, `/prospection?e=nom#l${id}`);
    await q(`
      UPDATE crm_lieu SET nom = $3, ville = $4, contact = $5, note = $6,
                          etape = COALESCE($7, etape), modifie_le = now()
       WHERE id = $1 AND compte_id = $2`,
      [id, u.compte_id, nom, champ(f, "ville", VILLE_MAX), champ(f, "contact", CONTACT_MAX),
       champ(f, "note", NOTE_MAX), etape]);
  } else if (action === "supprimer") {
    await q("DELETE FROM crm_lieu WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  }
  return versPage(req, "/prospection");
}
