import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { utilisateur } from "@/lib/auth";
import { TRIS, categories as lireCategories, estTri, fournisseurs as lireFournisseurs,
         peutEditerCentrale, produits as lireProduits, type Tri } from "@/lib/centrale";
import { IcoCentrale, IcoLoupe, IcoReglages } from "../icones";
import Modale from "../modale";
import { ChampsProduit, ERREURS, Retour } from "./formulaires";
import { GrilleProduits } from "./vues";

export const dynamic = "force-dynamic";

/**
 * LA VITRINE.
 *
 * Comme une boutique en ligne : une barre de recherche, les rayons en onglets,
 * un tri, un filtre par fournisseur, et la grille. Chaque carte ouvre sa fiche ;
 * le bouton Acheter part chez le fournisseur. Les super-admins ajoutent un
 * produit d'ici, et gerent le reste sur /centrale/gerer.
 */
export default async function Centrale({ searchParams }: {
  searchParams: Promise<{ c?: string; f?: string; q?: string; tri?: string; dispo?: string; e?: string; ok?: string }>;
}) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const sp = await searchParams;
  const editeur = peutEditerCentrale(u);
  const [cats, fours] = await Promise.all([lireCategories(), lireFournisseurs()]);
  const categorie = sp.c && cats.some((c) => c.id === Number(sp.c)) ? Number(sp.c) : null;
  const fournisseur = sp.f && fours.some((f) => f.id === Number(sp.f)) ? Number(sp.f) : null;
  const q = (sp.q ?? "").trim().slice(0, 80) || null;
  const tri: Tri | undefined = sp.tri && estTri(sp.tri) ? sp.tri : undefined;
  const dispo = sp.dispo === "1";
  const prods = await lireProduits({ categorie, fournisseur, q, tri, dispo });
  const erreur = sp.e ? ERREURS[sp.e] ?? "Impossible." : null;

  // L'adresse courante, pour que chaque onglet garde la recherche et le tri.
  const lienVers = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const tout: Record<string, string | null> = {
      c: categorie ? String(categorie) : null, f: fournisseur ? String(fournisseur) : null,
      q, tri: tri ?? null, dispo: dispo ? "1" : null, ...patch,
    };
    for (const [k, v] of Object.entries(tout)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/centrale?${s}` : "/centrale";
  };
  const retour = lienVers({});
  const total = cats.reduce((n, c) => n + c.produits, 0);
  const filtre = Boolean(q || fournisseur || dispo || tri);
  const nomCat = cats.find((c) => c.id === categorie)?.nom;

  return (
    <>
      <Entete page="centrale" />
      <main className="ecran ctr">
        <header className="ctr-tete">
          <div className="pousse">
            <div className="ctr-surtitre"><IcoCentrale size={14} /> Centrale d’achat</div>
            <h1>Tout ce qui se vend en RedBox</h1>
            <p className="sous">
              Les produits qui marchent, où les acheter, à quel prix, et ce qu’ils rapportent.
              L’achat se fait chez le fournisseur : le bouton vous y emmène.
            </p>
          </div>
          <form method="get" action="/centrale" className="champ-recherche ctr-recherche" role="search">
            <IcoLoupe size={17} />
            <input type="search" name="q" defaultValue={q ?? ""} maxLength={80}
                   placeholder="Chercher un produit, un fournisseur…" aria-label="Chercher dans la centrale" />
            {categorie ? <input type="hidden" name="c" value={categorie} /> : null}
            {tri ? <input type="hidden" name="tri" value={tri} /> : null}
            <button type="submit" className="bouton petit">Chercher</button>
          </form>
        </header>

        {sp.ok === "supprime" ? <p className="aca-ok" role="status">Produit supprimé.</p> : null}
        {erreur ? <p className="erreur">{erreur}</p> : null}

        <nav className="periodes ctr-onglets" aria-label="Rayons">
          <Link href={lienVers({ c: null })} aria-current={categorie === null ? "page" : undefined}>
            Tout <span className="compte num">{total}</span>
          </Link>
          {cats.map((c) => (
            <Link key={c.id} href={lienVers({ c: String(c.id) })} aria-current={categorie === c.id ? "page" : undefined}>
              {c.nom}{c.produits > 0 ? <span className="compte num">{c.produits}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="ctr-outils">
          <form method="get" action="/centrale" className="ctr-filtres">
            {categorie ? <input type="hidden" name="c" value={categorie} /> : null}
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <label className="ctr-filtre">
              <span>Trier</span>
              <select name="tri" defaultValue={tri ?? ""}>
                <option value="">Sélection RedBox</option>
                {TRIS.map((t) => <option key={t.cle} value={t.cle}>{t.nom}</option>)}
              </select>
            </label>
            {fours.length > 1 ? (
              <label className="ctr-filtre">
                <span>Fournisseur</span>
                <select name="f" defaultValue={fournisseur ?? ""}>
                  <option value="">Tous</option>
                  {fours.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </label>
            ) : null}
            <label className="ctr-filtre coche">
              <input type="checkbox" name="dispo" value="1" defaultChecked={dispo} />
              <span>Disponibles seulement</span>
            </label>
            <button className="bouton petit sans-js">Appliquer</button>
            {filtre ? <Link href={lienVers({ q: null, f: null, tri: null, dispo: null })} className="bouton petit discret">Effacer</Link> : null}
          </form>
          <div className="ctr-compte faible">
            <span className="num">{prods.length}</span> produit{prods.length > 1 ? "s" : ""}
            {nomCat ? <> dans <b>{nomCat}</b></> : null}{q ? <> pour « {q} »</> : null}
          </div>
          {editeur ? (
            <div className="rangee-actions ctr-ajouts">
              <Modale titre="Nouveau produit" ouvrir="＋ Produit" classeBouton="bouton primaire petit">
                {fours.length === 0 ? (
                  <p className="aide">Ajoutez d’abord un fournisseur sur la page de gestion : un produit vient toujours de quelque part.</p>
                ) : (
                  <form method="post" action="/api/centrale" encType="multipart/form-data">
                    <input type="hidden" name="action" value="produit_creer" />
                    <Retour retour={retour} />
                    <ChampsProduit p="np" fournisseurs={fours} categories={cats} categorie_id={categorie} fournisseur_id={fournisseur ?? undefined} />
                    <div className="ctr-bas"><span /><button className="bouton primaire">Ajouter le produit</button></div>
                  </form>
                )}
              </Modale>
              <Link href="/centrale/gerer" className="bouton petit"><IcoReglages size={16} /> Gérer</Link>
            </div>
          ) : null}
        </div>

        {prods.length === 0 ? (
          <div className="vide">
            <span className="grand" aria-hidden="true"><IcoCentrale size={40} /></span>
            {total === 0
              ? editeur ? "La boutique est vide : ajoutez un fournisseur, puis des produits." : "La centrale d’achat se remplit bientôt."
              : q ? <>Rien pour « {q} ». <Link href={lienVers({ q: null })} className="lien-souligne">Voir tout</Link></> : "Rien ici pour l’instant."}
          </div>
        ) : (
          <GrilleProduits produits={prods} />
        )}
      </main>
      <NavBasse page="centrale" />
    </>
  );
}
