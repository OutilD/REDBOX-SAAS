import { utilisateurDe, versPage } from "@/lib/auth";
import { retirer } from "@/lib/salons";
import { apres } from "@/lib/apres";
import { annoncer } from "@/lib/temps-reel";

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
  const salon = Number.isInteger(id) ? await retirer(id, u.id) : null;
  const ok = salon !== null;
  if (salon !== null) apres("temps réel", () => annoncer([salon]));
  // Pas le sien, deja retire, ou inconnu : le fil ne doit pas croire au retrait.
  if (json) return Response.json({ ok }, { status: ok ? 200 : 404 });
  return versPage(req, Number.isInteger(salon_id) ? `/messages/${salon_id}` : "/messages");
}
