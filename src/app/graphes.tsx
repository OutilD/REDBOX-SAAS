import { euros } from "@/db";

/**
 * Les graphiques.
 *
 * En SVG, ecrits a la main. Les couleurs viennent de la palette categorielle de
 * reference, prises DANS L'ORDRE et jamais recyclees, et passees au validateur
 * pour les deux fonds. Trois teintes claires passent sous 3:1 sur fond blanc :
 * chaque marque porte donc son libelle et sa valeur ecrits a cote — la couleur
 * ne signifie jamais seule.
 */
export const TEINTES = ["var(--s1)", "var(--s2)", "var(--s3)",
                        "var(--s4)", "var(--s5)", "var(--s6)"] as const;

export function teinte(i: number): string {
  // Au-dela de six, on ne fabrique pas une teinte : on retombe sur le gris et le
  // libelle porte l'identite. Une couleur inventee ressemble a une des six.
  return i < TEINTES.length ? TEINTES[i] : "var(--texte-3)";
}

/**
 * `rang` est la place de la categorie dans l'ordre du catalogue, PAS son
 * classement par chiffre d'affaires.
 *
 * La couleur suit l'entite, jamais son rang : si elle suivait le classement, une
 * categorie qui passe deuxieme changerait de teinte, et le meme nom porterait deux
 * couleurs selon le graphe qu'on regarde.
 */
export type Serie = { cle: string; nom: string; total: number; unites: number;
                      valeurs: number[]; rang: number };

/**
 * Courbes multiples.
 *
 * Hauteur fixe, largeur libre : le repere est en pourcentages et le SVG s'etire,
 * mais `vector-effect` garde des traits de 2 px et TOUT LE TEXTE EST EN HTML.
 * Un SVG mis a l'echelle avec son texte dedans donne, sur un ecran large, des
 * libelles enormes qui se chevauchent.
 *
 * Pas de second axe, jamais : deux echelles sur un meme cadre font dire au dessin
 * ce qu'on veut. Ici tout est en euros.
 */
export function Courbes({ seaux, series }:
  { seaux: { seau: string; etiquette: string }[]; series: Serie[] }) {

  if (seaux.length < 2 || series.length === 0) return null;

  const sommet = Math.max(1, ...series.flatMap((s) => s.valeurs));
  const x = (i: number) => (i / (seaux.length - 1)) * 100;
  const y = (v: number) => 100 - (v / sommet) * 100;

  // Trois reperes suffisent a donner l'echelle. Une grille dense rivalise avec
  // les donnees au lieu de les servir.
  const paliers = [sommet, sommet / 2, 0];

  return (
    <>
      <div className="cadre-graphe">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
             aria-label={`Évolution des ventes par catégorie sur ${seaux.length} périodes`}>
          {paliers.map((p, i) => (
            <line key={i} className="grille-h" x1="0" x2="100" y1={y(p)} y2={y(p)} />
          ))}
          {series.map((s) => (
            <path key={s.cle} className="ligne" stroke={teinte(s.rang)}
                  d={s.valeurs.map((v, j) => `${j === 0 ? "M" : "L"}${x(j)},${y(v)}`).join(" ")} />
          ))}
        </svg>
        {paliers.slice(0, 2).map((p, i) => (
          <span key={i} className="palier" style={{ top: `${y(p)}%` }}>{euros(Math.round(p))}</span>
        ))}
      </div>
      <div className="axe-graphe">
        <span>{seaux[0].etiquette}</span>
        <span>{seaux.at(-1)!.etiquette}</span>
      </div>
      <div className="legende-viz">
        {series.map((s) => (
          <span key={s.cle}>
            <i style={{ background: teinte(s.rang) }} />
            {s.nom} <b>{euros(s.total)}</b>
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Barres classees.
 *
 * Le libelle et la valeur sont sur LA MEME LIGNE, au-dessus de la barre. Un
 * libelle a gauche et sa valeur a l'autre bout d'une piste de 900 px, ce sont
 * deux informations qu'on ne rapproche plus.
 */
export function BarresClassees({ series }: { series: Serie[] }) {
  const sommet = Math.max(1, ...series.map((s) => s.total));
  const total = series.reduce((s, x) => s + x.total, 0);

  return (
    <div className="barres-rang">
      {series.map((s) => (
        <div className="rang" key={s.cle}>
          <div className="tete">
            <span className="puce" style={{ background: teinte(s.rang) }} />
            <span className="nom">{s.nom}</span>
            <span className="val">{euros(s.total)}</span>
          </div>
          <div className="piste">
            <span style={{ width: `${(s.total / sommet) * 100}%`, background: teinte(s.rang) }} />
          </div>
          <div className="bas">
            {Math.round((s.total / Math.max(1, total)) * 100)} % du chiffre · {s.unites} vendus
          </div>
        </div>
      ))}
    </div>
  );
}
