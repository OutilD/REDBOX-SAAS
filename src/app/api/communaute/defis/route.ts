import { q } from "@/db";
import { estSuperAdmin, peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { FORMES_DEFI, mesureValide } from "@/lib/defis";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Une vraie date du calendrier : le 2026-02-30 a la bonne forme, pas le bon jour. */
function dateValide(s: string): boolean {
  if (!DATE.test(s)) return false;
  const [a, m, j] = s.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

const OBJECTIF_MAX = 1_000_000;

/**
 * POST /api/communaute/defis   action=creer (titre, mesure, objectif, debut, fin, forme, points)
 *                               action=retirer (id)
 *
 * Reserve a l'equipe RedBox (compte editeur ou super-admin). Retirer un defi
 * retire aussi ses trophees de la vue : c'est pour corriger une erreur, pas pour
 * clore. Rien ne s'efface, les reussites restent en base.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  // Un membre « lecture » du compte editeur regarde les defis, il n'en pose pas.
  if (!estSuperAdmin(u) && !(u.editeur && peutConfigurer(u))) return versPage(req, "/communaute/defis");
  const f = await req.formData();

  if (f.get("action") === "retirer") {
    const id = Number(f.get("id"));
    if (Number.isInteger(id)) await q("UPDATE defi SET retire_le = now() WHERE id = $1 AND retire_le IS NULL", [id]);
    return versPage(req, "/communaute/defis?ok=retire");
  }

  const titre = String(f.get("titre") ?? "").trim().slice(0, 80);
  const mesure = f.get("mesure");
  const objectif = Math.round(Number(f.get("objectif")));
  const debut = String(f.get("debut") ?? ""), fin = String(f.get("fin") ?? "");
  const forme = String(f.get("forme") ?? "trophee");
  const points = Math.max(0, Math.min(1000, Math.round(Number(f.get("points") ?? 150)) || 0));
  if (!titre || !mesureValide(mesure) || !Number.isInteger(objectif) || objectif < 1 || objectif > OBJECTIF_MAX
      || !dateValide(debut) || !dateValide(fin)) {
    return versPage(req, "/communaute/defis?e=champs");
  }
  if (fin < debut) return versPage(req, "/communaute/defis?e=dates");
  // Ce que la base refuse encore (une contrainte) revient au formulaire, pas en page d'erreur.
  try {
    await q(`
      INSERT INTO defi (titre, mesure, objectif, debut, fin, forme, points, cree_par)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [titre, mesure, objectif, debut, fin,
       (FORMES_DEFI as string[]).includes(forme) ? forme : "trophee", points, u.id]);
  } catch {
    return versPage(req, "/communaute/defis?e=champs");
  }
  return versPage(req, "/communaute/defis?ok=cree");
}
