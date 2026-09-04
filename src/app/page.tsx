import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "./chrome";
import { BarresClassees, Courbes } from "./graphes";
import { IcoAlerte, IcoFleche, IcoHorloge, IcoPente } from "./icones";
import { q, euros, depuis, enLigne } from "@/db";
import { utilisateur } from "@/lib/auth";
import { autonomie, avancement, categoriesDansLeTemps, comparaison, entete, FENETRES,
         parBorne, parJour, parProduit, type Autonomie, type Avancement, type Jour,
         type ParBorne, DEFAUT } from "@/lib/tableau";
import { Repli } from "./repli";
import { IcoBorne, IcoReception, IcoStock, IcoVentes } from "./icones";

export const dynamic = "force-dynamic";

/**
 * Le tableau de bord.
 *
 * QUATRE QUESTIONS, DANS CET ORDRE : combien ca rapporte et dans quel sens ca va,
 * qu'est-ce qui demande une main tout de suite, quelle borne et quel produit
 * tirent le chiffre, et qu'est-ce qui va manquer.
 *
 * LE NIVEAU NE SUFFIT PAS, IL FAUT LA PENTE. « 3 240 € » ne dit rien tout seul :
 * c'est beaucoup ou c'est peu selon le mois d'avant, et c'est la seule chose
 * qu'on vient verifier en ouvrant cet ecran. Chaque chiffre qui compte porte donc
 * sa variation contre la meme fenetre, un cran plus tot.
 *
 * UNE SEULE CHOSE EST EN GRAND. Six tuiles de meme taille — chiffre d'affaires,
 * marge, canaux vides — laissent chercher par ou commencer, et l'oeil tombe sur
 * la premiere de la rangee plutot que sur la plus importante. Le chiffre
 * d'affaires est le phare ; le reste l'entoure, plus petit.
 */
export default async function Tableau(
  { searchParams }: { searchParams: Promise<{ f?: string; b?: string; vue?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const { f, b, vue } = await searchParams;
  const fen = FENETRES.find((x) => x.cle === f) ?? DEFAUT;
  const j = fen.jours;

  /**
   * LA PORTEE DU TABLEAU : LE FILTRE, OU CE QU'ON A LE DROIT DE VOIR.
   *
   * Les deux se combinent au lieu de se remplacer. Une personne invitee sur une
   * machine ne peut pas en choisir une autre : on ne retient son choix que s'il
   * tombe dans ce qui lui est ouvert. Sans quoi le filtre, qui n'est qu'un
   * confort d'affichage, serait devenu une porte.
   */
  const machines = await q<{ id: number; nom: string }>(
    `SELECT id, nom FROM borne
      WHERE compte_id = $1 AND ($2::bigint[] IS NULL OR id = ANY($2))
      ORDER BY nom`, [u.compte_id, u.bornes]);
  const choisie = machines.find((m) => String(m.id) === b) ?? null;
  const portee = choisie ? [choisie.id] : u.bornes;

  // Le depot et la mise en route sont l'affaire de l'exploitant : ni l'un ni
  // l'autre ne veut dire quoi que ce soit pour qui n'a qu'une machine.
  const sienDuCompte = u.bornes === null;

  const graphe = vue === "graphe";
  const lien = (chg: { f?: string; vue?: string }) => {
    const p = new URLSearchParams();
    const fe = chg.f ?? fen.cle;
    if (fe !== DEFAUT.cle) p.set("f", fe);
    if (choisie) p.set("b", String(choisie.id));
    const v = chg.vue ?? (graphe ? "graphe" : "");
    if (v) p.set("vue", v);
    const q = p.toString();
    return q ? `/?${q}` : "/";
  };

  const [avance, tete, avant, jours, bornes, categories, stocks, produits] = await Promise.all([
    sienDuCompte ? avancement(u.compte_id) : null,
    entete(u.compte_id, j, portee),
    comparaison(u.compte_id, j, portee),
    parJour(u.compte_id, j, portee),
    parBorne(u.compte_id, j, portee),
    categoriesDansLeTemps(u.compte_id, j, portee),
    sienDuCompte ? autonomie(u.compte_id, j) : [],
    parProduit(u.compte_id, j, portee),
  ]);

  const classees = [...categories.series].sort((a, b) => b.total - a.total);
  const parJourMoyen = jours.length ? Math.round(tete.ca / jours.length) : 0;
  const panier = tete.ventes ? Math.round(tete.ca / tete.ventes) : 0;
  const panierAvant = avant.ventes ? Math.round(avant.ca / avant.ventes) : 0;
  // Le taux de marge se lit mieux que la marge seule : quinze pour cent sur un
  // gros chiffre et quinze pour cent sur un petit se pilotent de la meme facon.
  const taux = tete.ca > 0 ? Math.round((tete.marge / tete.ca) * 100) : null;

  const risques = stocks.filter((s) => s.jours_restants !== null && s.jours_restants <= 21);
  const urgences = risques.filter((s) => (s.jours_restants ?? 99) <= 3);
  const dormants = stocks.filter((s) => s.vendus === 0 && s.stock > 0);
  const muettes = Math.max(0, tete.bornes - tete.en_ligne - tete.jamais_appairees);

  /**
   * CE QUI DEMANDE UNE MAIN, RASSEMBLE ET CLASSE PAR GRAVITE.
   *
   * C'etait dissemine : les litiges dans une tuile de la rangee du haut, les
   * canaux vides dans une autre, les ruptures tout en bas de l'ecran. Trois
   * endroits pour une seule question — qu'est-ce que je fais maintenant — et
   * aucun ne disait ce qu'il fallait faire.
   *
   * La bande n'apparait que s'il y a quelque chose dedans. Un bandeau permanent
   * qui affiche « 0 probleme » cesse d'etre lu au bout d'une semaine, et il ne se
   * voit plus le jour ou il compte.
   */
  const aTraiter = [
    tete.litiges > 0 && {
      cle: "litiges", niveau: "grave" as const, n: tete.litiges,
      quoi: `vente${tete.litiges > 1 ? "s" : ""} en litige`,
      pourquoi: "de l’argent encaissé sans distribution, à rendre ou à récupérer",
      vers: "/ventes", faire: "Traiter",
    },
    urgences.length > 0 && {
      cle: "rupture", niveau: "grave" as const, n: urgences.length,
      quoi: `référence${urgences.length > 1 ? "s" : ""} en rupture sous trois jours`,
      pourquoi: "un canal vide ne vend rien, et le client va voir ailleurs",
      vers: "/reception", faire: "Racheter",
    },
    muettes > 0 && {
      cle: "muettes", niveau: "moyen" as const, n: muettes,
      quoi: `borne${muettes > 1 ? "s" : ""} sans signe de vie`,
      pourquoi: "elles ne remontent plus leurs ventes ; le chiffre ci-dessus est incomplet",
      vers: "/bornes", faire: "Voir",
    },
    tete.canaux_vides > 0 && {
      cle: "vides", niveau: "moyen" as const, n: tete.canaux_vides,
      quoi: `canal${tete.canaux_vides > 1 ? "aux" : ""} vide${tete.canaux_vides > 1 ? "s" : ""}`,
      pourquoi: "de la place qui ne rapporte rien tant qu’elle reste vide",
      vers: "/bornes", faire: "Charger",
    },
    tete.jamais_appairees > 0 && {
      cle: "appairer", niveau: "doux" as const, n: tete.jamais_appairees,
      quoi: `borne${tete.jamais_appairees > 1 ? "s" : ""} à appairer`,
      pourquoi: "elle est déclarée ici, mais la machine ne parle pas encore",
      vers: "/bornes", faire: "Appairer",
    },
  ].filter(Boolean) as {
    cle: string; niveau: "grave" | "moyen" | "doux"; n: number;
    quoi: string; pourquoi: string; vers: string; faire: string;
  }[];

  // La mise en route ne s'affiche que tant qu'elle n'est PAS FINIE.
  //
  // Je la declenchais sur « aucune vente », et c'etait faux : une borne qu'on
  // vient d'appairer a deja son catalogue et son stock, mais elle n'a pas encore
  // vendu. Son proprietaire voyait donc un ecran de bienvenue a la place de ses
  // donnees — et pouvait croire que rien n'etait remonte. Ce qui compte, c'est
  // qu'il y ait un catalogue ET une machine appairee.
  //
  // L'ecran de bienvenue est une marche a suivre pour l'exploitant : creer un
  // catalogue, appairer une machine. Quelqu'un invite sur une borne n'a aucune
  // de ces mains-la, et la lui montrer serait lui demander de faire un travail
  // qu'il ne peut pas faire. `avance` est nul pour lui, et on passe.
  const enRoute = avance !== null && (avance.produits === 0 || avance.appairees === 0);
  if (enRoute && avance) {
    return (
      <>
        <Entete page="tableau" borne={choisie ? String(choisie.id) : ""} fenetre={fen.cle} />
        <main className="ecran">
          <h1>Bienvenue</h1>
          <p className="sous">
            Compte {u.compte} — voici ce qu’il reste à faire pour que vos bornes se mettent
            à vendre.
          </p>
          <PremiersPas a={avance} />
        </main>
        <NavBasse page="tableau" />
      </>
    );
  }

  return (
    <>
      <Entete page="tableau" borne={choisie ? String(choisie.id) : ""} fenetre={fen.cle} />
      <main className="ecran">
        {/*
          LA TETE : QUI, QUOI, QUAND — ET LE CHOIX DE LA FENETRE A COTE.

          Le selecteur de periode etait une rangee de boutons perdue sous le
          sous-titre, a la meme hauteur que les autres liens de la page. C'est
          pourtant la commande qui change TOUS les chiffres en dessous ; elle
          appartient au titre, pas au contenu.
        */}
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Tableau de bord</h1>
            <p className="sous">
              {u.compte} — {choisie ? <>borne <strong>{choisie.nom}</strong></> : "toutes les bornes"},
              sur {fen.cle === "1" ? "la journée" : `les ${fen.nom}`}.
            </p>
          </div>
          {/* Un segment, pas cinq boutons detaches : les quatre fenetres sont les
              quatre etats d'un meme reglage, et le dessin doit le dire. */}
          <nav className="periodes" aria-label="Période observée">
            {FENETRES.map((x) => (
              <Link key={x.cle} href={lien({ f: x.cle })}
                    aria-current={x.cle === fen.cle ? "true" : undefined}>
                {x.nom}
              </Link>
            ))}
          </nav>
        </div>

        {/* ------------------------------------------------------- les chiffres */}
        <section className="chiffres-cle" aria-label="Chiffres de la période">
          <div className="phare">
            <div className="txt">
              <h2 className="etiquette">Chiffre d’affaires</h2>
              <div className="ligne-chiffre">
                <span className="chiffre num">{euros(tete.ca)}</span>
                <Delta ici={tete.ca} avant={avant.ca} />
              </div>
              <p className="contre">
                {avant.ca > 0
                  ? <>contre <b className="num">{euros(avant.ca)}</b> sur la période précédente</>
                  : <>rien sur la période précédente</>}
                {" · "}<b className="num">{euros(parJourMoyen)}</b> par jour
              </p>
            </div>
            <Etincelle jours={jours} />
          </div>

          <div className="mesures">
            <Mesure titre="Marge estimée" valeur={euros(tete.marge)}
                    dessous={taux === null ? "—" : `${taux} % du chiffre`}
                    delta={<Delta ici={tete.marge} avant={avant.marge} />} />
            <Mesure titre="Articles vendus" valeur={String(tete.ventes)}
                    dessous={`${tete.bornes} borne${tete.bornes > 1 ? "s" : ""} · ${tete.en_ligne} en ligne`}
                    delta={<Delta ici={tete.ventes} avant={avant.ventes} />} />
            <Mesure titre="Panier moyen" valeur={euros(panier)}
                    dessous="par article distribué"
                    delta={<Delta ici={panier} avant={panierAvant} />} />
          </div>
        </section>

        {/* ---------------------------------------------------------- a traiter */}
        {aTraiter.length > 0 ? (
          <>
            <h2>À traiter</h2>
            <ul className="a-traiter">
              {aTraiter.map((a) => (
                <li key={a.cle} className={a.niveau}>
                  <Link href={a.vers}>
                    <span className="pastille" aria-hidden="true" />
                    <span className="dit">
                      <span className="tete">
                        <b className="num">{a.n}</b> {a.quoi}
                      </span>
                      <span className="pourquoi">{a.pourquoi}</span>
                    </span>
                    <span className="faire">{a.faire} <IcoFleche size={13} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {/*
          Les deux gestes qu'on vient faire, atteignables sans chercher. Le
          reassort est un aller-retour permanent entre « je rachete » et « je
          charge » ; les enfouir dans un menu les rend penibles a repeter.
        */}
        <div className="actions-cle">
          <Link href="/reception" className="forte">
            <span className="rond"><IcoReception /></span>
            <span>
              <span className="titre">Réception de stock</span>
              <span className="quoi">
                {risques.length > 0
                  ? `${risques.length} référence${risques.length > 1 ? "s" : ""} à racheter`
                  : "Enregistrer une livraison entière"}
              </span>
            </span>
            <span className="fleche"><IcoFleche /></span>
          </Link>
          <Link href="/bornes">
            <span className="rond"><IcoBorne /></span>
            <span>
              <span className="titre">Charger une borne</span>
              <span className="quoi">
                {tete.canaux_vides > 0
                  ? `${tete.canaux_vides} canaux vides à remplir`
                  : "Passer du stock en machine"}
              </span>
            </span>
            <span className="fleche"><IcoFleche /></span>
          </Link>
        </div>

        {/* ------------------------------------------------------- jour par jour */}
        <h2>Jour par jour</h2>
        <div className="carte">
          {tete.ventes === 0 ? (
            <Repli icone={<IcoVentes />} titre="Aucune vente sur cette période" dedans />
          ) : jours.length < 2 ? (
            <Repli icone={<IcoVentes />} titre="Une seule journée à l’écran"
                   texte="Une courbe demande au moins deux jours. Élargissez la fenêtre pour voir la tendance."
                   dedans />
          ) : (
            <SerieJours jours={jours} />
          )}
        </div>

        {/* ------------------------------------------------------------- bornes */}
        <div className="titre-section">
          <h2>Quelle borne marche le mieux</h2>
          <Link href="/bornes" className="lien">Voir tout <IcoFleche size={13} /></Link>
        </div>
        {bornes.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucune borne sur ce compte"
                 texte="Une borne se rattache à votre compte en lisant le code qu’elle affiche dans sa console de maintenance."
                 action={{ nom: "Ajouter une borne", vers: "/bornes/ajouter" }} />
        ) : (
          <Classement bornes={bornes} />
        )}

        {/* ------------------------------------------------- ce qui se vend */}
        {/*
          QUEL PRODUIT, ET PAS SEULEMENT QUELLE BORNE.

          On savait quelle machine marchait le mieux, jamais quel article. Or
          c'est l'article qu'on rachete, qu'on arrete ou qu'on monte en prix — la
          borne, on ne la change pas.

          La marge est a cote du chiffre, et c'est elle qui compte : un produit
          qui fait le plus gros chiffre en perdant de l'argent a chaque vente
          trone en tete d'un classement au chiffre d'affaires. Elle est vide
          quand aucun prix d'achat n'est connu — un tiret vaut mieux qu'un zero,
          qui ferait passer une marge inconnue pour une marge nulle.
        */}
        <div className="titre-section">
          <h2>Ce qui se vend</h2>
          {/*
            LE MEME CHIFFRE, DEUX LECTURES.

            Un tableau se lit ligne par ligne : on y cherche un produit, on
            compare deux marges, on retrouve une reference. Un graphe se lit d'un
            coup : on y voit lequel ecrase les autres. Ce ne sont pas deux gouts,
            ce sont deux questions — et on ne sait pas laquelle on se pose avant
            d'avoir les chiffres sous les yeux.

            Deux liens plutot qu'un bouton a JavaScript : la vue choisie tient
            dans l'adresse, donc elle se partage et se met en favori.
          */}
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
                 texte="Élargissez la fenêtre, ou vérifiez que les bornes remontent bien leurs ventes."
                 dedans />
        ) : (
          <div className="duo viz">
            <section>
              <h3>Répartition</h3>
              <BarresClassees series={classees} />
            </section>
            <section>
              <h3>Évolution {j <= 7 ? "jour par jour" : "semaine par semaine"}</h3>
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
        <div className="titre-section">
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
              L’autonomie divise le stock total — réserve, bornes et en route — par la cadence
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
      <NavBasse page="tableau" />
    </>
  );
}

/**
 * LA VARIATION CONTRE LA FENETRE PRECEDENTE.
 *
 * En pourcentage, pas en euros : « + 480 € » demande de connaitre le niveau de
 * depart pour signifier quelque chose, « + 18 % » se lit seul.
 *
 * La couleur ne porte jamais le sens toute seule — une hausse et une baisse se
 * liraient pareil pour huit pour cent des hommes. La fleche pointe dans le sens
 * du mouvement, et le signe est ecrit.
 */
function Delta({ ici, avant }: { ici: number; avant: number }) {
  // Partir de zero n'a pas de pourcentage : « + 100 % » de rien serait faux, et
  // « + infini » ne se lit pas. On dit ce qui s'est passe, en toutes lettres.
  if (avant === 0) {
    return ici > 0 ? <span className="pente neuf">nouveau</span> : null;
  }
  const p = Math.round(((ici - avant) / avant) * 100);
  if (p === 0) return <span className="pente stable">stable</span>;
  const monte = p > 0;
  return (
    <span className={`pente ${monte ? "hausse" : "baisse"}`}>
      <IcoPente bas={!monte} />
      {monte ? "+" : "−"} {Math.abs(p)} %
    </span>
  );
}

/** Un chiffre secondaire : plus petit que le phare, jamais aussi gros. */
function Mesure({ titre, valeur, dessous, delta }:
  { titre: string; valeur: string; dessous: string; delta?: React.ReactNode }) {
  return (
    <div className="mesure">
      <span className="etiquette">{titre}</span>
      <span className="ligne-chiffre">
        <span className="chiffre num">{valeur}</span>
        {delta}
      </span>
      <span className="dessous">{dessous}</span>
    </div>
  );
}

/**
 * L'ETINCELLE : la forme de la periode, en trente pixels de haut.
 *
 * Elle ne remplace pas le graphe plus bas et ne porte aucun chiffre — elle
 * repond a « ca monte ou ca redescend » a cote du montant, sans faire descendre
 * l'oeil. C'est pour ca qu'elle n'a ni axe, ni grille, ni etiquette : tout ce
 * qu'on lui ajouterait la ferait rivaliser avec le vrai graphe.
 */
function Etincelle({ jours }: { jours: Jour[] }) {
  if (jours.length < 3) return null;
  const sommet = Math.max(1, ...jours.map((x) => x.ca));
  const x = (i: number) => (i / (jours.length - 1)) * 100;
  const y = (v: number) => 30 - (v / sommet) * 28;
  const trait = jours.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.ca)}`).join(" ");

  return (
    <svg className="etincelle" viewBox="0 0 100 30" preserveAspectRatio="none"
         role="img" aria-label={`Allure du chiffre d’affaires sur ${jours.length} jours`}>
      <path className="aire" d={`${trait} L100,30 L0,30 Z`} />
      <path className="trait" d={trait} />
    </svg>
  );
}

/**
 * UN PLAFOND ROND POUR L'ECHELLE.
 *
 * Elle se calait sur le meilleur jour : les reperes annonçaient « 74,00 € » puis
 * « 37,00 € », deux montants qu'on ne retient pas, qui changent a chaque
 * chargement et auxquels on ne compare rien. On monte donc au cran rond
 * au-dessus — 80 €, 150 €, 250 € — et la moitie tombe juste elle aussi.
 *
 * LES CRANS SONT SERRES, et c'est le point delicat. Avec l'echelle scolaire
 * 1-2-5-10, un meilleur jour a 210 € montait a 400 : la plus haute barre du
 * graphe occupait la moitie de la hauteur, et les trente autres s'ecrasaient au
 * ras de la ligne de base. Aucun cran de cette suite-ci ne laisse plus d'un
 * cinquieme de ciel au-dessus de la plus haute barre, et tous se divisent en
 * deux proprement — c'est le montant du repere du milieu.
 */
const CRANS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function plafond(max: number): number {
  if (max <= 0) return 100;
  const rang = 10 ** Math.floor(Math.log10(max));
  const tete = max / rang;
  return Math.round((CRANS.find((c) => c >= tete - 1e-9) ?? 10) * rang);
}

/**
 * JOUR PAR JOUR.
 *
 * ON NE COMPRENAIT RIEN, ET IL Y AVAIT QUATRE RAISONS A CELA.
 *
 * D'ABORD LE DESSIN NE S'AFFICHAIT PAS. Les reperes horizontaux portaient la
 * classe `grille` ; or `.grille` est, dans la feuille de style, une grille CSS
 * generique. Les trois montants se sont donc empiles en haut a gauche au lieu de
 * se poser sur leur ligne, et il ne restait a l'ecran que les bandes de
 * fin de semaine — qu'on lisait comme des barres. C'est l'accident decrit en
 * tete de `globals.css`, une cinquieme fois.
 *
 * ENSUITE RIEN NE DISAIT CE QU'ON MESURAIT. Ni le titre, ni l'axe : des barres
 * rouges, et au lecteur de deviner que c'etait du chiffre d'affaires. Une legende
 * nomme maintenant chacune des trois marques du graphe.
 *
 * PUIS L'ECHELLE ETAIT ILLISIBLE — « 37,00 € » a mi-hauteur — et surtout SANS
 * REFERENCE. Une barre ne se compare qu'aux autres barres, ce qui oblige a
 * parcourir tout le graphe pour juger une seule journee. La moyenne quotidienne
 * est desormais tracee en travers : au-dessus, la journee est bonne ; en dessous,
 * elle ne l'est pas. C'est la lecture qu'on vient chercher.
 *
 * ENFIN ON NE SITUAIT AUCUNE BARRE. Trois dates aux extremites pour trente
 * colonnes : impossible de dire de quel jour parle celle qui depasse. Il y en a
 * maintenant une tous les cinq jours, sous sa propre colonne, et le montant du
 * meilleur jour est ECRIT au-dessus de lui — survoler n'existe pas sur un
 * telephone, et c'est la que cet ecran se consulte.
 */
function SerieJours({ jours }: { jours: Jour[] }) {
  const sommet = plafond(Math.max(...jours.map((x) => x.ca)));
  const moyenne = Math.round(jours.reduce((s, d) => s + d.ca, 0) / jours.length);
  const meilleur = jours.reduce((a, b) => (b.ca > a.ca ? b : a), jours[0]);
  const creux = jours.filter((d) => d.ca === 0).length;
  const rangMeilleur = jours.findIndex((d) => d.ca === meilleur.ca);

  // Une date tous les N jours, COMPTEES DEPUIS LA FIN : trente etiquettes cote a
  // cote se chevauchent, trois ne situent plus rien — et c'est aujourd'hui, au
  // bout, qu'on veut voir marque.
  const pas = Math.max(1, Math.ceil(jours.length / 6));

  // Trois paliers : le sommet, sa moitie, la ligne de base. Une grille plus
  // dense rivalise avec les donnees au lieu de les servir.
  const paliers = [1, 0.5, 0];

  return (
    <figure className="serie">
      <div className="cadre">
        {paliers.map((f) => (
          <span key={f} className={`repere ${f === 0 ? "base" : ""}`} style={{ bottom: `${f * 100}%` }}>
            <b>{euros(Math.round(sommet * f))}</b>
          </span>
        ))}
        {moyenne > 0 ? (
          <span className="moyenne" style={{ bottom: `${(moyenne / sommet) * 100}%` }}>
            <b>moyenne {euros(moyenne)}</b>
          </span>
        ) : null}
        <div className="barres">
          {jours.map((d, i) => {
            const jour = new Date(`${d.jour}T00:00:00Z`).getUTCDay();
            const weekend = jour === 0 || jour === 6;
            const record = d.ca > 0 && i === rangMeilleur;
            return (
              <div key={d.jour}
                   className={`jour${weekend ? " weekend" : ""}${d.ca === 0 ? " nulle" : ""}`}
                   title={`${d.etiquette} · ${d.n} article${d.n > 1 ? "s" : ""} · ${euros(d.ca)}`}>
                <span className={`barre${record ? " haute" : ""}`}
                      style={{ height: d.ca === 0 ? 3 : `${Math.max(2, (d.ca / sommet) * 100)}%` }}>
                  {/* Colle au bord, l'etiquette sortirait de la carte : elle
                      s'aligne alors sur le cote de sa barre au lieu d'etre
                      centree dessus. */}
                  {record ? (
                    <b className={`valeur num${i > jours.length - 4 ? " fin"
                                              : i < 3 ? " debut" : ""}`}>
                      {euros(d.ca)}
                    </b>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Les dates partagent exactement le decoupage des barres : chaque case
          d'axe est sous sa colonne, remplie une fois sur `pas`. */}
      <div className="dates" aria-hidden="true">
        {jours.map((d, i) => (
          <span key={d.jour}>{(jours.length - 1 - i) % pas === 0 ? d.etiquette : ""}</span>
        ))}
      </div>

      <figcaption className="pied">
        <p className="cles">
          <span><i className="c-barre" /> chiffre d’affaires du jour</span>
          <span><i className="c-moyenne" /> moyenne : <b className="num">{euros(moyenne)}</b> par jour</span>
          <span><i className="c-weekend" /> samedi et dimanche</span>
        </p>
        <p className="note">
          Meilleur jour&nbsp;: <b>{meilleur.etiquette}</b> à <b className="num">{euros(meilleur.ca)}</b>
          {creux > 0 ? (
            <> · <b className="num">{creux}</b> jour{creux > 1 ? "s" : ""} sans aucune vente</>
          ) : null}
          {" "}sur les {jours.length} derniers jours.
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * LE CLASSEMENT DES BORNES.
 *
 * C'etait une estrade olympique : trois marches, la premiere au milieu, un socle
 * dont la hauteur disait le rang. Jolie, et fausse comme outil — elle ne montrait
 * que trois machines, poussait les suivantes dans une rangee qui defilait de
 * cote, prenait la moitie d'un ecran de telephone pour trois montants, et ne
 * disait jamais la seule chose qui compte apres le classement : quelle part du
 * chiffre chaque borne represente, et dans quel sens elle va.
 *
 * Une liste ordonnee dit tout cela, tient de une a cinquante machines sans
 * changer de forme, et se lit de haut en bas comme un classement se lit.
 */
function Classement({ bornes }: { bornes: ParBorne[] }) {
  const total = Math.max(1, bornes.reduce((s, b) => s + b.ca, 0));
  const sommet = Math.max(1, ...bornes.map((b) => b.ca));

  return (
    <ol className="classement">
      {bornes.map((b, i) => {
        const vivante = enLigne(b.vue_le);
        const part = Math.round((b.ca / total) * 100);
        return (
          <li key={b.id} className={i === 0 ? "tete" : ""}>
            <Link href={`/bornes/${b.id}`}>
              <span className="rang num">{i + 1}</span>

              <span className="qui">
                <span className="nom">{b.nom}</span>
                <span className="ou">{b.adresse ?? "lieu non renseigné"}</span>
                <span className="etats">
                  <span className={`pilule ${vivante ? "ok" : "mal"}`}>
                    <i />{vivante ? "en ligne" : `vue ${depuis(b.vue_le)}`}</span>
                  {b.vides > 0 ? <span className="pilule attente"><i />{b.vides} vides</span> : null}
                </span>
              </span>

              <span className="argent">
                <span className="ca num">{euros(b.ca)}</span>
                <span className="dessous">
                  <Delta ici={b.ca} avant={b.ca_avant} />
                  <span className="detail">{b.n} vendus · marge {euros(b.marge)}</span>
                </span>
              </span>

              <span className="part">
                <span className="piste">
                  <span style={{ width: `${Math.max(1, (b.ca / sommet) * 100)}%` }} />
                </span>
                <span className="pct num">{part} % du chiffre</span>
              </span>

            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Une reference en risque de rupture.
 *
 * Trois choses en un coup d'oeil : dans combien de jours, ou en est le stock sur
 * une piste COMMUNE de trente jours — deux barres ne se comparent que si elles
 * partagent leur echelle —, et surtout COMBIEN COMMANDER. C'est la seule ligne
 * qui se transforme en action ; sans elle, la liste ne fait que decrire.
 *
 * La couleur ne porte jamais seule : chaque etat porte son icone et son mot.
 */
function FicheRisque({ s }: { s: Autonomie }) {
  const jours = s.jours_restants ?? 0;
  const etat = jours <= 3 ? { cle: "critique", mot: "rupture imminente", couleur: "var(--critique)" }
             : jours <= 7 ? { cle: "serieux",  mot: "à commander",       couleur: "var(--serieux)" }
             :              { cle: "alerte",   mot: "à surveiller",      couleur: "var(--alerte)" };
  // Ramener a trente jours d'avance : c'est ce qu'on va chercher chez le
  // fournisseur, arrondi a la dizaine parce qu'on n'achete pas a l'unite.
  const cible = Math.ceil(Number(s.par_jour) * 30);
  const commander = Math.max(0, Math.ceil((cible - s.stock) / 10) * 10);

  return (
    <div className={`fiche ${etat.cle === "critique" ? "critique" : ""}`}>
      <div className="haut">
        <div style={{ minWidth: 0 }}>
          <div className="nom">{s.nom}</div>
          <div className="cat">{s.categorie} · {s.par_jour} par jour · {s.stock} en stock</div>
        </div>
        <div className="jours">
          <b style={{ color: etat.couleur }}>{jours}</b>
          <span>jours</span>
        </div>
      </div>

      <div className="piste" title="échelle commune : trente jours">
        <span style={{ width: `${Math.min(100, (jours / 30) * 100)}%`, background: etat.couleur }} />
      </div>

      <div className="pied">
        <span className="etat" style={{ color: etat.couleur }}>
          {jours <= 3 ? <IcoAlerte /> : <IcoHorloge />}{etat.mot}
        </span>
        {/* Le conseil devient un geste : la reception s'ouvre sur ce produit, la
            quantite deja posee. Un chiffre qu'il faut re-saisir ailleurs n'est
            qu'a moitie utile. */}
        {commander > 0 ? (
          <Link href={`/reception?p=${s.id}&q=${commander}`} className="commander lien-commander">
            commander ~{commander}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * La mise en route, dans l'ordre ou elle se fait.
 *
 * Chaque etape faite s'efface au profit de la suivante, et une seule est mise en
 * avant a la fois : une liste ou tout crie egalement ne dit pas par ou commencer.
 */
function PremiersPas({ a }: { a: Avancement }) {
  const etapes = [
    { fait: a.categories > 0, nom: "Créer vos catégories",
      quoi: "Elles rangent votre stock et fixent l’ordre dans lequel il se présente.",
      cta: "Créer une catégorie", vers: "/reglages/categories" },
    { fait: a.produits > 0, nom: "Remplir le catalogue",
      quoi: "Ce que vendent vos bornes : nom, prix, âge minimum.",
      cta: "Ajouter un produit", vers: "/reglages/catalogue" },
    { fait: a.recu > 0, nom: "Enregistrer une réception",
      quoi: "La marchandise que vous avez achetée entre dans votre réserve.",
      cta: "Enregistrer", vers: "/reception" },
    { fait: a.bornes > 0 && a.appairees > 0, nom: "Appairer une borne",
      quoi: "La machine affiche un code ; vous le portez ici depuis votre téléphone.",
      cta: "Appairer", vers: "/bornes/ajouter" },
    { fait: a.chargees > 0, nom: "Charger la borne",
      quoi: "Vous indiquez ce que vous ajoutez ; la machine confirme à sa prochaine synchro.",
      cta: "Charger", vers: "/bornes" },
  ];
  const suivante = etapes.findIndex((e) => !e.fait);

  return (
    <>
      <div className="carte">
        <div className="pas-a-pas">
          {etapes.map((e, i) => (
            <div key={e.nom}
                 className={`etape ${e.fait ? "faite" : i === suivante ? "suivante" : ""}`}>
              <span className="puce">{e.fait ? "✓" : i + 1}</span>
              <div className="corps">
                <div className="nom">{e.nom}</div>
                {!e.fait ? <div className="quoi">{e.quoi}</div> : null}
              </div>
              {!e.fait ? (
                <div className="fin">
                  <Link href={e.vers}
                        className={`bouton petit ${i === suivante ? "primaire" : ""}`}>
                    {e.cta}
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <p className="faible" style={{ fontSize: 13, marginTop: 14 }}>
        Dès la première vente remontée, cet écran laisse place au tableau de bord.
      </p>
    </>
  );
}
