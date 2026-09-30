import { q } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { FORMES_DEFI, mesureValide } from "@/lib/defis";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/communaute/defis   action=creer (titre, mesure, objectif, debut, fin, forme, points)
 *                               action=retirer (id)
 *
 * Reserve a l'equipe RedBox (compte editeur ou super-admin). Retirer un defi
 * retire aussi ses trophees : c'est pour corriger une erreur, pas pour clore.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!u.editeur && !estSuperAdmin(u)) return versPage(req, "/communaute/defis");
  const f = await req.formData();

  if (f.get("action") === "retirer") {
    const id = Number(f.get("id"));
    if (Number.isInteger(id)) await q("DELETE FROM defi WHERE id = $1", [id]);
    return versPage(req, "/communaute/defis?ok=retire");
  }

  const titre = String(f.get("titre") ?? "").trim().slice(0, 80);
  const mesure = f.get("mesure");
  const objectif = Math.round(Number(f.get("objectif")));
  const debut = String(f.get("debut") ?? ""), fin = String(f.get("fin") ?? "");
  const forme = String(f.get("forme") ?? "trophee");
  const points = Math.max(0, Math.min(1000, Math.round(Number(f.get("points") ?? 150)) || 0));
  if (!titre || !mesureValide(mesure) || !Number.isInteger(objectif) || objectif < 1
      || !DATE.test(debut) || !DATE.test(fin)) {
    return versPage(req, "/communaute/defis?e=champs");
  }
  if (fin < debut) return versPage(req, "/communaute/defis?e=dates");
  await q(`
    INSERT INTO defi (titre, mesure, objectif, debut, fin, forme, points, cree_par)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [titre, mesure, objectif, debut, fin,
     (FORMES_DEFI as string[]).includes(forme) ? forme : "trophee", points, u.id]);
  return versPage(req, "/communaute/defis?ok=cree");
}
