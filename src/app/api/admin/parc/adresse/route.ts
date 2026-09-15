import { q, q1 } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { situerBorne } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/parc/adresse — l'editeur donne son adresse a une machine
 * depuis la carte, sans ouvrir sa fiche. On la cherche tout de suite : s'il
 * n'y a toujours pas de place, on le dit, avec ce qui manque.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");
  const f = await req.formData();
  const id = Number(f.get("id"));
  const adresse = String(f.get("adresse") ?? "").trim() || null;
  if (!Number.isInteger(id)) return versPage(req, "/admin");
  await q("UPDATE borne SET adresse = $2 WHERE id = $1", [id, adresse]);
  await situerBorne(id);
  const b = await q1<{ latitude: number | null }>("SELECT latitude FROM borne WHERE id = $1", [id]);
  return versPage(req, b?.latitude !== null && b?.latitude !== undefined
    ? "/admin?ok=situee" : `/admin?e=introuvable#m${id}`);
}
