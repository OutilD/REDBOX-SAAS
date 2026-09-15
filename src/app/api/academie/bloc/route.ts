import { q1, transaction } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { TEXTE_MAX, TITRE_MAX, balayerFichiers, champ, deplacer, estGenre, peutEditer,
         rangSuivant, rangerFichier, videoDe, type Genre } from "@/lib/academie";

export const dynamic = "force-dynamic";

/** Ce que chaque genre exige pour exister. */
const EXIGE: Record<Genre, "texte" | "url" | "fichier" | "image"> = {
  texte: "texte", astuce: "texte", attention: "texte", script: "texte", fiche: "texte",
  video: "url", fichier: "fichier", image: "image",
};

/**
 * POST /api/academie/bloc — le contenu d'une lecon, bloc par bloc.
 *
 * Un formulaire par genre, qui ne montre que ses champs ; ici, on verifie ce
 * que chacun exige. Un fichier remplace a la modification laisse l'ancien sans
 * porteur : le balayage le retire dans la meme transaction.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutEditer(u)) return versPage(req, "/academie");
  const f = await req.formData();
  const action = String(f.get("action") ?? "");
  const id = Number(f.get("id"));

  // La lecon d'ou l'on vient : fournie a la creation, relue sinon.
  const existant = action !== "creer" && Number.isInteger(id)
    ? await q1<{ lecon_id: number; genre: Genre }>("SELECT lecon_id, genre FROM academie_bloc WHERE id = $1", [id])
    : null;
  const lecon_id = existant ? existant.lecon_id : Number(f.get("lecon_id"));
  if (!Number.isInteger(lecon_id) || !(await q1("SELECT 1 FROM academie_lecon WHERE id = $1", [lecon_id]))) {
    return versPage(req, "/academie/editer");
  }
  const ici = `/academie/editer/lecon/${lecon_id}`;

  if (action === "monter" || action === "descendre") {
    if (!existant) return versPage(req, ici);
    await deplacer("academie_bloc", id, action);
    return versPage(req, `${ici}#b${id}`);
  }
  if (action === "supprimer") {
    if (!existant) return versPage(req, ici);
    await transaction(async (c) => {
      await c.query("DELETE FROM academie_bloc WHERE id = $1", [id]);
      await balayerFichiers(c);
    });
    return versPage(req, `${ici}?ok=supprime#blocs`);
  }
  if (action !== "creer" && action !== "maj") return versPage(req, ici);
  if (action === "maj" && !existant) return versPage(req, ici);

  const genre = existant ? existant.genre : String(f.get("genre") ?? "");
  if (!estGenre(genre)) return versPage(req, ici);
  const titre = champ(f, "titre", TITRE_MAX);
  const texte = champ(f, "texte", TEXTE_MAX);
  const url = champ(f, "url", 500);
  const fichier = f.get("fichier");
  const envoye = fichier instanceof File && fichier.size > 0 ? fichier : null;
  const retourErreur = (e: string) =>
    versPage(req, `${ici}?e=${e}${existant ? `&b=${id}#b${id}` : `&g=${genre}#ajouter`}`);

  const exige = EXIGE[genre];
  if (exige === "texte" && !texte) return retourErreur("texte");
  if (exige === "url" && !videoDe(url)) return retourErreur("video");
  if ((exige === "fichier" || exige === "image") && !envoye && !existant) return retourErreur("fichier");

  const resultat = await transaction(async (c) => {
    let fichier_id: number | null = null;
    if (envoye) {
      const r = await rangerFichier(c, envoye, exige === "image");
      if ("refus" in r) return { refus: r.refus };
      fichier_id = r.id;
    }
    if (existant) {
      await c.query(`
        UPDATE academie_bloc SET titre = $2, texte = $3, url = $4,
               fichier_id = COALESCE($5::bigint, fichier_id)
         WHERE id = $1`, [id, titre, texte, exige === "url" ? url : null, fichier_id]);
      if (fichier_id) await balayerFichiers(c);
      return { id };
    }
    const ordre = await rangSuivant(c, "academie_bloc", lecon_id);
    const r = await c.query<{ id: number }>(`
      INSERT INTO academie_bloc (lecon_id, genre, ordre, titre, texte, url, fichier_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [lecon_id, genre, ordre, titre, texte, exige === "url" ? url : null, fichier_id]);
    await c.query("UPDATE academie_lecon SET modifie_le = now() WHERE id = $1", [lecon_id]);
    return { id: Number(r.rows[0].id) };
  });
  if ("refus" in resultat) return retourErreur(`fichier_${resultat.refus}`);
  return versPage(req, `${ici}?ok=1#b${resultat.id}`);
}
