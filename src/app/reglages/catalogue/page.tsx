import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, euros } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { Repli } from "../../repli";
import { IcoCatalogue, IcoCategories } from "../../icones";

export const dynamic = "force-dynamic";

type P = {
  id: number; sku: string; nom: string;
  categorie_id: number | null; categorie: string;
  prix_vente_c: number; age_min: number; prix_achat_c: number | null; canaux: number;
};
type Cat = { id: number; nom: string };

export default async function Catalogue({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { e } = await searchParams;

  const produits = await q<P>(`
    SELECT p.id, p.sku, p.nom, p.prix_vente_c, p.age_min, p.categorie_id,
           COALESCE(cat.nom, 'sans catégorie') AS categorie,
           (SELECT a.prix_achat_c FROM v_prix_achat a WHERE a.produit_id = p.id) AS prix_achat_c,
           (SELECT COUNT(*)::int FROM canal c WHERE c.produit_id = p.id)         AS canaux
      FROM produit p LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE p.compte_id = $1 AND p.actif
     ORDER BY COALESCE(cat.ordre, 999), p.nom`, [u.compte_id]);

  const categories = await q<Cat>(
    "SELECT id, nom FROM categorie WHERE compte_id = $1 ORDER BY ordre, nom", [u.compte_id]);

  return (
    <>
      <Entete page="catalogue" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Catalogue</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Les prix valent pour toutes vos bornes. Les machines les relisent à chaque
          synchronisation. <Link href="/reglages/categories" style={{ textDecoration: "underline" }}>
          Organiser les catégories</Link>.
        </p>
        {e === "sku" ? <p className="erreur">Ce SKU existe déjà, ou le nom est vide.</p> : null}
        {e === "cat" ? <p className="erreur">
          Aucune catégorie. <Link href="/reglages/categories" style={{ textDecoration: "underline" }}>
          Créez-en une d’abord.</Link></p> : null}

        {peutConfigurer(u) ? (
          <form method="post" action="/api/catalogue" className="carte">
            <div className="rangee" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 130 }}>
                <label htmlFor="sku">SKU</label>
                <input id="sku" name="sku" required autoCapitalize="characters" className="mono" />
              </div>
              <div style={{ flex: 1, minWidth: 190 }}>
                <label htmlFor="nom">Nom</label><input id="nom" name="nom" required />
              </div>
            </div>
            <div className="rangee" style={{ gap: 12, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="cat">Catégorie</label>
                <select id="cat" name="categorie_id" required defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div style={{ width: 120 }}>
                <label htmlFor="prix">Prix (€)</label>
                <input id="prix" name="prix" inputMode="decimal" defaultValue="0,00" />
              </div>
              <div style={{ width: 120 }}>
                <label htmlFor="age">Âge minimum</label>
                <select id="age" name="age_min" defaultValue="18">
                  <option value="0">aucun</option><option value="18">18 ans</option>
                </select>
              </div>
            </div>
            <div style={{ height: 16 }} />
            <button className="bouton primaire large">Ajouter au catalogue</button>
          </form>
        ) : null}

        <h2>{produits.length} produits</h2>
        <form method="post" action="/api/catalogue">
          <input type="hidden" name="action" value="prix" />
          <div className="carte plate"><div className="lignes">
            {produits.map((p) => (
              <div className="ligne" key={p.id}>
                <div className="corps">
                  <div className="nom">{p.nom}</div>
                  <div className="meta">
                    <span className="mono">{p.sku}</span>
                    {p.age_min > 0 ? ` · ${p.age_min} ans` : ""} · {p.canaux} {p.canaux > 1 ? "canaux" : "canal"}
                    {p.prix_achat_c ? ` · achat ${euros(p.prix_achat_c)}` : ""}
                  </div>
                </div>
                {peutConfigurer(u) ? (
                  <div className="fin" style={{ width: 150 }}>
                    <select name={`cat_${p.id}`} defaultValue={p.categorie_id ?? ""}
                            style={{ minHeight: 42, fontSize: 14 }}>
                      <option value="">— sans —</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                ) : null}
                <div className="fin" style={{ width: 118 }}>
                  {peutConfigurer(u)
                    ? <input name={`prix_${p.id}`} inputMode="decimal" className="num"
                             defaultValue={(p.prix_vente_c / 100).toFixed(2).replace(".", ",")}
                             style={{ textAlign: "right", minHeight: 42 }} />
                    : <span className="num" style={{ fontWeight: 700 }}>{euros(p.prix_vente_c)}</span>}
                </div>
              </div>
            ))}
            {produits.length === 0 ? (
              categories.length === 0 ? (
                <Repli icone={<IcoCategories />} titre="Commencez par une catégorie"
                       texte="Un produit se range dans une catégorie : elle décide aussi de l’ordre d’affichage sur la borne."
                       action={{ nom: "Créer une catégorie", vers: "/reglages/categories" }} dedans />
              ) : (
                <Repli icone={<IcoCatalogue />} titre="Catalogue vide"
                       texte="Ajoutez vos références ci-dessus : nom, prix de vente, âge minimum."
                       dedans />
              )
            ) : null}
          </div></div>
          {peutConfigurer(u) && produits.length > 0
            ? <div style={{ marginTop: 12 }}><button className="bouton large">Enregistrer les prix</button></div>
            : null}
        </form>
      </main>
      <NavBasse page="catalogue" />
    </>
  );
}
