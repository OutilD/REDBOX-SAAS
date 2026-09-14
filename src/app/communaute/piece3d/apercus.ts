import { ScenePiece, type RangPiece } from "./moteur";

/**
 * LES PIECES D'UNE GRILLE SONT DES PHOTOS DE PIECES.
 *
 * Un navigateur n'ouvre qu'une quinzaine de contextes WebGL a la fois : vingt-
 * quatre pieces vivantes dans la collection, et les premieres s'eteignent. Les
 * vignettes sont donc photographiees par UN seul rendu cache, de trois quarts
 * pour qu'on voie la tranche, puis servies comme de simples images. Seules la
 * fiche et la revelation font tourner une piece en direct.
 *
 * Les photos passent une par une (une file), et chacune n'est prise qu'une fois
 * par page : le cache garde la promesse, pas seulement le resultat.
 */

const TAILLE = 320;
let scene: ScenePiece | null = null;
let toile: HTMLCanvasElement | null = null;
let file: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<string>>();

export function apercu(o: { image: string; rang: RangPiece; obtenu: boolean }): Promise<string> {
  const cle = `${o.image}|${o.rang}|${o.obtenu}`;
  const deja = cache.get(cle);
  if (deja) return deja;

  const p = file.then(async () => {
    if (!scene || !toile) {
      toile = document.createElement("canvas");
      scene = new ScenePiece(toile, true);
      scene.dimensionner(TAILLE, TAILLE, 1);
    }
    await scene.poser({ ...o, nom: "", distinction: "", date: null, points: 0 }, 512);
    scene.orienter(0.14, -0.45);
    scene.rendre();
    const t = toile;
    return new Promise<string>((ok) => {
      t.toBlob((b) => ok(b ? URL.createObjectURL(b) : t.toDataURL("image/png")), "image/webp", 0.92);
    });
  });
  file = p.catch(() => undefined);
  cache.set(cle, p);
  return p;
}
