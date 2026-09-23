"use client";

import { useEffect, useRef, useState } from "react";
import type { Forme, Rang } from "@/lib/communaute";

/**
 * UN BADGE, C'EST UNE PIECE.
 *
 * Dans une grille, une carte ou un fil, le badge est la photo de sa piece en
 * 3D, de trois quarts : metal du palier, objet en relief et en couleur sur
 * l'avers (`piece3d/moteur.ts`). La photo est prise dans le navigateur par un
 * rendu partage (`piece3d/apercus.ts`), charge a la demande ; en attendant, ou
 * sans WebGL, l'objet du badge s'affiche seul.
 *
 * Les objets viennent de 3dicons (3dicons.co, licence CC0 : usage commercial
 * libre, sans attribution), dans `public/badges/<forme>.png`. Les vignettes du
 * site ont un fond blanc opaque : les fichiers ont ete DETOURES (fond efface
 * depuis les bords, contour adouci). Un objet retelecharge tel quel ferait une
 * plaque carree en relief sur la piece.
 */
export function Badge({ forme, obtenu = true, taille = 44, titre, rang = "legendaire" }:
  { forme: Forme; obtenu?: boolean; taille?: number; titre?: string;
    /** Le palier donne le metal de la piece. Sans lui, l'or. */
    rang?: Rang }) {
  // L'objet en 400 px pour les grandes pieces ; une vignette WebP de 96 px —
  // vingt fois plus legere — pour tout ce qui s'affiche petit : une page de
  // communaute en montre soixante-huit.
  const image = `/badges/${forme}.png`;
  const affichee = taille <= 96 ? `/badges/petit/${forme}.webp` : taille <= 192 ? `/badges/moyen/${forme}.webp` : image;
  // La texture de la piece 3D : 192 px suffisent pour une piece de moins de
  // cent pixels ; l'original de 400 px, vingt-neuf fois, faisait 2 Mo.
  const texture = taille <= 96 ? `/badges/moyen/${forme}.webp` : image;
  const [photo, setPhoto] = useState<string | null>(null);
  const boite = useRef<HTMLSpanElement>(null);

  // LA PIECE EN 3D NE SE PHOTOGRAPHIE QUE SUR ORDINATEUR, ET SEULEMENT QUAND
  // ON LA VOIT. Le rendu WebGL — et les 500 Ko de three.js qu'il faut pour
  // le faire — se lancait pour chaque badge au chargement, telephone compris :
  // c'est ce qui faisait saccader la page de la communaute. Au telephone,
  // l'objet seul ; sur ordinateur, la piece, une fois la tuile a l'ecran et
  // le navigateur au repos.
  useEffect(() => {
    const el = boite.current;
    // Une piece eteinte — un badge pas encore gagne — reste un objet plat :
    // seuls les badges obtenus meritent la 3D, et ils sont dix fois moins nombreux.
    if (!el || !obtenu || !window.matchMedia("(min-width: 980px) and (hover: hover)").matches) return;
    let vivant = true;
    let arret: (() => void) | undefined;
    const vue = new IntersectionObserver(([x]) => {
      if (!x.isIntersecting) return;
      vue.disconnect();
      const lancer = () => {
        if (!vivant) return;
        import("./piece3d/apercus")
          .then((m) => m.apercu({ image: texture, rang, obtenu }))
          .then((u) => { if (vivant) setPhoto(u); })
          .catch(() => { /* sans WebGL, l'objet seul */ });
      };
      // Safari n'a pas requestIdleCallback : un court delai fait le meme office.
      const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
      if (typeof w.requestIdleCallback === "function") {
        const id = w.requestIdleCallback(lancer, { timeout: 2000 });
        arret = () => w.cancelIdleCallback?.(id);
      } else {
        const id = window.setTimeout(lancer, 300);
        arret = () => window.clearTimeout(id);
      }
    }, { rootMargin: "120px" });
    vue.observe(el);
    return () => { vivant = false; vue.disconnect(); arret?.(); };
  }, [image, texture, rang, obtenu]);

  const grand = taille >= 30;
  return (
    <span ref={boite} className={`embleme ${rang}${obtenu ? "" : " eteint"}${grand ? " grand" : ""}${photo ? " piece" : ""}`}
          style={{ width: taille, height: taille }}
          title={titre} aria-hidden={titre ? undefined : true}>
      {grand && obtenu ? <span className="embleme-aura" aria-hidden /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo ?? affichee} alt="" width={taille} height={taille} draggable={false} loading="lazy" decoding="async" />
    </span>
  );
}
