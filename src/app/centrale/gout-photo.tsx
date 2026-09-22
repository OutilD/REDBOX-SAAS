"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LA PHOTO D'UN GOUT, QU'ON AGRANDIT D'UN CLIC.
 *
 * La vignette est un lien vers l'image elle-meme : sans JavaScript, elle
 * s'ouvre dans un onglet, et c'est deja l'agrandir. Avec, le clic ouvre une
 * fenetre par-dessus la page — la photo en grand, le nom du gout — que la
 * croix, Echap ou un clic a cote referment.
 */
export default function GoutPhoto({ image_id, nom, taille = 44 }: { image_id: number; nom: string; taille?: number }) {
  const [ouverte, ouvrir] = useState(false);
  const fenetre = useRef<HTMLDialogElement>(null);
  const src = `/api/image/${image_id}`;

  useEffect(() => {
    const d = fenetre.current;
    if (ouverte && d && !d.open) d.showModal();
  }, [ouverte]);

  return (
    <>
      <a href={src} target="_blank" rel="noopener" className="ctr-gout-vignette"
         title={`Agrandir la photo de ${nom}`}
         onClick={(e) => { e.preventDefault(); ouvrir(true); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Photo : ${nom}`} width={taille} height={taille} loading="lazy" decoding="async" />
      </a>
      {ouverte ? (
        <dialog ref={fenetre} className="ctr-gout-grand" onClose={() => ouvrir(false)}
                onClick={(e) => { if (e.target === fenetre.current) fenetre.current?.close(); }}
                aria-label={`Photo de ${nom}`}>
          <div className="cadre">
            <button type="button" className="fermer" aria-label="Fermer" onClick={() => fenetre.current?.close()}>×</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Photo : ${nom}`} decoding="async" />
            <p>{nom}</p>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
