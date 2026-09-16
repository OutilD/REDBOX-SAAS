import { q1 } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { situerBorne } from "@/lib/geo";
import { statutValide } from "@/lib/parc";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/parc/creer — l'editeur enregistre une machine qui n'existe
 * encore pour personne : en production, en stock, ou deja promise a un compte.
 * Elle n'a ni jeton ni lieu ; le client lui donnera les deux en l'adoptant.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");

  const f = await req.formData();
  const numero = String(f.get("numero") ?? "").trim() || null;
  const nomSaisi = String(f.get("nom") ?? "").trim();
  const statut = String(f.get("statut") ?? "");
  const compteBrut = String(f.get("compte_id") ?? "").trim();
  const adresse = String(f.get("adresse") ?? "").trim() || null;
  const note = String(f.get("note") ?? "").trim() || null;

  if (!statutValide(statut)) return versPage(req, "/admin/parc?e=statut");
  if (!nomSaisi && !numero) return versPage(req, "/admin/parc?e=nom");
  const nom = nomSaisi || `RedBox n° ${numero}`;
  // Une machine libre n'a pas de compte, par definition.
  const compte_id = statut === "libre" || !compteBrut ? null : Number(compteBrut);

  let id: number;
  try {
    const l = await q1<{ id: number }>(`
      INSERT INTO borne (compte_id, nom, adresse, statut, statut_le, numero, note_editeur)
      VALUES ($1, $2, $3, $4, now(), $5, $6) RETURNING id`,
      [compte_id, nom, adresse, statut, numero, note]);
    id = l!.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return versPage(req, "/admin/parc?e=numero");
    throw e;
  }
  if (adresse) await situerBorne(id);
  return versPage(req, `/admin/parc?ok=creee#m${id}`);
}
