import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { q } from "@/db";
import Modale from "../../../modale";
import { categories as lireCategories, estNouveau, fournisseurs as lireFournisseurs, lienAchat,
         peutEditerCentrale, produitDe, similaires } from "@/lib/centrale";
import { ListeGouts } from "../../vues";
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
  // Peut-il le mettre dans SON catalogue ? Le proprietaire ou le gerant du
  // compte, pas quelqu'un restreint a une machine : le catalogue est au compte.
  const adopte = peutConfigurer(u) && u.bornes === null;
  const [autres, cats, fours, miennes, dejaLa] = await Promise.all([
    similaires(p, 4), lireCategories(), lireFournisseurs(),
    adopte ? q<{ id: number; nom: string }>("SELECT id, nom FROM categorie WHERE compte_id = $1 ORDER BY ordre, nom", [u.compte_id]) : [],
    adopte ? q<{ n: number }>("SELECT COUNT(*)::int AS n FROM produit WHERE compte_id = $1 AND (nom = $2 OR nom LIKE $2 || ' · %')", [u.compte_id, p.nom]).then((r) => r[0]?.n ?? 0) : 0,
  ]);
  const memeRayon = miennes.find((c) => p.categorie && c.nom.trim().toLowerCase() === p.categorie.trim().toLowerCase());
  const age18 = /vape|puff|popper|alcool|tabac|cigarette/i.test(`${p.categorie ?? ""} ${p.nom}`);
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

        <article className={`ctr-fiche${p.disponible ? "" : " rupture"}${p.gouts.length > 0 ? " avec-gouts" : ""}`}>
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
            {/* LA DESCRIPTION ET LES GOUTS, cote a cote a droite de la photo :
                deux colonnes separees d'un filet, la description a gauche, la
                liste a droite ; l'une sous l'autre quand la place manque. */}
            {p.texte || p.gouts.length > 0 ? (
              <div className={`ctr-fiche-corps${p.texte && p.gouts.length > 0 ? " deux" : ""}`}>
                {p.texte ? (
                  <section className="ctr-fiche-description" aria-label="Description">
                    <h2>Description</h2>
                    <p className="ctr-fiche-texte">{p.texte}</p>
                  </section>
                ) : null}
                <ListeGouts gouts={p.gouts} />
              </div>
            ) : null}
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
            {adopte ? (
              <div className="ctr-fiche-adopter">
                <Modale titre="Ajouter à mon catalogue" ouvrir={dejaLa > 0 ? "Ajouter encore à mon catalogue" : "＋ Ajouter à mon catalogue"}
                        classeBouton="bouton large">
                  <form method="post" action="/api/centrale/adopter">
                    <input type="hidden" name="produit_id" value={p.id} />
                    <p className="aide" style={{ marginTop: 0 }}>
                      Le nom, la photo, la description et le prix conseillé arrivent dans votre catalogue.
                      Il restera à le poser sur une spirale (RedBox → Emplacements).
                    </p>
                    <div className="champ">
                      <label htmlFor="ad-cat">Dans quelle catégorie</label>
                      <select id="ad-cat" name="categorie_id" defaultValue={memeRayon ? String(memeRayon.id) : "nouvelle"}>
                        {miennes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                        <option value="nouvelle">＋ Nouvelle catégorie « {p.categorie ?? "Divers"} »</option>
                      </select>
                    </div>
                    <div className="champs" style={{ marginTop: 14 }}>
                      <div className="c-court">
                        <label htmlFor="ad-prix">Prix de vente (€)</label>
                        <input id="ad-prix" name="prix" inputMode="decimal"
                               defaultValue={p.prix_conseille_c ? (p.prix_conseille_c / 100).toFixed(2).replace(".", ",") : ""} placeholder="4,50" />
                      </div>
                      <div className="c-court">
                        <label htmlFor="ad-age">Âge minimum</label>
                        <select id="ad-age" name="age_min" defaultValue={age18 ? "18" : "0"}>
                          <option value="0">Tout public</option>
                          <option value="18">18 ans</option>
                        </select>
                      </div>
                    </div>
                    {p.gouts.length > 0 ? (
                      <fieldset className="ctr-adopter-gouts">
                        <legend>Un produit par goût</legend>
                        <div className="liste">
                          {p.gouts.map((g) => (
                            <label key={g.nom}>
                              <input type="checkbox" name="gout" value={g.nom} defaultChecked={g.etiquette === "best" || p.gouts.length <= 4} />
                              <span>{g.nom}</span>
                              {g.etiquette === "best" ? <small>best-seller</small> : g.etiquette === "nouveau" ? <small>nouveau</small> : null}
                            </label>
                          ))}
                        </div>
                        <p className="aide">Aucun goût coché : un seul produit, au nom du modèle.</p>
                      </fieldset>
                    ) : null}
                    <div className="ctr-bas"><span /><button className="bouton primaire">Ajouter à mon catalogue</button></div>
                  </form>
                </Modale>
                {dejaLa > 0 ? <p className="ctr-fiche-note faible">Déjà dans votre catalogue ({dejaLa}).</p> : null}
              </div>
            ) : null}
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
