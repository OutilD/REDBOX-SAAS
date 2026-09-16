import { q1 } from "@/db";
import { estSuperAdmin, utilisateurDe, versPage } from "@/lib/auth";
import { situerBorne } from "@/lib/geo";
import { statutApresAttribution, statutValide, type Statut } from "@/lib/parc";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/parc/modifier — la fiche d'une machine, cote editeur : son
 * stade, le compte qui l'attend, son numero, son nom, son adresse prevue.
 *
 * LE COMPTE D'UNE MACHINE APPAIREE NE SE CHANGE PAS ICI. Elle vend pour ce
 * compte, ses ventes et son stock lui appartiennent ; la deplacer d'un menu
 * ferait changer de mains une machine en service. Il faut la desappairer.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!estSuperAdmin(u)) return versPage(req, "/");

  const f = await req.formData();
  const id = Number(f.get("id"));
  if (!Number.isInteger(id)) return versPage(req, "/admin/parc");
  const retour = `/admin/parc#m${id}`;

  const actuelle = await q1<{ jeton: string | null; compte_id: number | null; statut: Statut; nom: string }>(
    "SELECT jeton, compte_id, statut, nom FROM borne WHERE id = $1", [id]);
  if (!actuelle) return versPage(req, "/admin/parc");

  const numero = String(f.get("numero") ?? "").trim() || null;
  const nom = String(f.get("nom") ?? "").trim() || actuelle.nom;
  const adresse = String(f.get("adresse") ?? "").trim() || null;
  const note = String(f.get("note") ?? "").trim() || null;
  const statutDemande = String(f.get("statut") ?? "");
  if (!statutValide(statutDemande)) return versPage(req, "/admin/parc?e=statut");

  const compteBrut = String(f.get("compte_id") ?? "").trim();
  let compte_id: number | null = actuelle.compte_id;
  if (!actuelle.jeton) compte_id = compteBrut ? Number(compteBrut) : null;
  else if (f.has("compte_id") && (compteBrut ? Number(compteBrut) : null) !== actuelle.compte_id) {
    return versPage(req, `/admin/parc?e=appairee#m${id}`);
  }

  let statut: Statut = statutDemande;
  if (statut === "libre") compte_id = null;
  else if (statut === actuelle.statut) statut = statutApresAttribution(statut, compte_id);

  try {
    await q1(`
      UPDATE borne SET numero = $2, nom = $3, adresse = $4, note_editeur = $5,
                       compte_id = $6, statut = $7,
                       statut_le = CASE WHEN statut = $7 THEN statut_le ELSE now() END
       WHERE id = $1`, [id, numero, nom, adresse, note, compte_id, statut]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return versPage(req, `/admin/parc?e=numero#m${id}`);
    throw e;
  }
  await situerBorne(id);
  return versPage(req, retour);
}
