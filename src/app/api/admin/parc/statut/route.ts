import { q } from "@/db";
import { estSuperAdmin, utilisateurDe } from "@/lib/auth";
import { statutValide } from "@/lib/parc";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/parc/statut  { id, statut }
 *
 * Le glisser-deposer du tableau. Une machine qui redevient libre perd son
 * compte : « libre a l'achat » veut dire que personne ne l'attend.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u || !estSuperAdmin(u)) return Response.json({ erreur: "refusé" }, { status: 403 });
  let corps: { id?: unknown; statut?: unknown };
  try { corps = await req.json(); }
  catch { return Response.json({ erreur: "corps illisible" }, { status: 400 }); }
  const id = Number(corps.id);
  if (!Number.isInteger(id) || !statutValide(corps.statut)) {
    return Response.json({ erreur: "stade inconnu" }, { status: 400 });
  }
  const l = await q(`
    UPDATE borne SET statut = $2, statut_le = now(),
                     compte_id = CASE WHEN $2 = 'libre' THEN NULL ELSE compte_id END
     WHERE id = $1 RETURNING id`, [id, corps.statut]);
  if (l.length === 0) return Response.json({ erreur: "machine inconnue" }, { status: 404 });
  return Response.json({ ok: true });
}
