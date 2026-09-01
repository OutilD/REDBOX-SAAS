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

export default function Apercu({ medias, hauteur = 76 }: { medias: Vu[]; hauteur?: number }) {
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
      <div className="vignette" style={{ height: hauteur }}>
        <span className="genre">vide</span>
      </div>
    );
  }

  const actuel = medias[Math.min(i, medias.length - 1)];

  return (
    <div className="vignette defile" style={{ height: hauteur }}>
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
