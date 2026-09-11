import { q1 } from "@/db";
import { peutCharger, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { signaler } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Ce qui tient sur l'ecran d'une borne sans deborder de la pastille. */
const TEXTE_MAX = 90;

/**
 * Arrete ou reprend la vente sur une borne, depuis le SaaS.
 *
 * On ne coupe rien : la machine continue de se synchroniser, de remonter ses
 * ventes et d'attendre l'ordre inverse. Debrancher la borne aurait ferme la
 * boutique et la liaison du meme geste — et il aurait fallu retourner sur place
 * pour la rouvrir.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return versPage(req, "/bornes");
  if (!peutCharger(u)) return versPage(req, `/bornes/${id}`);
  // CETTE BORNE LUI EST-ELLE OUVERTE ? Le compte ne suffit plus : quelqu'un
  // invite pour une seule machine appartient bien au compte, et pourrait
  // agir sur les autres en tapant leur numero dans l'adresse.
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const f = await req.formData();
  const actif = String(f.get("actif") ?? "") === "1";
  const texte = String(f.get("texte") ?? "").trim().slice(0, TEXTE_MAX) || null;

  const b = await q1<{ nom: string; hors_service: boolean }>(
    "SELECT nom, hors_service FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) return versPage(req, "/bornes");

  // LA MACHINE LE DIT DANS SON SALON, et sur les telephones : l'equipe doit
  // savoir qu'une RedBox a cesse de vendre, et qui l'a decide. Seulement si
  // l'etat change — reenvoyer le formulaire ne doit pas le redire.
  if (b.hors_service !== actif) {
    void signaler(u.compte_id, { id, nom: b.nom }, [{
      genre: "service", actif, texte: actif ? texte : null,
      par: u.nom?.trim() || u.email.split("@")[0],
    }]).catch((e) => console.error("notifications :", e instanceof Error ? e.message : e));
  }

  await q1(`
    UPDATE borne
       SET hors_service = $2,
           hors_service_texte = $3,
           -- La date ne bouge qu'a la mise hors service : elle sert a dire
           -- depuis quand la machine ne vend plus, pas quand on l'a rouverte.
           hors_service_le = CASE WHEN $2 THEN COALESCE(hors_service_le, now()) ELSE NULL END
     WHERE id = $1`, [id, actif, actif ? texte : null]);

  // Sans reveil, l'ordre attendrait le prochain appel — jusqu'a cinq minutes
  // pendant lesquelles la borne continuerait de vendre ce qu'on vient d'arreter.
  await reveiller(id, actif ? "mise hors service" : "remise en service");

  return versPage(req, `/bornes/${id}?hs=${actif ? 1 : 0}`);
}
