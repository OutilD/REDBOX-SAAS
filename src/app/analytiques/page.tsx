import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../chrome";
import { BarresClassees, Courbes } from "../graphes";
import { IcoBorne, IcoFleche, IcoStock, IcoVentes } from "../icones";
import { q, euros } from "@/db";
import { utilisateur } from "@/lib/auth";
import { autonomie, categoriesDansLeTemps, FENETRES, parBorne, parProduit, periodeDe,
         pasDe, pasCategories, NOM_PAS, serie, DEFAUT } from "@/lib/tableau";
import { Repli } from "../repli";
import { adresse, Classement, FicheRisque, SerieTemps } from "../analyses";

export const dynamic = "force-dynamic";

/**
 * Les analytiques.
 *
 * TOUT CE QUI SE LIT EN PRENANT LE TEMPS, sorti du tableau de bord pour qu'il
 * reste simple : le decoupage du temps, le classement des RedBox, ce qui se
 * vend, les categories, ce qui va manquer. Le tableau de bord repond en trois
 * secondes ; cette page-ci repond en trois minutes.
 *
 * Meme periode, meme borne, memes adresses que le tableau de bord : on passe de
 * l'un a l'autre sans perdre ce qu'on regardait.
 */
export default async function Analytiques(
  { searchParams }: { searchParams:
    Promise<{ f?: string; b?: string; vue?: string; du?: string; au?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const { f, b, vue, du, au } = await searchParams;

  const p = await periodeDe(f, du, au);
  const perso = p.cle === "perso";
  const pas = pasDe(p);

  const machines = await q<{ id: number; nom: string }>(
    `SELECT id, nom FROM borne
      WHERE compte_id = $1 AND ($2::bigint[] IS NULL OR id = ANY($2))
      ORDER BY nom`, [u.compte_id, u.bornes]);
  const choisie = machines.find((m) => String(m.id) === b) ?? null;
  const portee = choisie ? [choisie.id] : u.bornes;
  const sienDuCompte = u.bornes === null;
  const graphe = vue === "graphe";

  const lien = (chg: { f?: string; vue?: string }) =>
    adresse("/analytiques", p, choisie?.id ?? null, graphe ? "graphe" : "", chg);

  const [points, bornes, categories, stocks, produits] = await Promise.all([
    serie(u.compte_id, p, portee),
    parBorne(u.compte_id, p, portee),
    categoriesDansLeTemps(u.compte_id, p, portee),
    sienDuCompte ? autonomie(u.compte_id, p) : [],
    parProduit(u.compte_id, p, portee),
  ]);

  const ventes = points.reduce((s, d) => s + d.n, 0);
  const classees = [...categories.series].sort((a, b) => b.total - a.total);
  const risques = stocks.filter((s) => s.jours_restants !== null && s.jours_restants <= 21);
  const dormants = stocks.filter((s) => s.vendus === 0 && s.stock > 0);

  return (
    <>
      <Entete page="analytiques" borne={choisie ? String(choisie.id) : ""} periode={p} />
      <main className="ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Analytiques</h1>
            <p className="sous">
              {u.compte} — {choisie ? <strong>{choisie.nom}</strong> : "toutes les RedBox"}
              {perso ? <> — <strong>{p.nom}</strong></>
                     : <>, sur {p.cle === "1" ? "la journée" : `les ${p.nom}`}</>}.
            </p>
          </div>
          <div className="choix-periode">
            <nav className="periodes" aria-label="Période observée">
              {FENETRES.map((x) => (
                <Link key={x.cle} href={lien({ f: x.cle })}
                      aria-current={!perso && x.cle === p.cle ? "true" : undefined}>
                  {x.nom}
                </Link>
              ))}
            </nav>

            {/* UN FORMULAIRE GET, PAS DE JAVASCRIPT : la page se recharge,
                l'adresse porte la periode, et elle se met en favori. */}
            <details className="periode-perso" open={perso}>
              <summary>Dates précises</summary>
              <form method="get" action="/analytiques">
                <label>
                  <span>Du</span>
                  <input type="datetime-local" name="du" defaultValue={p.saisie.du} required />
                </label>
                <label>
                  <span>Au</span>
                  <input type="datetime-local" name="au" defaultValue={p.saisie.au} required />
                </label>
                {choisie ? <input type="hidden" name="b" value={String(choisie.id)} /> : null}
                {graphe ? <input type="hidden" name="vue" value="graphe" /> : null}
                <button className="bouton petit primaire">Afficher</button>
                {perso ? (
                  <Link href={lien({ f: DEFAUT.cle })} className="bouton petit discret">
                    Revenir aux {DEFAUT.nom}
                  </Link>
                ) : null}
              </form>
              <p className="faible">
                Heure de Paris, celle du bar où se trouve la machine.
              </p>
            </details>
          </div>
        </div>

        {/* --------------------------------------------------- le decoupage du temps */}
        {/* Le titre suit le pas : sur quatre heures de vente, « Jour par jour »
            annoncait une barre unique et donnait tort au graphe qui suivait. */}
        <h2 style={{ marginTop: 0 }}>{NOM_PAS[pas]}</h2>
        <div className="carte">
          {ventes === 0 ? (
            <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période" dedans />
          ) : points.length < 2 ? (
            <Repli icone={<IcoVentes />} titre="Une seule barre à l’écran"
                   texte="Une tendance demande au moins deux points. Élargissez la période pour la voir."
                   dedans />
          ) : (
            <SerieTemps points={points} pas={pas} />
          )}
        </div>

        {/* ------------------------------------------------------------- bornes */}
        <div className="titre-section">
          <h2>Quelle RedBox marche le mieux</h2>
          <Link href="/bornes" className="lien">Voir tout <IcoFleche size={13} /></Link>
        </div>
        {bornes.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucune RedBox sur ce compte"
                 texte="Une RedBox se rattache à votre compte en lisant le code qu’elle affiche dans sa console de maintenance."
                 action={{ nom: "Ajouter une RedBox", vers: "/bornes/ajouter" }} />
        ) : (
          <Classement bornes={bornes} />
        )}

        {/* ------------------------------------------------- ce qui se vend */}
        {/*
          QUEL PRODUIT, ET PAS SEULEMENT QUELLE BORNE. C'est l'article qu'on
          rachete, qu'on arrete ou qu'on monte en prix — la borne, on ne la
          change pas. La marge est a cote du chiffre, et c'est elle qui compte.

          LE MEME CHIFFRE, DEUX LECTURES : un tableau se lit ligne par ligne, un
          graphe se lit d'un coup. Deux liens plutot qu'un bouton a JavaScript :
          la vue choisie tient dans l'adresse, donc elle se partage.
        */}
        <div className="titre-section">
          <h2>Ce qui se vend</h2>
          <nav className="periodes petites" aria-label="Présentation">
            <Link href={lien({ vue: "" })} aria-current={!graphe ? "true" : undefined}>Tableau</Link>
            <Link href={lien({ vue: "graphe" })} aria-current={graphe ? "true" : undefined}>Graphique</Link>
          </nav>
        </div>
        {produits.length === 0 ? (
          <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période"
                 texte="Rien ne s’est vendu sur la fenêtre choisie." dedans />
        ) : graphe ? (
          <div className="carte viz">
            <BarresClassees series={produits.slice(0, 10).map((pr, i) => ({
              cle: String(pr.id ?? `x${i}`), nom: pr.nom, rang: i,
              total: pr.ca, unites: pr.n,
              // `valeurs` sert aux courbes, pas aux barres classees : un produit
              // n'a pas de serie dans le temps ici, et lui en inventer une serait
              // dessiner une evolution qu'on n'a pas calculee.
              valeurs: [],
            }))} />
          </div>
        ) : (
          <div className="carte plate tableau-enveloppe">
            <table className="tableau">
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col" className="masque-etroit">Catégorie</th>
                  <th scope="col" className="num">Vendus</th>
                  <th scope="col" className="num">Chiffre</th>
                  <th scope="col" className="num">Marge</th>
                </tr>
              </thead>
              <tbody>
                {produits.slice(0, 15).map((pr, i) => (
                  <tr key={`${pr.id ?? "x"}-${i}`}>
                    <th scope="row">
                      {pr.nom}
                      {pr.sku ? <span className="sku">{pr.sku}</span> : null}
                    </th>
                    <td className="masque-etroit">{pr.categorie}</td>
                    <td className="num">{pr.n}</td>
                    <td className="num">{euros(pr.ca)}</td>
                    {/* Un tiret, pas un zero : une marge inconnue n'est pas une
                        marge nulle, et les confondre fait arreter un produit qui
                        rapportait. */}
                    <td className={`num ${pr.marge !== null && pr.marge < 0 ? "perte" : ""}`}>
                      {pr.marge === null ? "—" : euros(pr.marge)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="masque-etroit" />
                  <td className="num">{produits.reduce((t, x) => t + x.n, 0)}</td>
                  <td className="num">{euros(produits.reduce((t, x) => t + x.ca, 0))}</td>
                  <td className="num">
                    {euros(produits.reduce((t, x) => t + (x.marge ?? 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
            {produits.length > 15 ? (
              <p className="faible" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
                Les quinze premiers sur {produits.length}. Le total porte sur tous.
              </p>
            ) : null}
          </div>
        )}

        {/* ------------------------------------------------- ventes par categorie */}
        <h2>Ventes par catégorie</h2>
        {classees.length === 0 ? (
          <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période"
                 texte="Élargissez la fenêtre, ou vérifiez que les RedBox remontent bien leurs ventes."
                 dedans />
        ) : (
          <div className="duo viz">
            <section>
              <h3>Répartition</h3>
              <BarresClassees series={classees} />
            </section>
            <section>
              <h3>Évolution {NOM_PAS[pasCategories(p)].toLowerCase()}</h3>
              {categories.seaux.length >= 2
                ? <Courbes seaux={categories.seaux} series={categories.series} />
                : <Repli titre="Pas encore d’évolution"
                         texte="Il faut au moins deux périodes de ventes pour dessiner une tendance." dedans />}
            </section>
          </div>
        )}

        {/* ------------------------------------------------- ce qui va manquer */}
        {sienDuCompte ? (
        <>
        <div className="titre-section" id="manque">
          <h2>Ce qui va manquer</h2>
          <Link href="/reception" className="lien">Enregistrer une réception <IcoFleche size={13} /></Link>
        </div>
        {risques.length === 0 ? (
          <Repli icone={<IcoStock />} titre="Rien ne manquera d’ici trois semaines"
                 texte="Au rythme de vente constaté sur la période, tous vos produits tiennent."
                 dedans />
        ) : (
          <>
            <div className="risque viz">
              {risques.map((s) => <FicheRisque key={s.id} s={s} />)}
            </div>
            <p className="faible" style={{ fontSize: 13, marginTop: 12 }}>
              L’autonomie divise le stock total — réserve, RedBox et en route — par la cadence
              de vente de la période. La quantité proposée est celle qui vous ramène à trente
              jours d’avance.
            </p>
          </>
        )}

        {dormants.length > 0 ? (
          <>
            <h2>Ce qui ne bouge pas</h2>
            <div className="carte plate">
              <div className="lignes">
                {dormants.map((s) => (
                  <div className="ligne" key={s.id}>
                    <div className="corps">
                      <div className="nom">{s.nom}</div>
                      <div className="meta">{s.categorie} · aucune vente sur la période</div>
                    </div>
                    <div className="fin num" style={{ fontWeight: 700 }}>{s.stock}</div>
                  </div>
                ))}
              </div>
              <p className="faible" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                Du stock immobilisé qui ne rapporte rien. Vérifiez qu’ils sont bien affectés à un
                canal avant d’en conclure qu’ils ne se vendent pas.
              </p>
            </div>
          </>
        ) : null}
        </>
        ) : null}
      </main>
      <NavBasse page="analytiques" />
    </>
  );
}
