import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { utilisateur } from "@/lib/auth";
import { NOM_MAX, categories as lireCategories, euros, fournisseurs as lireFournisseurs,
         peutEditerCentrale, produits as lireProduits } from "@/lib/centrale";
import { IcoCorbeille, IcoImage } from "../../icones";
import Modale from "../../modale";
import { ChampsFournisseur, ChampsProduit, Deplacer, ERREURS, Retour } from "../formulaires";

export const dynamic = "force-dynamic";

/**
 * L'ARRIERE-BOUTIQUE. Les super-admins y tiennent la liste des produits — en
 * rupture ou de retour d'un clic —, les fournisseurs et les rayons. Chaque
 * produit se modifie sur sa fiche.
 */
export default async function Gerer({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string; f?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutEditerCentrale(u)) redirect("/centrale");
  const sp = await searchParams;
  const [prods, cats, fours] = await Promise.all([lireProduits({ tri: "nom" }), lireCategories(), lireFournisseurs()]);
  const erreur = sp.e ? ERREURS[sp.e] ?? "Impossible." : null;
  const fOuvert = Number(sp.f);
  const ici = "/centrale/gerer";

  return (
    <>
      <Entete page="centrale" />
      <main className="ecran ctr">
        <Link href="/centrale" className="aca-retour">‹ Centrale d’achat</Link>
        <div className="ctr-gerer-tete">
          <div className="pousse">
            <h1>Gérer la boutique</h1>
            <p className="sous">Les produits, les fournisseurs et les rayons que voient tous les redboxers.</p>
          </div>
          <div className="rangee-actions">
            <Modale titre="Nouveau produit" ouvrir="＋ Produit" classeBouton="bouton primaire petit">
              {fours.length === 0 ? <p className="aide">Ajoutez d’abord un fournisseur.</p> : (
                <form method="post" action="/api/centrale" encType="multipart/form-data">
                  <input type="hidden" name="action" value="produit_creer" />
                  <Retour retour={ici} />
                  <ChampsProduit p="np" fournisseurs={fours} categories={cats} />
                  <div className="ctr-bas"><span /><button className="bouton primaire">Ajouter le produit</button></div>
                </form>
              )}
            </Modale>
            <Modale titre="Nouveau fournisseur" ouvrir="＋ Fournisseur" classeBouton="bouton petit">
              <form method="post" action="/api/centrale" encType="multipart/form-data">
                <input type="hidden" name="action" value="fournisseur_creer" />
                <Retour retour={ici} />
                <ChampsFournisseur p="nf" />
                <div className="ctr-bas"><span /><button className="bouton primaire">Ajouter le fournisseur</button></div>
              </form>
            </Modale>
            <Modale titre="Nouveau rayon" ouvrir="＋ Rayon" classeBouton="bouton petit">
              <form method="post" action="/api/centrale">
                <input type="hidden" name="action" value="categorie_creer" />
                <Retour retour={ici} />
                <div className="champ">
                  <label htmlFor="nc-nom">Nom du rayon</label>
                  <input id="nc-nom" name="nom" required maxLength={NOM_MAX} placeholder="Vapes" />
                </div>
                <div className="ctr-bas"><span /><button className="bouton primaire">Ajouter le rayon</button></div>
              </form>
            </Modale>
          </div>
        </div>

        {sp.ok === "1" ? <p className="aca-ok" role="status">Enregistré.</p> : null}
        {sp.ok === "supprime" ? <p className="aca-ok" role="status">Supprimé.</p> : null}
        {erreur && !fOuvert ? <p className="erreur">{erreur}</p> : null}

        <section className="ctr-section" id="produits">
          <div className="titre-section"><h2>Produits</h2><span className="faible">{prods.length}</span></div>
          {prods.length === 0 ? <p className="vide">Aucun produit.</p> : (
            <div className="ctr-liste">
              {prods.map((p) => (
                <div key={p.id} id={`p${p.id}`} className={`ctr-ligne${p.disponible ? "" : " rupture"}`}>
                  <Link href={`/centrale/produit/${p.id}`} className="vignette" aria-label={p.nom}>
                    {p.image_id
                      ? <img src={`/api/image/${p.image_id}`} alt="" loading="lazy" decoding="async" />  // eslint-disable-line @next/next/no-img-element
                      : <IcoImage size={18} />}
                  </Link>
                  <div className="dit">
                    <Link href={`/centrale/produit/${p.id}`} className="nom">{p.nom}</Link>
                    <div className="meta">{p.fournisseur}{p.categorie ? ` · ${p.categorie}` : " · sans rayon"}</div>
                  </div>
                  <div className="prix num">
                    <span>{euros(p.prix_achat_c)}</span>
                    <span className="faible">→ {euros(p.prix_conseille_c)}</span>
                  </div>
                  <form method="post" action="/api/centrale" className="dispo">
                    <input type="hidden" name="action" value="produit_dispo" />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="disponible" value={p.disponible ? "0" : "1"} />
                    <Retour retour={ici} />
                    <button className={`pilule ${p.disponible ? "ok" : "mal"}`} title={p.disponible ? "Passer en rupture" : "Remettre en vente"}>
                      <i />{p.disponible ? "Disponible" : "Rupture"}
                    </button>
                  </form>
                  <Link href={`/centrale/produit/${p.id}#modifier`} className="bouton petit">Modifier</Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ctr-section" id="fournisseurs">
          <div className="titre-section"><h2>Fournisseurs</h2><span className="faible">{fours.length}</span></div>
          {fours.length === 0 ? <p className="vide">Aucun fournisseur.</p> : (
            <div className="ctr-liste">
              {fours.map((f, i) => (
                <details key={f.id} id={`f${f.id}`} className="ctr-ligne-pliable" open={fOuvert === f.id || undefined}>
                  <summary className="ctr-ligne">
                    <span className="vignette" aria-hidden="true">
                      {f.image_id
                        ? <img src={`/api/image/${f.image_id}`} alt="" loading="lazy" decoding="async" />  // eslint-disable-line @next/next/no-img-element
                        : <b>{f.nom.slice(0, 2).toUpperCase()}</b>}
                    </span>
                    <span className="dit">
                      <span className="nom">{f.nom}</span>
                      <span className="meta">{f.produits} produit{f.produits > 1 ? "s" : ""}{f.url ? ` · ${(() => { try { return new URL(f.url).hostname.replace(/^www\./, ""); } catch { return f.url; } })()}` : ""}</span>
                    </span>
                    <span className="bouton petit">Modifier</span>
                  </summary>
                  <div className="dedans">
                    <form method="post" action="/api/centrale" encType="multipart/form-data" className="formulaire">
                      <input type="hidden" name="action" value="fournisseur_maj" />
                      <input type="hidden" name="id" value={f.id} />
                      <Retour retour={ici} />
                      {fOuvert === f.id && erreur ? <p className="erreur">{erreur}</p> : null}
                      <ChampsFournisseur f={f} p={`f${f.id}`} />
                      <div className="ctr-bas"><span /><button className="bouton primaire">Enregistrer</button></div>
                    </form>
                    <div className="formulaire supprimer ctr-bas">
                      <Deplacer cible="fournisseur" id={f.id} premier={i === 0} dernier={i === fours.length - 1} retour={ici} />
                      <form method="post" action="/api/centrale">
                        <input type="hidden" name="action" value="fournisseur_supprimer" />
                        <input type="hidden" name="id" value={f.id} />
                        <Retour retour={ici} />
                        <button className="bouton petit danger" disabled={f.produits > 0}
                                title={f.produits > 0 ? "Retirez d’abord ses produits" : undefined}>
                          <IcoCorbeille size={14} /> Retirer
                        </button>
                      </form>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        <section className="ctr-section" id="categories">
          <div className="titre-section"><h2>Rayons</h2><span className="faible">{cats.length}</span></div>
          {cats.length === 0 ? <p className="vide">Aucun rayon.</p> : (
            <div className="ctr-liste">
              {cats.map((c, i) => (
                <div key={c.id} className="ctr-cat">
                  <form method="post" action="/api/centrale" className="rangee">
                    <input type="hidden" name="action" value="categorie_maj" />
                    <input type="hidden" name="id" value={c.id} />
                    <Retour retour={ici} />
                    <input name="nom" required maxLength={NOM_MAX} defaultValue={c.nom} aria-label="Nom du rayon" />
                    <button className="bouton petit">OK</button>
                  </form>
                  <span className="faible num">{c.produits} produit{c.produits > 1 ? "s" : ""}</span>
                  <Deplacer cible="categorie" id={c.id} premier={i === 0} dernier={i === cats.length - 1} retour={ici} />
                  <form method="post" action="/api/centrale">
                    <input type="hidden" name="action" value="categorie_supprimer" />
                    <input type="hidden" name="id" value={c.id} />
                    <button className="bouton petit carre danger" aria-label={`Supprimer ${c.nom}`} title="Supprimer">
                      <IcoCorbeille size={15} />
                    </button>
                  </form>
                </div>
              ))}
              <p className="aide">Supprimer un rayon ne supprime pas ses produits : ils restent en boutique, sans rayon.</p>
            </div>
          )}
        </section>
      </main>
      <NavBasse page="centrale" />
    </>
  );
}
