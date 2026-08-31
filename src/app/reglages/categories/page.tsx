import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { Repli } from "../../repli";
import { IcoCategories } from "../../icones";

export const dynamic = "force-dynamic";

type Cat = { id: number; nom: string; ordre: number; produits: number; unites: number };

/**
 * Les categories.
 *
 * L'ordre n'est pas cosmetique : c'est celui dans lequel la borne les presente
 * au client, sur son ecran d'accueil. Ce qu'on veut vendre en premier se met en
 * premier.
 */
export default async function Categories({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutConfigurer(u)) redirect("/reglages");
  const { e } = await searchParams;

  const cats = await q<Cat>(`
    SELECT c.id, c.nom, c.ordre,
           (SELECT COUNT(*)::int FROM produit p WHERE p.categorie_id = c.id AND p.actif) AS produits,
           COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s
                       JOIN produit p ON p.id = s.produit_id
                      WHERE p.categorie_id = c.id), 0) AS unites
      FROM categorie c WHERE c.compte_id = $1
     ORDER BY c.ordre, c.nom`, [u.compte_id]);

  const messages: Record<string, string> = {
    nom: "Donnez un nom, et un nom qui n’existe pas déjà.",
    pleine: "Cette catégorie contient encore des produits. Déplacez-les d’abord.",
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
          Elles rangent votre stock ici, et décident de l’ordre d’affichage sur l’écran
          d’accueil des bornes. Le plus petit nombre passe en premier.
        </p>
        {e ? <p className="erreur">{messages[e] ?? "Impossible."}</p> : null}

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
        <form method="post" action="/api/categories">
          <input type="hidden" name="action" value="enregistrer" />
          {cats.map((c) => (
            <div className="carte" key={c.id}>
              <div className="rangee" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ width: 88 }}>
                  <label htmlFor={`o_${c.id}`}>Ordre</label>
                  <input id={`o_${c.id}`} name={`o_${c.id}`} type="number" min={1} max={999}
                         defaultValue={c.ordre} inputMode="numeric" />
                </div>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <label htmlFor={`n_${c.id}`}>Nom</label>
                  <input id={`n_${c.id}`} name={`n_${c.id}`} defaultValue={c.nom} required />
                </div>
              </div>
              <div className="rangee" style={{ marginTop: 12 }}>
                <span className="faible" style={{ fontSize: 13 }}>
                  {c.produits} produit{c.produits > 1 ? "s" : ""} · {c.unites} unités
                </span>
                <div className="pousse" />
                {c.produits === 0 ? (
                  <button className="bouton petit danger" formAction="/api/categories"
                          name="supprimer" value={c.id}>Supprimer</button>
                ) : (
                  <span className="faible" style={{ fontSize: 12.5 }}>
                    à vider avant de pouvoir la supprimer
                  </span>
                )}
              </div>
            </div>
          ))}
          {cats.length > 0 ? (
            <div style={{ position: "sticky", bottom: "calc(72px + env(safe-area-inset-bottom))", paddingTop: 14 }}>
              <button className="bouton primaire large">Enregistrer</button>
            </div>
          ) : (
            <Repli icone={<IcoCategories />} titre="Aucune catégorie"
                   texte="Créez-en une ci-dessus — « Vapes », « Boissons »… Le plus petit numéro d’ordre passe en premier sur l’écran de la borne."
                   dedans />
          )}
        </form>
      </main>
      <NavBasse page="categories" />
    </>
  );
}
