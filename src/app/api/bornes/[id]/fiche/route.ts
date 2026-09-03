import { transaction } from "@/db";
import { peutConfigurer, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { balayerImages, rangerImage } from "@/lib/image";

export const dynamic = "force-dynamic";

/**
 * LA FICHE D'UNE BORNE : SON NOM, CE QU'ON EN DIT, ET SA PHOTO.
 *
 * Le nom etait saisi une fois a l'adoption et ne se reprenait plus. Un parc de
 * vingt machines devenait alors vingt lignes qui se ressemblent, et le
 * reassortisseur qui part en tournee ne savait pas laquelle est au fond du bar.
 *
 * LE LIEU SUIT LE NOM. Une borne porte un `lieu` du meme nom, cree a l'adoption :
 * c'est lui qui apparait dans les mouvements de stock. Renommer l'un sans
 * l'autre aurait laisse « Bar du Coin » dans la liste des bornes et
 * « RBX-014 » dans l'historique des transferts, pour la meme machine.
 *
 * LA MACHINE EST REVEILLEE. Elle affiche son nom et son adresse sur l'ecran
 * d'assistance : les corriger dans le SaaS sans le lui dire laisserait le client
 * appeler en citant un nom que l'exploitant ne reconnait plus.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!peutConfigurer(u)) return versPage(req, `/bornes/${id}`);
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const f = await req.formData();
  const nom = String(f.get("nom") ?? "").trim();
  const adresse = String(f.get("adresse") ?? "").trim();
  const description = String(f.get("description") ?? "").trim();
  const photo = f.get("photo");
  const oter = f.get("oter") !== null;

  // Une borne sans nom n'est plus reperable nulle part : ni dans la liste, ni
  // dans le selecteur, ni dans un mouvement de stock.
  if (!nom) return versPage(req, `/bornes/${id}?e=nom`);

  let refus = false;
  await transaction(async (c) => {
    const sienne = await c.query<{ lieu_id: number | null }>(
      "SELECT lieu_id FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
    if ((sienne.rowCount ?? 0) === 0) return;

    await c.query(`UPDATE borne SET nom = $1, adresse = $2, description = $3
                    WHERE id = $4 AND compte_id = $5`,
                  [nom, adresse || null, description || null, id, u.compte_id]);

    const lieu = sienne.rows[0].lieu_id;
    if (lieu) await c.query("UPDATE lieu SET nom = $1 WHERE id = $2", [nom, lieu]);

    // Un fichier vide ne veut rien dire : le navigateur en envoie un pour chaque
    // champ non rempli. On ne touche a la photo que si quelque chose a ete choisi.
    if (photo instanceof File && photo.size > 0) {
      const img = await rangerImage(c, u.compte_id, photo);
      if (img === null) refus = true;
      else await c.query("UPDATE borne SET image_id = $1 WHERE id = $2", [img, id]);
    } else if (oter) {
      await c.query("UPDATE borne SET image_id = NULL WHERE id = $1", [id]);
    }

    await balayerImages(c, u.compte_id);
  });

  await reveiller(id, "fiche modifiée");
  return versPage(req, `/bornes/${id}?fiche=${refus ? "refus" : "ok"}`);
}
