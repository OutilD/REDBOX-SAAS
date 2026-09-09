import { utilisateurDe, versPage } from "@/lib/auth";
import { retirer } from "@/lib/salons";

export const dynamic = "force-dynamic";

/** POST /api/messages/retirer (id, salon_id) — un de ses propres messages. */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  if (!u) return json ? Response.json({ erreur: "non connecté" }, { status: 401 }) : versPage(req, "/connexion");
  let id: number, salon_id: number;
  if (json) {
    const c = await req.json().catch(() => ({})) as { id?: unknown; salon_id?: unknown };
    id = Number(c.id); salon_id = Number(c.salon_id);
  } else {
    const f = await req.formData();
    id = Number(f.get("id")); salon_id = Number(f.get("salon_id"));
  }
  const ok = Number.isInteger(id) && await retirer(id, u.id);
  if (json) return Response.json({ ok });
  return versPage(req, Number.isInteger(salon_id) ? `/messages/${salon_id}` : "/messages");
}
