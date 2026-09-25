import { transaction } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { appliquerVitrine, quitterVitrine, refusVitrine, reglageDuFormulaire } from "@/lib/vitrine";

export const dynamic = "force-dynamic";
// Trois mois de ventes s'inventent en quelques secondes ; une annee, davantage.
export const maxDuration = 60;

/**
 * POST /api/admin/vitrine — faire d'un compte la vitrine et (re)inventer son
 * histoire d'apres le reglage, ou le rendre ordinaire (`action=quitter`).
 * Dans les deux cas, ce que le compte contenait est efface.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();

  // Le compte dont les demos reprennent le catalogue ; 0, le catalogue integre.
  if (String(f.get("action")) === "modele") {
    const id = Number(f.get("modele_id"));
    await transaction(async (c) => {
      await c.query("UPDATE compte SET catalogue_modele = false WHERE catalogue_modele");
      if (Number.isInteger(id) && id > 0) {
        await c.query("UPDATE compte SET catalogue_modele = true WHERE id = $1 AND NOT demo AND NOT vitrine", [id]);
      }
    });
    return versPage(req, "/admin/vitrine?fait=catalogue_modele");
  }

  const compte_id = Number(f.get("compte_id"));
  if (!Number.isInteger(compte_id) || compte_id <= 0) return versPage(req, "/admin/vitrine?e=compte");

  if (String(f.get("action")) === "quitter") {
    await quitterVitrine(compte_id);
    return versPage(req, "/admin/vitrine?fait=vitrine_quittee");
  }

  const r = reglageDuFormulaire(f);
  if (typeof r === "string") return versPage(req, `/admin/vitrine?e=${r}`);
  const refus = await refusVitrine(compte_id);
  if (refus) return versPage(req, `/admin/vitrine?e=${refus}`);
  const res = await appliquerVitrine(compte_id, r, u.email);
  return versPage(req, `/admin/vitrine?fait=vitrine&ca=${res.ca_c}&n=${res.ventes}&manque=${res.manque_c}`);
}
