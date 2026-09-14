"use client";

import { useEffect, useState } from "react";
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
  const image = `/badges/${forme}.png`;
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    import("./piece3d/apercus")
      .then((m) => m.apercu({ image, rang, obtenu }))
      .then((u) => { if (vivant) setPhoto(u); })
      .catch(() => { /* sans WebGL, l'objet seul */ });
    return () => { vivant = false; };
  }, [image, rang, obtenu]);

  const grand = taille >= 30;
  return (
    <span className={`embleme ${rang}${obtenu ? "" : " eteint"}${grand ? " grand" : ""}${photo ? " piece" : ""}`}
          style={{ width: taille, height: taille }}
          title={titre} aria-hidden={titre ? undefined : true}>
      {grand && obtenu ? <span className="embleme-aura" aria-hidden /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo ?? image} alt="" width={taille} height={taille} draggable={false} />
    </span>
  );
}
