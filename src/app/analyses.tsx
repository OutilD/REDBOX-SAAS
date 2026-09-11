import Link from "next/link";
import { euros, depuis, enLigne } from "@/db";
import { IcoAlerte, IcoHorloge, IcoPente } from "./icones";
import { DEFAUT, type Autonomie, type ParBorne, type Pas, type Periode,
         type Point } from "@/lib/tableau";

/**
 * Les briques partagees par le tableau de bord et la page des analytiques.
 *
 * Le tableau de bord ne garde que les chiffres et ce qui demande une main ; les
 * graphes, les classements et l'autonomie ont leur propre page. Les deux
 * ecrans filtrent sur la meme periode et la meme borne, et dessinent la
 * variation de la meme facon — c'est ici que ca vit, une seule fois.
 */

/**
 * L'adresse d'une des deux pages, un reglage change.
 *
 * `f: ""` efface la periode sur mesure et remet la fenetre par defaut : sans
 * ce cas, cliquer « 30 jours » aurait garde `du`/`au` dans l'adresse, qui
 * gagnent toujours — les boutons de periode auraient cesse de repondre.
 */
export function adresse(base: string, p: Periode, borne: number | null, vue: string,
                        chg: { f?: string; vue?: string } = {}): string {
  const a = new URLSearchParams();
  const perso = p.cle === "perso";
  const fe = chg.f ?? (perso ? "" : p.cle);
  if (chg.f === undefined && perso) {
    a.set("du", p.saisie.du); a.set("au", p.saisie.au);
  } else if (fe && fe !== DEFAUT.cle) {
    a.set("f", fe);
  }
  if (borne) a.set("b", String(borne));
  const v = chg.vue ?? vue;
  if (v) a.set("vue", v);
  const q = a.toString();
  return q ? `${base}?${q}` : base;
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
export function Delta({ ici, avant }: { ici: number; avant: number }) {
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
const MOT: Record<Pas, { un: string; des: string; du: string }> = {
  hour:  { un: "heure",   des: "heures",   du: "de l’heure" },
  day:   { un: "jour",    des: "jours",    du: "du jour" },
  week:  { un: "semaine", des: "semaines", du: "de la semaine" },
  month: { un: "mois",    des: "mois",     du: "du mois" },
};

export function SerieTemps({ points, pas }: { points: Point[]; pas: Pas }) {
  const mot = MOT[pas];
  const sommet = plafond(Math.max(...points.map((x) => x.ca)));
  const moyenne = Math.round(points.reduce((s, d) => s + d.ca, 0) / points.length);
  const meilleur = points.reduce((a, b) => (b.ca > a.ca ? b : a), points[0]);
  const creux = points.filter((d) => d.ca === 0).length;
  const rangMeilleur = points.findIndex((d) => d.ca === meilleur.ca);

  // Une etiquette toutes les N colonnes, COMPTEES DEPUIS LA FIN : trente cote a
  // cote se chevauchent, trois ne situent plus rien — et c'est le bout, le plus
  // recent, qu'on veut voir marque.
  const saut = Math.max(1, Math.ceil(points.length / 6));

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
          {points.map((d, i) => {
            // Le samedi et le dimanche sont marques par la base, dans le fuseau
            // des chiffres : les relire ici depuis la date du seau les faisait
            // basculer d'un jour selon l'heure.
            const record = d.ca > 0 && i === rangMeilleur;
            return (
              <div key={d.cle}
                   className={`jour${d.weekend ? " weekend" : ""}${d.ca === 0 ? " nulle" : ""}`}
                   title={`${d.etiquette} · ${d.n} article${d.n > 1 ? "s" : ""} · ${euros(d.ca)}`}>
                <span className={`barre${record ? " haute" : ""}`}
                      style={{ height: d.ca === 0 ? 3 : `${Math.max(2, (d.ca / sommet) * 100)}%` }}>
                  {/* Colle au bord, l'etiquette sortirait de la carte : elle
                      s'aligne alors sur le cote de sa barre au lieu d'etre
                      centree dessus. */}
                  {record ? (
                    <b className={`valeur num${i > points.length - 4 ? " fin"
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
        {points.map((d, i) => (
          <span key={d.cle}>{(points.length - 1 - i) % saut === 0 ? d.etiquette : ""}</span>
        ))}
      </div>

      <figcaption className="pied">
        <p className="cles">
          <span><i className="c-barre" /> chiffre d’affaires {mot.du}</span>
          <span><i className="c-moyenne" /> moyenne : <b className="num">{euros(moyenne)}</b> par {mot.un}</span>
          {/* Le liseret des fins de semaine ne veut rien dire sur des barres
              hebdomadaires : chacune en contient une. */}
          {pas === "week" || pas === "month"
            ? null : <span><i className="c-weekend" /> samedi et dimanche</span>}
        </p>
        <p className="note">
          Meilleur{pas === "week" ? "e" : ""} {mot.un}&nbsp;: <b>{meilleur.etiquette}</b> à{" "}
          <b className="num">{euros(meilleur.ca)}</b>
          {creux > 0 ? (
            <> · <b className="num">{creux}</b> {creux > 1 ? mot.des : mot.un} sans aucune vente</>
          ) : null}
          {" "}sur {points.length} {mot.des}.
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
export function Classement({ bornes }: { bornes: ParBorne[] }) {
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
export function FicheRisque({ s }: { s: Autonomie }) {
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
