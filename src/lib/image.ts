import { createHash } from "node:crypto";
import type { PgClient } from "@/db";

/**
 * LES IMAGES DU CATALOGUE.
 *
 * Petites par nature : une vignette de rayon, une photo d'article. Le plafond
 * est donc bas — deux megaoctets — et ce n'est pas de l'avarice. Ces images
 * partent sur CHAQUE borne, par la 4G d'une cave, et la machine doit pouvoir
 * les afficher instantanement une fois en cache. Une photo de reflex de huit
 * megaoctets ferait la meme vignette de 200 px, en quinze fois plus lourd.
 */
export const IMAGE_MAX = 2 * 1024 * 1024;

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

/**
 * Range une image et rend son identifiant.
 *
 * DEDOUBLONNEE PAR L'EMPREINTE : reposer la meme photo sur un deuxieme produit
 * ne stocke rien de plus et ne fait rien retelecharger a la borne, dont le cache
 * est lui aussi nomme par l'empreinte. C'est le meme principe que la publicite,
 * et il vaut ici pour la meme raison.
 *
 * Rend `null` si le fichier est refuse — mauvais format, vide, ou trop lourd —
 * pour que l'appelant decide quoi en dire.
 */
export async function rangerImage(
  c: PgClient, compte_id: number, fichier: File,
): Promise<number | null> {
  if (!IMAGE_TYPES[fichier.type] || fichier.size === 0 || fichier.size > IMAGE_MAX) return null;
  const octets = Buffer.from(await fichier.arrayBuffer());
  // La taille annoncee par le navigateur n'engage personne : on mesure.
  if (octets.length === 0 || octets.length > IMAGE_MAX) return null;

  const empreinte = createHash("sha256").update(octets).digest("hex");
  const r = await c.query<{ id: number }>(`
    INSERT INTO image (compte_id, type_mime, octets, taille, empreinte)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (compte_id, empreinte) DO UPDATE SET type_mime = EXCLUDED.type_mime
    RETURNING id`,
    [compte_id, fichier.type, octets, octets.length, empreinte]);
  return r.rows[0].id;
}

/**
 * Efface les images que plus rien ne designe.
 *
 * Appelee apres chaque changement. Sans ce menage, remplacer dix fois la photo
 * d'un produit laisserait neuf images mortes dans une base ou l'on paie l'octet.
 */
export async function balayerImages(c: PgClient, compte_id: number): Promise<void> {
  await c.query(`
    DELETE FROM image i
     WHERE i.compte_id = $1
       AND NOT EXISTS (SELECT 1 FROM categorie x WHERE x.image_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM produit   x WHERE x.image_id = i.id)`, [compte_id]);
}
