import { q } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { SQL_VRAIE } from "@/lib/parc";
import { nomAffiche } from "@/lib/personnes";
import { donnerOrdre, empechementMiseAJour } from "@/lib/ordres";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/parc/mise-a-jour
 *
 * Donne l'ordre `mise_a_jour` a toutes les vraies machines qui peuvent le
 * recevoir (5.17 ou plus, proprietaires de l'appareil, en retard sur l'APK
 * publie). Chacune l'installe a son rythme, quand elle est au repos.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");

  const bornes = await q<{ id: number; jeton: string | null; version: string | null;
                           sante: { proprietaire?: unknown } | null }>(`
    SELECT b.id, b.jeton, b.version, b.sante FROM borne b
     WHERE ${SQL_VRAIE} AND b.jeton IS NOT NULL`);

  let n = 0;
  for (const b of bornes) {
    if (empechementMiseAJour(b)) continue;
    const ordre = await donnerOrdre(b.id, "mise_a_jour", { id: u.id, nom: nomAffiche(u) });
    if (ordre === null) continue;
    await reveiller(b.id, "mise à jour de l’application");
    n++;
  }
  return versPage(req, `/admin/parc?ok=maj&n=${n}#versions`);
}
