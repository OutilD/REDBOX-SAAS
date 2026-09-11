import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "./chrome";
import { IcoAnalyses, IcoFleche } from "./icones";
import { q, euros } from "@/db";
import { utilisateur } from "@/lib/auth";
import { autonomie, avancement, comparaison, entete, FENETRES, periodeDe, serie,
         type Avancement, type Point } from "@/lib/tableau";
import { adresse, Delta } from "./analyses";

export const dynamic = "force-dynamic";

/**
 * Le tableau de bord.
 *
 * DEUX QUESTIONS, ET PAS UNE DE PLUS : combien ca rapporte et dans quel sens ca
 * va, et qu'est-ce qui demande une main tout de suite. Tout ce qui se lit en
 * prenant le temps — le decoupage du temps, le classement des RedBox, ce qui se
 * vend, ce qui va manquer — a sa propre page, « Analytiques ». Un tableau de
 * bord qu'on fait defiler n'est plus un tableau de bord.
 *
 * LE NIVEAU NE SUFFIT PAS, IL FAUT LA PENTE. « 3 240 € » ne dit rien tout seul :
 * c'est beaucoup ou c'est peu selon le mois d'avant, et c'est la seule chose
 * qu'on vient verifier en ouvrant cet ecran. Chaque chiffre qui compte porte donc
 * sa variation contre la meme fenetre, un cran plus tot.
 *
 * UNE SEULE CHOSE EST EN GRAND. Le chiffre d'affaires est le phare ; le reste
 * l'entoure, plus petit.
 */
export default async function Tableau(
  { searchParams }: { searchParams:
    Promise<{ f?: string; b?: string; du?: string; au?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");

  const { f, b, du, au } = await searchParams;

  /**
   * LA PERIODE, RESOLUE UNE FOIS POUR TOUTE LA PAGE.
   *
   * Les dates a la minute se saisissent sur la page des analytiques ; le
   * tableau de bord les accepte quand meme dans l'adresse, pour qu'un lien
   * garde son sens d'une page a l'autre.
   */
  const p = await periodeDe(f, du, au);
  const perso = p.cle === "perso";

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

  const lien = (chg: { f?: string } = {}) => adresse("/", p, choisie?.id ?? null, "", chg);
  const versAnalytiques = adresse("/analytiques", p, choisie?.id ?? null, "");

  const [avance, tete, avant, points, stocks] = await Promise.all([
    sienDuCompte ? avancement(u.compte_id) : null,
    entete(u.compte_id, p, portee),
    comparaison(u.compte_id, p, portee),
    serie(u.compte_id, p, portee),
    sienDuCompte ? autonomie(u.compte_id, p) : [],
  ]);

  // PAR JOUR, PAS PAR BARRE. C'etait `ca / nombre de barres` : juste tant qu'une
  // barre valait un jour, faux des qu'elle vaut une heure — quatre heures de
  // vente auraient annonce un « par jour » quatre fois trop petit.
  const parJourMoyen = Math.round(tete.ca / p.jours);
  const panier = tete.ventes ? Math.round(tete.ca / tete.ventes) : 0;
  const panierAvant = avant.ventes ? Math.round(avant.ca / avant.ventes) : 0;
  // Le taux de marge se lit mieux que la marge seule : quinze pour cent sur un
  // gros chiffre et quinze pour cent sur un petit se pilotent de la meme facon.
  const taux = tete.ca > 0 ? Math.round((tete.marge / tete.ca) * 100) : null;

  const risques = stocks.filter((s) => s.jours_restants !== null && s.jours_restants <= 21);
  const urgences = risques.filter((s) => (s.jours_restants ?? 99) <= 3);
  const aRacheter = risques.length - urgences.length;
  const muettes = Math.max(0, tete.bornes - tete.en_ligne - tete.jamais_appairees);

  /**
   * CE QUI DEMANDE UNE MAIN, RASSEMBLE ET CLASSE PAR GRAVITE.
   *
   * Une seule question — qu'est-ce que je fais maintenant — a un seul endroit,
   * et chaque ligne dit ce qu'il faut faire.
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
      quoi: `RedBox sans signe de vie`,
      pourquoi: "elles ne remontent plus leurs ventes ; le chiffre ci-dessus est incomplet",
      vers: "/bornes", faire: "Voir",
    },
    tete.canaux_vides > 0 && {
      cle: "vides", niveau: "moyen" as const, n: tete.canaux_vides,
      quoi: `canal${tete.canaux_vides > 1 ? "aux" : ""} vide${tete.canaux_vides > 1 ? "s" : ""}`,
      pourquoi: "de la place qui ne rapporte rien tant qu’elle reste vide",
      vers: "/charger", faire: "Réassortir",
    },
    // Le detail — autonomie, quantite a commander — est sur la page des
    // analytiques ; ici on ne dit que le nombre, et ou aller.
    aRacheter > 0 && {
      cle: "racheter", niveau: "doux" as const, n: aRacheter,
      quoi: `référence${aRacheter > 1 ? "s" : ""} à racheter d’ici trois semaines`,
      pourquoi: "au rythme de vente de la période, le stock ne tiendra pas",
      vers: `${versAnalytiques}#manque`, faire: "Voir",
    },
    tete.jamais_appairees > 0 && {
      cle: "appairer", niveau: "doux" as const, n: tete.jamais_appairees,
      quoi: `RedBox à appairer`,
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
        <Entete page="tableau" borne={choisie ? String(choisie.id) : ""}
                periode={p} />
        <main className="ecran">
          <h1>Bienvenue</h1>
          <p className="sous">
            Compte {u.compte} — voici ce qu’il reste à faire pour que vos RedBox se mettent
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
      <Entete page="tableau" borne={choisie ? String(choisie.id) : ""}
                periode={p} />
      <main className="ecran">
        {/*
          LA TETE : QUI, QUOI, QUAND — ET LE CHOIX DE LA FENETRE A COTE.

          Un segment, pas quatre boutons detaches : les quatre fenetres sont les
          quatre etats d'un meme reglage. Les dates a la minute ne sont pas ici —
          c'est un reglage d'analyse, il vit sur la page des analytiques.
        */}
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Tableau de bord</h1>
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
          </div>
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
            <Etincelle points={points} />
          </div>

          <div className="mesures">
            <Mesure titre="Marge estimée" valeur={euros(tete.marge)}
                    dessous={taux === null ? "—" : `${taux} % du chiffre`}
                    delta={<Delta ici={tete.marge} avant={avant.marge} />} />
            <Mesure titre="Articles vendus" valeur={String(tete.ventes)}
                    dessous={`${tete.bornes} RedBox · ${tete.en_ligne} en ligne`}
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
          LA PORTE VERS LE RESTE. Une seule, en bas : les graphes et les
          classements sont a un clic, avec la meme periode et la meme borne.
        */}
        <div className="actions-cle une">
          <Link href={versAnalytiques}>
            <span className="rond"><IcoAnalyses /></span>
            <span>
              <span className="titre">Analytiques</span>
              <span className="quoi">
                Jour par jour, classement des RedBox, ce qui se vend, ce qui va manquer
              </span>
            </span>
            <span className="fleche"><IcoFleche /></span>
          </Link>
        </div>
      </main>
      <NavBasse page="tableau" />
    </>
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
 * Elle ne porte aucun chiffre — elle repond a « ca monte ou ca redescend » a
 * cote du montant, sans faire descendre l'oeil. C'est pour ca qu'elle n'a ni
 * axe, ni grille, ni etiquette : le vrai graphe est sur la page des analytiques.
 */
function Etincelle({ points }: { points: Point[] }) {
  if (points.length < 3) return null;
  const sommet = Math.max(1, ...points.map((x) => x.ca));
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 30 - (v / sommet) * 28;
  const trait = points.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.ca)}`).join(" ");

  return (
    <svg className="etincelle" viewBox="0 0 100 30" preserveAspectRatio="none"
         role="img" aria-label="Allure du chiffre d’affaires sur la période">
      <path className="aire" d={`${trait} L100,30 L0,30 Z`} />
      <path className="trait" d={trait} />
    </svg>
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
      quoi: "Ce que vendent vos RedBox : nom, prix, âge minimum.",
      cta: "Ajouter un produit", vers: "/reglages/catalogue" },
    { fait: a.recu > 0, nom: "Enregistrer une réception",
      quoi: "La marchandise que vous avez achetée entre dans votre réserve.",
      cta: "Enregistrer", vers: "/reception" },
    { fait: a.bornes > 0 && a.appairees > 0, nom: "Appairer une RedBox",
      quoi: "La machine affiche un code ; vous le portez ici depuis votre téléphone.",
      cta: "Appairer", vers: "/bornes/ajouter" },
    { fait: a.chargees > 0, nom: "Réassortir la RedBox",
      quoi: "Vous indiquez ce que vous ajoutez ; la machine confirme à sa prochaine synchro.",
      cta: "Réassortir", vers: "/charger" },
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
