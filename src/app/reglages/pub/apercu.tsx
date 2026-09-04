"use client";

import { useEffect, useState } from "react";

/**
 * L'APERCU QUI DEFILE.
 *
 * Ce que la borne montrera, en petit, avec les vraies durees. On ne cherche pas
 * a impressionner : on cherche a ce que quelqu'un reconnaisse sa campagne sans
 * l'ouvrir, et remarque tout de suite la photo de travers ou celle en double.
 *
 * Le montage n'est pas fidele a la seconde pres et n'a pas a l'etre — mais les
 * durees relatives le sont, sinon une image reglee a vingt secondes passerait
 * ici aussi vite qu'une a trois, et le reglage n'aurait plus l'air de servir.
 *
 * Sans JavaScript, le premier media reste affiche, fixe. Une vignette immobile
 * vaut mieux qu'un cadre vide.
 */

export type Vu = { id: number; genre: "image" | "video"; duree_s: number; nom: string };

/**
 * LA HAUTEUR EST AU CSS, PLUS AU STYLE EN LIGNE.
 *
 * Elle etait posee ici, en dur, sur l'element : `style` bat toujours une feuille
 * de style, et la vignette refusait donc de se reduire sur un telephone — la
 * requete media changeait sa largeur, jamais sa hauteur, et le cadre sortait de
 * ses proportions. `.vignette` porte deja 76 px par defaut ; personne ne
 * demandait autre chose.
 */
export default function Apercu({ medias }: { medias: Vu[] }) {
  const [i, poser] = useState(0);

  useEffect(() => {
    if (medias.length < 2) return;
    const m = medias[Math.min(i, medias.length - 1)];
    // Les videos ne sont pas jouees ici : on leur accorde un temps de passage
    // fixe. Lire dix films en parallele dans une page de gestion couterait plus
    // cher que tout le reste de l'application.
    const ms = (m.genre === "video" ? 4 : Math.max(2, m.duree_s)) * 1000;
    const t = setTimeout(() => poser((n) => (n + 1) % medias.length), ms);
    return () => clearTimeout(t);
  }, [i, medias]);

  if (medias.length === 0) {
    return (
      <div className="vignette">
        <span className="genre">vide</span>
      </div>
    );
  }

  const actuel = medias[Math.min(i, medias.length - 1)];

  return (
    <div className="vignette defile">
      {medias.map((m, n) => (
        m.genre === "image"
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={m.id} src={`/api/pub/${m.id}`} alt={m.nom}
                 className={n === i ? "vu" : ""} />
          : <video key={m.id} src={`/api/pub/${m.id}`} muted playsInline preload="metadata"
                   className={n === i ? "vu" : ""} />
      ))}
      {medias.length > 1 ? (
        <span className="compteur">{i + 1}/{medias.length}</span>
      ) : null}
      {actuel.genre === "video" ? <span className="genre">vidéo</span> : null}
    </div>
  );
}
