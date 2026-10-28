import { q } from "@/db";
import { parJeton } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * POST /api/borne/delier   (Bearer jeton)
 *
 * La borne se delie elle-meme, depuis sa console de maintenance. Meme effet que
 * le desappairage depuis le SaaS : on efface le jeton, la ligne et son historique
 * restent au compte. Sans cet appel, le SaaS affichait encore la machine appairee.
 */
export async function POST(req: Request) {
  const borne = await parJeton(req.headers);
  if (!borne) return Response.json({ erreur: "jeton invalide" }, { status: 401 });
  await q(`
    UPDATE borne SET jeton = NULL, depairee_le = now(), reveil_le = NULL, reveil_motif = NULL
     WHERE id = $1 AND jeton NOT LIKE 'demo\\_%' AND jeton NOT LIKE 'vitrine\\_%'`, [borne.id]);
  return Response.json({ ok: true });
}
