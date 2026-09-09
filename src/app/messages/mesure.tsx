"use client";

import { useEffect } from "react";

/**
 * La hauteur de l'en-tete, en variable CSS.
 *
 * L'en-tete est collant, et sa hauteur change : le bandeau de la demo s'y
 * ajoute, et il se replie sur deux lignes au telephone. La colonne des salons
 * et la tete du fil se collent SOUS lui — il faut donc savoir ou il finit,
 * et seule la page le sait une fois rendue.
 */
export default function MesureEntete() {
  useEffect(() => {
    const poser = () => {
      const h = document.querySelector<HTMLElement>(".entete")?.offsetHeight ?? 58;
      document.documentElement.style.setProperty("--entete-h", `${h}px`);
    };
    poser();
    window.addEventListener("resize", poser);
    return () => window.removeEventListener("resize", poser);
  }, []);
  return null;
}
