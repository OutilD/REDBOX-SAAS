import { utilisateurDe, versPage } from "@/lib/auth";
import { apercuDe, leconDe, lecteur, marquerFinie, ouverte } from "@/lib/academie";

export const dynamic = "force-dynamic";

/**
 * POST /api/academie/suivi — terminer une lecon, ou revenir dessus.
 *
 * Terminee, on part sur la suivante : c'est le geste qu'on attend en bas d'une
 * lecon, et le seul qui tienne sans JavaScript. La derniere du module ramene
 * au module, qui dit ce qui reste.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const id = Number(f.get("lecon_id"));
  const fini = String(f.get("fini")) === "1";
  const suite = Number(f.get("suite"));
  const l = await lecteur(u, apercuDe(req));
  const lecon = await leconDe(l, id);
  if (!lecon || !ouverte(l, lecon.module_acces, lecon.acces)) return versPage(req, "/academie");
  if (!l.apercu) await marquerFinie(u.id, id, fini);
  if (!fini) return versPage(req, `/academie/lecon/${id}`);
  return versPage(req, Number.isInteger(suite) && suite > 0
    ? `/academie/lecon/${suite}`
    : `/academie/module/${lecon.module_id}?fini=1`);
}
