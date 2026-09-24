import { q1 } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { poserObjectif } from "@/lib/objectif";

export const dynamic = "force-dynamic";

/** POST /api/objectif — poser, changer ou retirer l'objectif du mois (compte, ou une RedBox). */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const retour = String(f.get("retour") ?? "/").startsWith("/") ? String(f.get("retour")) : "/";
  if (!peutConfigurer(u) || u.bornes !== null) return versPage(req, retour);
  const borne = Number(f.get("borne_id")) || null;
  if (borne && !(await q1("SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [borne, u.compte_id]))) return versPage(req, retour);
  const brut = String(f.get("montant") ?? "").replace(/[^\d,.]/g, "").replace(",", ".");
  // Un objectif se dit en euros ronds : « 1 200 », pas « 1 200,37 ». Vide : on le
  // retire. Pas `centimes()` : son plafond est celui d'un prix de produit,
  // mille euros — un objectif de mois le depasse des la deuxieme machine.
  const euros = brut === "" ? NaN : Math.round(parseFloat(brut));
  const montant = Number.isFinite(euros) && euros > 0 ? Math.min(euros, 10_000_000) * 100 : null;
  await poserObjectif(u.compte_id, borne, montant);
  return versPage(req, `${retour}${retour.includes("?") ? "&" : "?"}fait=${montant ? "objectif" : "objectif_retire"}`);
}
