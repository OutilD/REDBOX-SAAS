import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { utilisateur } from "@/lib/auth";
import { categories as lireCategories, estNouveau, fournisseurs as lireFournisseurs, lienAchat,
         peutEditerCentrale, produitDe, similaires } from "@/lib/centrale";
import { IcoCoche, IcoCorbeille, IcoFleche, IcoImage } from "../../../icones";
import { ChampsProduit, Deplacer, ERREURS, Retour } from "../../formulaires";
import { BlocPrix, GrilleProduits } from "../../vues";

export const dynamic = "force-dynamic";

/**
 * LA FICHE PRODUIT. La photo en grand, le fournisseur, les prix et ce qu'ils
 * font, la description, et le bouton qui emmene acheter. En bas, le meme
 * rayon. Les super-admins modifient ici, sous la fiche.
 */
export default async function FicheProduit({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }>;
}) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = await produitDe(Number(id));
  if (!p) notFound();
  const editeur = peutEditerCentrale(u);
  const [autres, cats, fours] = await Promise.all([similaires(p, 4), lireCategories(), lireFournisseurs()]);
  const achat = p.disponible ? lienAchat(p) : null;
  const erreur = sp.e ? ERREURS[sp.e] ?? "Impossible." : null;
  const ici = `/centrale/produit/${p.id}`;
  const hote = (() => { try { return achat ? new URL(achat).hostname.replace(/^www\./, "") : null; } catch { return null; } })();

  return (
    <>
      <Entete page="centrale" />
      <main className="ecran ctr">
        <nav className="ctr-chemin" aria-label="Vous êtes ici">
          <Link href="/centrale">Centrale d’achat</Link>
          {p.categorie_id ? <><span aria-hidden="true">›</span><Link href={`/centrale?c=${p.categorie_id}`}>{p.categorie}</Link></> : null}
          <span aria-hidden="true">›</span><span className="ici">{p.nom}</span>
        </nav>

        {sp.ok === "1" ? <p className="aca-ok" role="status">Enregistré.</p> : null}

        <article className={`ctr-fiche${p.disponible ? "" : " rupture"}`}>
          <div className="photo">
            {p.image_id
              ? <img src={`/api/image/${p.image_id}`} alt={p.nom} decoding="async" />  // eslint-disable-line @next/next/no-img-element
              : <span className="sans" aria-hidden="true"><IcoImage size={48} /></span>}
          </div>
          <div className="dit">
            <div className="ctr-fiche-tags">
              <Link href={`/centrale?f=${p.fournisseur_id}`} className="pilule">{p.fournisseur}</Link>
              {p.categorie ? <span className="pilule">{p.categorie}</span> : null}
              {!p.disponible
                ? <span className="pilule mal"><i />En rupture</span>
                : estNouveau(p) ? <span className="pilule ok"><i />Nouveau</span> : <span className="pilule ok"><IcoCoche size={13} /> Disponible</span>}
            </div>
            <h1>{p.nom}</h1>
            {p.texte ? <p className="ctr-fiche-texte">{p.texte}</p> : null}
            <BlocPrix p={p} />
            {achat ? (
              <a href={achat} target="_blank" rel="noopener noreferrer" className="bouton primaire large ctr-fiche-acheter">
                Acheter chez {p.fournisseur} <IcoFleche size={16} />
              </a>
            ) : (
              <span className="bouton large ctr-fiche-acheter" aria-disabled="true">
                {p.disponible ? "Lien d’achat à venir" : "En rupture chez le fournisseur"}
              </span>
            )}
            <p className="ctr-fiche-note faible">
              {achat
                ? <>Vous achetez directement sur {hote ?? "le site du fournisseur"}, dans un nouvel onglet. RedBox ne prend aucune commission.</>
                : "Revenez bientôt, ou regardez les produits du même rayon."}
            </p>
          </div>
        </article>

        {editeur ? (
          <details className="ctr-modifier carte ctr-fiche-modifier" id="modifier" open={erreur ? true : undefined}>
            <summary>Modifier ce produit</summary>
            <form method="post" action="/api/centrale" encType="multipart/form-data" className="formulaire">
              <input type="hidden" name="action" value="produit_maj" />
              <input type="hidden" name="id" value={p.id} />
              <Retour retour={ici} />
              {erreur ? <p className="erreur">{erreur}</p> : null}
              <ChampsProduit pr={p} p={`p${p.id}`} fournisseurs={fours} categories={cats} />
              <div className="ctr-bas"><span /><button className="bouton primaire">Enregistrer</button></div>
            </form>
            <div className="formulaire supprimer ctr-bas">
              <Deplacer cible="produit" id={p.id} premier={false} dernier={false} retour={ici} />
              <form method="post" action="/api/centrale">
                <input type="hidden" name="action" value="produit_supprimer" />
                <input type="hidden" name="id" value={p.id} />
                <button className="bouton petit danger"><IcoCorbeille size={14} /> Supprimer ce produit</button>
              </form>
            </div>
          </details>
        ) : null}

        {autres.length > 0 ? (
          <section className="ctr-section">
            <div className="titre-section">
              <h2>{p.categorie ? `Aussi dans ${p.categorie}` : `Aussi chez ${p.fournisseur}`}</h2>
              {p.categorie_id ? <Link href={`/centrale?c=${p.categorie_id}`} className="lien">Tout le rayon ›</Link> : null}
            </div>
            <GrilleProduits produits={autres} />
          </section>
        ) : null}
      </main>
      <NavBasse page="centrale" />
    </>
  );
}
