import { q } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { badgeDe } from "@/lib/communaute";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/badge — remettre ou reprendre un badge, n'importe lequel,
 * que les objectifs soient atteints ou non : « J'y etais », qu'aucun fait de
 * la console ne prouve, mais aussi un palier de ventes offert en avance.
 *
 * Reprendre un badge que les faits meritent ne dure pas : la prochaine
 * evaluation le rend. Seuls ceux qu'on a donnes en avance, ou a la main,
 * disparaissent pour de bon.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();
  const id = Number(f.get("utilisateur_id"));
  const badge = String(f.get("badge") ?? "");
  const valeur = String(f.get("valeur")) === "1";
  // On revient d'ou l'on vient — la page des badges de la personne, ou la liste
  // des comptes —, jamais ailleurs : une adresse libre ferait de cette route un
  // redirecteur ouvert.
  const demande = String(f.get("retour") ?? "");
  const retour = /^\/admin\/comptes(\/badges\/\d+)?$/.test(demande)
    ? demande : `/admin/comptes#c${Number(f.get("compte_id")) || ""}`;
  if (!Number.isInteger(id) || !badgeDe(badge)) return versPage(req, retour);
  if (valeur) {
    await q("INSERT INTO badge_obtenu (utilisateur_id, badge) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, badge]);
  } else {
    await q("DELETE FROM badge_obtenu WHERE utilisateur_id = $1 AND badge = $2", [id, badge]);
  }
  // Le bandeau dit ce qui vient d'arriver, et a quel badge.
  if (retour.startsWith("/admin/comptes/badges/")) {
    return versPage(req, `${retour}?fait=${valeur ? "badge_donne" : "badge_repris"}#b-${badge}`);
  }
  return versPage(req, retour);
}
