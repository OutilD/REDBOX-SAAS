"use client";

import { useState } from "react";

/**
 * UNE VIDEO QUI NE CHARGE RIEN AVANT QU'ON APPUIE.
 *
 * Le lecteur YouTube pese pres d'un megaoctet et depose ses biscuits des
 * l'affichage ; sur la 4G d'un bar, une lecon a trois videos mettrait des
 * secondes a devenir lisible. On montre la vignette et un bouton ; le lecteur
 * n'arrive qu'au toucher, et demarre aussitot.
 *
 * C'est un LIEN vers la video : sans JavaScript, ou avec un clic du milieu,
 * elle s'ouvre sur YouTube.
 */
export default function Video({ embed, vignette, lien, fournisseur, titre }: {
  embed: string; vignette: string | null; lien: string;
  fournisseur: "youtube" | "vimeo"; titre: string | null;
}) {
  const [joue, setJoue] = useState(false);
  const nom = fournisseur === "youtube" ? "YouTube" : "Vimeo";
  return (
    <div className="ecran-video">
      {joue ? (
        <iframe src={embed} title={titre ?? `Vidéo ${nom}`} allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <a href={lien} className="facade" target="_blank" rel="noopener noreferrer"
           aria-label={`Lire la vidéo${titre ? ` : ${titre}` : ""}`}
           onClick={(e) => {
             if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
             e.preventDefault();
             setJoue(true);
           }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {vignette ? <img src={vignette} alt="" loading="lazy" decoding="async" /> : null}
          <span className="lecture" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg>
          </span>
          <span className="fournisseur">{nom}</span>
        </a>
      )}
    </div>
  );
}
