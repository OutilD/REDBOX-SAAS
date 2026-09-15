import { q, q1 } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/parc/supprimer — efface une machine enregistree par erreur.
 * Jamais une machine appairee, jamais une machine qui a vendu : celles-la ont
 * une histoire, et l'histoire ne s'efface pas — on desappaire.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();
  const id = Number(f.get("id"));
  if (!Number.isInteger(id)) return versPage(req, "/admin");

  const b = await q1<{ jeton: string | null; ventes: number }>(`
    SELECT b.jeton, (SELECT COUNT(*) FROM vente v WHERE v.borne_id = b.id)::int AS ventes
      FROM borne b WHERE b.id = $1`, [id]);
  if (!b) return versPage(req, "/admin");
  if (b.jeton) return versPage(req, `/admin?e=appairee#m${id}`);
  if (b.ventes > 0) return versPage(req, `/admin?e=vendue#m${id}`);
  await q("DELETE FROM borne WHERE id = $1", [id]);
  return versPage(req, "/admin?ok=effacee");
}
