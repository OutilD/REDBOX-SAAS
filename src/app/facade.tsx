import type { Position } from "@/lib/machine";
import { PICTOS } from "@/lib/pictos";
import Rotation3D from "./rotation-3d";

export type Vue = "grille" | "2d" | "3d";

/** « RedBox — Le Duplex » se lit « Le Duplex » sous la marque : pas deux fois RedBox. */
function sansMarque(nom: string): string {
  return nom.replace(/^\s*redbox\s*[—–-]\s*/i, "").trim() || nom;
}

/**
 * LES SPIRALES, A LEUR PLACE.
 *
 * Trois facons de les montrer, toujours dans l'ordre de la machine — la 101 en
 * haut a gauche, la 502 en bas a droite :
 *
 *   - LA GRILLE, sobre, celle qu'on lit le plus vite ;
 *   - LA MACHINE EN 2D, telle qu'on la voit porte ouverte : un caisson noir qui
 *     porte son nom, une vitrine, cinq plateaux de tole ou courent les spirales
 *     rouges et leurs produits, le rail de la porte a droite, le bac de retrait
 *     et le boitier en bas ;
 *   - LA MEME EN 3D, avec ses flancs et son dessus, qu'on fait tourner du doigt.
 *
 * Chaque ecran decide de ce qu'il pose sur une spirale ; le dessin, lui, ne
 * change pas. Le caisson reste noir dans les deux themes : c'est un objet, et
 * une RedBox est noire.
 */
export function Facade<T>({ rangs, colonnes, legende, rendre, vue = "grille", nom }: {
  rangs: Position<T>[][]; colonnes: number; legende?: string;
  rendre: (p: Position<T>) => React.ReactNode; vue?: Vue;
  /** Le nom de la machine, sur sa plaque : on sait devant laquelle on est. */
  nom?: string;
}) {
  const places = (rang: Position<T>[]) => rang.map((p) => (
    <div className="place" key={p.lane} style={{ gridColumn: p.colonne }}>
      {rendre(p)}
    </div>
  ));

  if (vue === "grille") {
    return (
      <div className="facade" role="group" aria-label={legende}
           style={{ "--colonnes": colonnes } as React.CSSProperties}>
        {rangs.map((rang) => <div className="rang" key={rang[0].rangee}>{places(rang)}</div>)}
      </div>
    );
  }

  const machine = (
    <div className="machine" role="group" aria-label={legende}>
      <div className="caisson">
        {/* Les faces qu'on ne voit qu'en 3D : les deux flancs et le dessus. */}
        <i className="flanc gauche" aria-hidden />
        <i className="flanc droit" aria-hidden />
        <i className="dessus" aria-hidden />
        {nom ? (
          <div className="plaque">
            <span className="marque" aria-hidden>REDBOX</span>
            <span className="nom-borne">{sansMarque(nom)}</span>
          </div>
        ) : null}
        <div className="vitrine">
          {rangs.map((rang) => (
            <div className="etagere" key={rang[0].rangee}
                 style={{ "--colonnes": colonnes } as React.CSSProperties}>
              {places(rang)}
            </div>
          ))}
        </div>
        {/* Le bas de la machine : le bac de retrait a volet, le boitier
            d'alimentation avec son ventilateur et ses voyants. Du decor. */}
        <div className="socle" aria-hidden>
          <div className="bac"><span>Retrait</span></div>
          <div className="boitier">
            <span className="ventilateur" />
            <span className="voyants"><i /><i /><i /><i /></span>
          </div>
        </div>
      </div>
    </div>
  );
  return vue === "3d" ? <Rotation3D>{machine}</Rotation3D> : machine;
}

/**
 * L'ECHELLE COMMUNE : une spirale de dix places remplit sa case. Toutes sont
 * dessinees a cette echelle — une spirale de six est plus courte, comme sur la
 * machine ; une de vingt serre ses tours.
 */
const REFERENCE = 10;
const PAS = 16;

type Produit = { image: number | string | null; icone: string | null; nom: string };

/**
 * UNE SPIRALE, EN FIL ROUGE, AVEC SES PRODUITS DEDANS.
 *
 * AUTANT DE TOURS QUE DE PLACES, AUTANT DE PRODUITS QU'EN STOCK : une spirale
 * de capacite 10 qui en porte 7 montre dix tours et sept produits, du devant
 * vers le moteur. Le fil est dessine en deux moities — l'arriere sombre, l'avant
 * vif — et l'avant passe devant les produits : ils sont pris dans la spirale,
 * comme dans la machine.
 *
 * `id` distingue la decoupe des photos d'une spirale a l'autre : les
 * identifiants SVG sont communs a toute la page.
 */
export function Spire({ id, capacite, quantite, produit }: {
  id: number | string; capacite: number; quantite: number; produit?: Produit | null;
}) {
  const n = Math.max(1, Math.min(Math.round(capacite) || 1, 60));
  const pleins = produit ? Math.min(Math.max(Math.round(quantite), 0), n) : 0;
  const utile = REFERENCE * PAS;
  const pas = Math.min(PAS, utile / n);
  const largeur = utile + 24, cy = 21, ry = 15, rx = Math.min(5.4, pas * .34);
  const debut = 9, fin = debut + n * pas;
  const tours = Array.from({ length: n }, (_, i) => debut + i * pas);
  const incline = (cx: number) => `rotate(-16 ${cx} ${cy})`;
  const L = Math.max(2, pas - 3), H = 18, y = cy - H / 2;
  const picto = produit?.icone ? PICTOS.find((x) => x.cle === produit.icone) : undefined;
  const decoupe = `article-${id}`;
  const epais = pas < 10 ? 0.7 : 1;
  return (
    <svg className="spire" viewBox={`0 0 ${largeur} 42`} preserveAspectRatio="xMinYMax meet" aria-hidden>
      <defs>
        <clipPath id={decoupe} clipPathUnits="objectBoundingBox">
          <rect width="1" height="1" rx=".16" ry=".12" />
        </clipPath>
      </defs>
      <line className="axe" x1="3" y1={cy} x2={fin} y2={cy} />
      {tours.map((cx) => (
        <path key={`d${cx}`} className="dos" transform={incline(cx)} strokeWidth={2.2 * epais}
              d={`M ${cx} ${cy - ry} A ${rx} ${ry} 0 0 1 ${cx} ${cy + ry}`} />
      ))}
      {produit ? tours.slice(0, pleins).map((cx) => {
        const x = cx + 1.5;
        return (
          <g key={`a${cx}`} className="article">
            <rect className="boite" x={x} y={y} width={L} height={H} rx="2" />
            {produit.image ? (
              <image href={`/api/image/${produit.image}`} x={x} y={y} width={L} height={H}
                     preserveAspectRatio="xMidYMid slice" clipPath={`url(#${decoupe})`} />
            ) : picto ? (
              <svg className="picto" x={x + 1} y={y + 2} width={Math.max(1, L - 2)} height={H - 4} viewBox="0 0 48 48"
                   fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                {picto.traces.map((t, i) => <path key={i} d={t.d} fill={t.plein ? "currentColor" : "none"} />)}
              </svg>
            ) : L >= 6 ? (
              <text className="lettre" x={x + L / 2} y={cy + 3.2}>
                {produit.nom.trim().slice(0, 1).toUpperCase() || "?"}
              </text>
            ) : null}
            <rect className="reflet" x={x} y={y} width={L} height={H} rx="2" />
          </g>
        );
      }) : null}
      {tours.map((cx) => (
        <path key={`f${cx}`} className="face" transform={incline(cx)} strokeWidth={2.8 * epais}
              d={`M ${cx} ${cy + ry} A ${rx} ${ry} 0 0 1 ${cx} ${cy - ry}`} />
      ))}
      {/* Le moteur, au bout de la spirale. */}
      <rect className="moteur-ombre" x={fin} y={cy - 13} width="12" height="26" rx="2.5" />
      <rect className="moteur" x={fin} y={cy - 13} width="10" height="24" rx="2" />
    </svg>
  );
}

/**
 * LE PRODUIT SE RECONNAIT AVANT DE SE LIRE.
 *
 * Devant la machine ouverte, le carton qu'on a en main porte une photo, pas un
 * nom de catalogue : la meme image dans la case dit « c'est ici » plus vite que
 * « Puff Menthe glaciale 600 ». Photo d'abord, pictogramme de la borne sinon,
 * initiale en dernier recours.
 */
export function Visuel({ image, icone, nom }:
  { image: number | string | null; icone: string | null; nom: string }) {
  if (image) {
    return (
      <span className="visuel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/image/${image}`} alt="" loading="lazy" />
      </span>
    );
  }
  const p = icone ? PICTOS.find((x) => x.cle === icone) : undefined;
  return (
    <span className="visuel" aria-hidden>
      {p ? (
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.6}
             strokeLinecap="round" strokeLinejoin="round">
          {p.traces.map((t, i) => <path key={i} d={t.d} fill={t.plein ? "currentColor" : "none"} />)}
        </svg>
      ) : (
        <span className="initiale">{nom.trim().slice(0, 1).toUpperCase() || "?"}</span>
      )}
    </span>
  );
}
