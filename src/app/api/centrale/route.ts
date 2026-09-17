import { q, q1, transaction } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { NOM_MAX, TEXTE_MAX, champ, deplacer, lien, peutEditerCentrale, rangSuivant } from "@/lib/centrale";
import { rangerImage } from "@/lib/image";
import { centimes } from "@/lib/prix";

export const dynamic = "force-dynamic";

/**
 * POST /api/centrale — categories, fournisseurs et produits de la boutique.
 *
 * Un seul guichet, l'action dit quoi : `categorie_creer`, `produit_maj`,
 * `produit_dispo`, `fournisseur_supprimer`… Des formulaires ordinaires, comme
 * le reste de la console : la boutique s'ecrit sans JavaScript. Reserve aux
 * super-admins.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutEditerCentrale(u)) return versPage(req, "/centrale");
  const f = await req.formData();
  const [cible, action] = String(f.get("action") ?? "").split("_");
  const id = Number(f.get("id"));
  // D'ou l'on vient — l'onglet de categorie ouvert — pour y revenir.
  const retour = String(f.get("retour") ?? "/centrale").startsWith("/centrale") ? String(f.get("retour")) : "/centrale";
  const vers = (suite: string, ancre?: string) =>
    versPage(req, `${retour}${retour.includes("?") ? "&" : "?"}${suite}${ancre ? `#${ancre}` : ""}`);

  const nom = champ(f, "nom", NOM_MAX);
  const texte = champ(f, "texte", TEXTE_MAX);
  const url = lien(f, "url");

  /* ------------------------------------------------------------ categories */
  if (cible === "categorie") {
    if (action === "creer") {
      if (!nom) return vers("e=nom");
      await transaction(async (c) => {
        const ordre = await rangSuivant(c, "centrale_categorie", null);
        await c.query("INSERT INTO centrale_categorie (nom, ordre) VALUES ($1, $2)", [nom, ordre]);
      });
      return vers("ok=1");
    }
    if (!Number.isInteger(id) || !(await q1("SELECT 1 FROM centrale_categorie WHERE id = $1", [id]))) return vers("");
    if (action === "maj") {
      if (!nom) return vers("e=nom", "categories");
      await q("UPDATE centrale_categorie SET nom = $2 WHERE id = $1", [id, nom]);
      return vers("ok=1", "categories");
    }
    if (action === "monter" || action === "descendre") {
      await deplacer("centrale_categorie", id, action);
      return vers("", "categories");
    }
    if (action === "supprimer") {
      // Les produits ne partent pas avec elle : ils perdent leur rayon, c'est tout.
      await q("DELETE FROM centrale_categorie WHERE id = $1", [id]);
      return versPage(req, "/centrale/gerer?ok=supprime#categories");
    }
    return vers("");
  }

  /* ----------------------------------------------------------- fournisseurs */
  if (cible === "fournisseur") {
    if (url === false) return vers("e=lien", action === "creer" ? undefined : `f${id}`);
    const fichier = f.get("image");
    const envoye = fichier instanceof File && fichier.size > 0 ? fichier : null;
    if (action === "creer") {
      if (!nom) return vers("e=nom");
      const r = await transaction(async (c) => {
        let image_id: number | null = null;
        if (envoye) {
          image_id = await rangerImage(c, u.compte_id, envoye);
          if (image_id === null) return { refus: "image" };
        }
        const ordre = await rangSuivant(c, "centrale_fournisseur", null);
        const n = await c.query<{ id: number }>(`
          INSERT INTO centrale_fournisseur (nom, url, texte, image_id, ordre)
          VALUES ($1, $2, $3, $4, $5) RETURNING id`, [nom, url, texte, image_id, ordre]);
        return { id: Number(n.rows[0].id) };
      });
      if ("refus" in r) return vers(`e=${r.refus}`);
      return vers("ok=1", `f${r.id}`);
    }
    if (!Number.isInteger(id) || !(await q1("SELECT 1 FROM centrale_fournisseur WHERE id = $1", [id]))) return vers("");
    if (action === "maj") {
      if (!nom) return vers("e=nom", `f${id}`);
      const r = await transaction(async (c) => {
        let image_id: number | null = null;
        if (envoye) {
          image_id = await rangerImage(c, u.compte_id, envoye);
          if (image_id === null) return { refus: "image" };
        }
        await c.query(`
          UPDATE centrale_fournisseur
             SET nom = $2, url = $3, texte = $4, image_id = COALESCE($5::bigint, image_id), modifie_le = now()
           WHERE id = $1`, [id, nom, url, texte, image_id]);
        return {};
      });
      if ("refus" in r) return vers(`e=${r.refus}`, `f${id}`);
      return vers("ok=1", `f${id}`);
    }
    if (action === "monter" || action === "descendre") {
      await deplacer("centrale_fournisseur", id, action);
      return vers("", `f${id}`);
    }
    if (action === "supprimer") {
      // Un fournisseur qui a encore des produits ne s'efface pas d'un clic :
      // on retire ses produits d'abord, ou on le garde.
      if (await q1("SELECT 1 FROM centrale_produit WHERE fournisseur_id = $1", [id])) return vers("e=produits", `f${id}`);
      await q("DELETE FROM centrale_fournisseur WHERE id = $1", [id]);
      return versPage(req, "/centrale/gerer?ok=supprime#fournisseurs");
    }
    return vers("");
  }

  /* --------------------------------------------------------------- produits */
  if (cible === "produit") {
    const fournisseur_id = Number(f.get("fournisseur_id"));
    const categorie_id = f.get("categorie_id") ? Number(f.get("categorie_id")) : null;
    const achat = centimes(String(f.get("prix_achat") ?? ""));
    const conseille = centimes(String(f.get("prix_conseille") ?? ""));
    const prixMauvais = (n: string) => String(f.get(n) ?? "").trim() !== "" && centimes(String(f.get(n))) === null;
    const disponible = String(f.get("disponible") ?? "") === "1";
    const fichier = f.get("image");
    const envoye = fichier instanceof File && fichier.size > 0 ? fichier : null;
    const ancre = action === "creer" ? undefined : "modifier";

    if (action === "creer" || action === "maj") {
      if (!nom) return vers("e=nom", ancre);
      if (url === false) return vers("e=lien", ancre);
      if (prixMauvais("prix_achat") || prixMauvais("prix_conseille")) return vers("e=prix", ancre);
      if (!Number.isInteger(fournisseur_id)
          || !(await q1("SELECT 1 FROM centrale_fournisseur WHERE id = $1", [fournisseur_id]))) return vers("e=fournisseur", ancre);
      if (categorie_id !== null && (!Number.isInteger(categorie_id)
          || !(await q1("SELECT 1 FROM centrale_categorie WHERE id = $1", [categorie_id])))) return vers("e=cat", ancre);
    }
    if (action === "creer") {
      const r = await transaction(async (c) => {
        let image_id: number | null = null;
        if (envoye) {
          image_id = await rangerImage(c, u.compte_id, envoye);
          if (image_id === null) return { refus: "image" };
        }
        const ordre = await rangSuivant(c, "centrale_produit", fournisseur_id);
        const n = await c.query<{ id: number }>(`
          INSERT INTO centrale_produit
            (fournisseur_id, categorie_id, nom, texte, url, prix_achat_c, prix_conseille_c, image_id, ordre, disponible)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [fournisseur_id, categorie_id, nom, texte, url, achat, conseille, image_id, ordre, disponible]);
        return { id: Number(n.rows[0].id) };
      });
      if ("refus" in r) return vers(`e=${r.refus}`);
      return versPage(req, `/centrale/produit/${r.id}?ok=1`);
    }
    if (!Number.isInteger(id) || !(await q1("SELECT 1 FROM centrale_produit WHERE id = $1", [id]))) return vers("");
    if (action === "maj") {
      const r = await transaction(async (c) => {
        let image_id: number | null = null;
        if (envoye) {
          image_id = await rangerImage(c, u.compte_id, envoye);
          if (image_id === null) return { refus: "image" };
        }
        await c.query(`
          UPDATE centrale_produit
             SET fournisseur_id = $2, categorie_id = $3, nom = $4, texte = $5, url = $6,
                 prix_achat_c = $7, prix_conseille_c = $8,
                 image_id = COALESCE($9::bigint, image_id), disponible = $10, modifie_le = now()
           WHERE id = $1`, [id, fournisseur_id, categorie_id, nom, texte, url, achat, conseille, image_id, disponible]);
        return {};
      });
      if ("refus" in r) return vers(`e=${r.refus}`, ancre);
      return vers("ok=1", ancre);
    }
    if (action === "dispo") {
      // L'interrupteur seul, depuis la liste de gestion : en rupture, ou de retour.
      await q("UPDATE centrale_produit SET disponible = $2, modifie_le = now() WHERE id = $1", [id, disponible]);
      return vers("", `p${id}`);
    }
    if (action === "monter" || action === "descendre") {
      await deplacer("centrale_produit", id, action);
      return vers("", `p${id}`);
    }
    if (action === "supprimer") {
      await q("DELETE FROM centrale_produit WHERE id = $1", [id]);
      return versPage(req, "/centrale/gerer?ok=supprime");
    }
  }
  return vers("");
}
