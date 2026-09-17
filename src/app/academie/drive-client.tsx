"use client";

import { useEffect, useRef, useState } from "react";
import { IcoTelecharger } from "../icones";

export type Photo = { id: string; nom: string; petite: string; grande: string; telecharger: string };

/**
 * LES PHOTOS D'UN DOSSIER DRIVE, VUES SUR PLACE.
 *
 * Une grille de vignettes ; au toucher, la photo en grand, et l'on passe a la
 * suivante d'un glissement ou des fleches du clavier. Drive n'est jamais
 * ouvert : c'est tout l'interet.
 *
 * Chaque vignette reste un LIEN vers la grande photo : sans JavaScript, ou
 * d'un clic du milieu, elle s'ouvre dans un onglet.
 */
export function Photos({ photos }: { photos: Photo[] }) {
  const boite = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState<number | null>(null);
  const depart = useRef<number | null>(null);
  const n = photos.length;
  const aller = (d: number) => setI((x) => (x === null ? x : (x + d + n) % n));

  // La voisine se charge avant qu'on la demande : le glissement ne montre pas de blanc.
  useEffect(() => {
    if (i === null || n < 2) return;
    new Image().src = photos[(i + 1) % n].grande;
  }, [i, n, photos]);

  const p = i === null ? null : photos[i];
  return (
    <>
      <ul className={n === 1 ? "aca-photos seule" : "aca-photos"}>
        {photos.map((ph, j) => (
          <li key={ph.id}>
            <a href={ph.grande} target="_blank" rel="noopener noreferrer" aria-label={`Agrandir : ${ph.nom}`}
               onClick={(e) => {
                 if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                 e.preventDefault();
                 setI(j);
                 boite.current?.showModal();
               }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.petite} alt={ph.nom} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            </a>
          </li>
        ))}
      </ul>

      <dialog ref={boite} className="aca-visionneuse" aria-label="Photo"
              onClose={() => setI(null)}
              onClick={(e) => { if (e.target === e.currentTarget) boite.current?.close(); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") aller(1);
                if (e.key === "ArrowLeft") aller(-1);
              }}>
        {p ? (
          <>
            <div className="barre">
              <span className="num">{i! + 1} / {n}</span>
              <span className="nom">{p.nom}</span>
              <a className="bouton petit discret" href={p.telecharger} aria-label="Télécharger" title="Télécharger">
                <IcoTelecharger size={16} />
              </a>
              <button type="button" className="bouton petit discret" aria-label="Fermer"
                      onClick={() => boite.current?.close()}>✕</button>
            </div>
            <div className="scene"
                 onClick={(e) => { if (e.target === e.currentTarget) boite.current?.close(); }}
                 onTouchStart={(e) => { depart.current = e.touches[0].clientX; }}
                 onTouchEnd={(e) => {
                   if (depart.current === null) return;
                   const dx = e.changedTouches[0].clientX - depart.current;
                   depart.current = null;
                   if (Math.abs(dx) > 50) aller(dx < 0 ? 1 : -1);
                 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={p.id} src={p.grande} alt={p.nom} referrerPolicy="no-referrer" />
              {n > 1 ? (
                <>
                  <button type="button" className="fleche avant" aria-label="Photo précédente" onClick={() => aller(-1)}>‹</button>
                  <button type="button" className="fleche apres" aria-label="Photo suivante" onClick={() => aller(1)}>›</button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}

/**
 * UN DOCUMENT DRIVE, LU SANS QUITTER L'ACADEMIE : l'apercu de Drive — PDF,
 * Word, Google Docs — dans une boite. Le cadre ne se charge qu'a l'ouverture.
 * Sans JavaScript, le lien ouvre l'apercu dans un onglet.
 */
export function Apercu({ nom, cadre, classe = "bouton petit" }: { nom: string; cadre: string; classe?: string }) {
  const boite = useRef<HTMLDialogElement>(null);
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <a href={cadre} target="_blank" rel="noopener noreferrer" className={classe}
         onClick={(e) => {
           if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
           e.preventDefault();
           setOuvert(true);
           boite.current?.showModal();
         }}>
        Ouvrir
      </a>
      <dialog ref={boite} className="modale aca-apercu-drive" onClose={() => setOuvert(false)}
              onClick={(e) => { if (e.target === boite.current) boite.current?.close(); }}>
        <div className="modale-tete">
          <h2>{nom}</h2>
          <button type="button" className="bouton petit discret fermeture"
                  aria-label="Fermer" onClick={() => boite.current?.close()}>✕</button>
        </div>
        {ouvert ? <iframe src={cadre} title={nom} allow="autoplay; fullscreen" /> : null}
      </dialog>
    </>
  );
}
