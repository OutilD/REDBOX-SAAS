"use client";

import { useEffect } from "react";

/** Un champ qui ouvre le clavier : tant qu'il a le focus, on ne compense rien. */
function estChamp(el: Element | null): boolean {
  return Boolean(el?.matches(
    "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]), textarea, select, [contenteditable=true]"));
}

/**
 * LA BARRE DU BAS RESTE EN BAS SUR IPHONE.
 *
 * Dans l'application installee (iOS 26), apres la fermeture du clavier —
 * « Chercher une machine » — ou quand la hauteur de la fenetre change en
 * defilant, iOS garde une fenetre de mise en page plus courte que l'ecran. Tout
 * ce qui est fixe en bas se cale sur elle : la navigation flottait au milieu de
 * l'ecran, la liste continuait dessous, et l'en-tete collant sortait par le
 * haut. Retirer le flou de la barre n'a pas suffi : le decalage est dans la
 * fenetre, pas dans la barre.
 *
 * DEUX GESTES :
 *
 *   1. On mesure l'ecart entre ce qu'on voit (`visualViewport`) et la fenetre
 *      de mise en page, et on le pose en variables CSS : `--ecart-bas` pour ce
 *      qui est fixe en bas, `--ecart-haut` pour l'en-tete. Les elements le
 *      compensent par `translate`, qui se compose avec leurs propres
 *      transformations au lieu de les ecraser.
 *
 *   2. Quand le clavier se ferme, un defilement d'un pixel aller-retour oblige
 *      iOS a recalculer la fenetre. Sans lui, elle reste courte jusqu'au
 *      prochain geste.
 *
 * Clavier ouvert ou page zoomee, on ne compense rien : la barre peut rester
 * derriere le clavier, et suivre un zoom la ferait glisser sous le doigt.
 * Ailleurs qu'iOS, les deux ecarts valent zero : rien ne bouge.
 */
export default function HauteurEcran() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const racine = document.documentElement;
    let raf = 0;
    // Poser une propriete sur la racine recalcule le style de TOUTE la page :
    // on ne le fait que si la valeur a change — au telephone, le viewport
    // « defile » a chaque image quand la barre d'adresse se replie.
    const dernier = { bas: -1, haut: -1 };
    const mesurer = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const neutre = estChamp(document.activeElement) || vv.scale > 1.01;
        const bas = neutre ? 0 : Math.round(vv.height + vv.offsetTop - window.innerHeight);
        const haut = neutre ? 0 : Math.round(vv.offsetTop);
        const b = Math.max(0, bas), h = Math.max(0, haut);
        if (b !== dernier.bas) { dernier.bas = b; racine.style.setProperty("--ecart-bas", `${b}px`); }
        if (h !== dernier.haut) { dernier.haut = h; racine.style.setProperty("--ecart-haut", `${h}px`); }
      });
    };

    let minuterie = 0;
    const recaler = () => {
      window.clearTimeout(minuterie);
      // Le focus passe peut-etre a un autre champ : on laisse le tour se finir.
      minuterie = window.setTimeout(() => {
        if (estChamp(document.activeElement)) return;
        const x = window.scrollX, y = window.scrollY;
        window.scrollTo(x, y + 1);
        requestAnimationFrame(() => { window.scrollTo(x, y); mesurer(); });
      }, 150);
    };

    vv.addEventListener("resize", mesurer);
    vv.addEventListener("scroll", mesurer);
    window.addEventListener("orientationchange", mesurer);
    window.addEventListener("pageshow", mesurer);
    document.addEventListener("focusin", mesurer);
    document.addEventListener("focusout", recaler);
    mesurer();

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(minuterie);
      vv.removeEventListener("resize", mesurer);
      vv.removeEventListener("scroll", mesurer);
      window.removeEventListener("orientationchange", mesurer);
      window.removeEventListener("pageshow", mesurer);
      document.removeEventListener("focusin", mesurer);
      document.removeEventListener("focusout", recaler);
    };
  }, []);
  return null;
}
