import { q } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { BADGES_MANUELS } from "@/lib/communaute";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/badge — remettre ou reprendre un badge que la console ne peut
 * pas prouver (« J'y etais »). Seulement ceux-la : un badge merite par des faits
 * reviendrait a la prochaine evaluation, le retirer ici ne servirait a rien.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();
  const id = Number(f.get("utilisateur_id"));
  const badge = String(f.get("badge") ?? "");
  const valeur = String(f.get("valeur")) === "1";
  const retour = `/admin/comptes#c${Number(f.get("compte_id")) || ""}`;
  if (!Number.isInteger(id) || !BADGES_MANUELS.some((b) => b.cle === badge)) return versPage(req, retour);
  if (valeur) {
    await q("INSERT INTO badge_obtenu (utilisateur_id, badge) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, badge]);
  } else {
    await q("DELETE FROM badge_obtenu WHERE utilisateur_id = $1 AND badge = $2", [id, badge]);
  }
  return versPage(req, retour);
}
