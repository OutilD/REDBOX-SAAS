import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { Repli } from "../../repli";
import { IcoCategories } from "../../icones";
import Ranger from "./ranger";

export const dynamic = "force-dynamic";

type Cat = {
  id: number; nom: string; ordre: number; produits: number; unites: number;
  image: number | null; icone: string | null;
};

/**
 * Les categories.
 *
 * L'ordre n'est pas cosmetique : c'est celui dans lequel la borne les presente
 * au client, sur son ecran d'accueil. Ce qu'on veut vendre en premier se met en
 * premier.
 */
export default async function Categories({
  searchParams,
}: { searchParams: Promise<{ e?: string; detaches?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutConfigurer(u)) redirect("/reglages");
  const { e, detaches } = await searchParams;

  const cats = await q<Cat>(`
    SELECT c.id, c.nom, c.ordre, c.image_id AS image, c.icone,
           (SELECT COUNT(*)::int FROM produit p WHERE p.categorie_id = c.id AND p.actif) AS produits,
           COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s
                       JOIN produit p ON p.id = s.produit_id
                      WHERE p.categorie_id = c.id), 0) AS unites
      FROM categorie c WHERE c.compte_id = $1
     ORDER BY c.ordre, c.nom`, [u.compte_id]);

  const messages: Record<string, string> = {
    nom: "Donnez un nom, et un nom qui n’existe pas déjà.",
  };

  return (
    <>
      <Entete page="categories" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Catégories</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Faites-les glisser pour les ranger, renommez-les sur place. L’ordre vaut ici
          et sur l’écran d’accueil des bornes — l’aperçu montre ce que verra le client.
        </p>
        {e ? <p className="erreur">{messages[e] ?? "Impossible."}</p> : null}
        {detaches ? (
          <p className="faible" style={{ fontSize: 13.5 }}>
            Catégorie supprimée. {detaches} produit{Number(detaches) > 1 ? "s sont" : " est"}
            {" "}passé{Number(detaches) > 1 ? "s" : ""} « sans catégorie » —
            {" "}<Link href="/reglages/catalogue" style={{ textDecoration: "underline" }}>
            reclassez-{Number(detaches) > 1 ? "les" : "le"} depuis le catalogue</Link>.
          </p>
        ) : null}

        <form method="post" action="/api/categories" className="carte">
          <input type="hidden" name="action" value="ajouter" />
          <div className="rangee" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="nom">Nouvelle catégorie</label>
              <input id="nom" name="nom" required placeholder="Boissons" />
            </div>
            <div style={{ width: 110 }}>
              <label htmlFor="ordre">Ordre</label>
              <input id="ordre" name="ordre" type="number" min={1} max={999}
                     defaultValue={(cats.at(-1)?.ordre ?? 0) + 10} inputMode="numeric" />
            </div>
            <button className="bouton primaire">Ajouter</button>
          </div>
        </form>

        <h2>{cats.length} catégories</h2>
        {cats.length === 0 ? (
          <Repli icone={<IcoCategories />} titre="Aucune catégorie"
                 texte="Créez-en une ci-dessus — « Vapes », « Boissons »… Vous les rangerez ensuite en les faisant glisser."
                 dedans />
        ) : (
          <form method="post" action="/api/categories" encType="multipart/form-data">
            <input type="hidden" name="action" value="enregistrer" />
            <div className="ranger-duo">
              <Ranger key={cats.map((c) => `${c.id}:${c.ordre}:${c.nom}`).join()}
                      initiales={cats} />
            </div>
          </form>
        )}

      </main>
      <NavBasse page="categories" />
    </>
  );
}
