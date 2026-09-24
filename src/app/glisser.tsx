"use client";

import { useEffect } from "react";

/**
 * CLASSER EN GLISSANT, A LA SOURIS.
 *
 * Les listes qui se classent — modules, lecons, blocs, ressources, rayons,
 * fournisseurs — ont leurs fleches « monter / descendre » : un pas a la fois,
 * un aller-retour serveur a chaque pas. Sur ordinateur on prend la ligne et on
 * la pose ou l'on veut ; le nouvel ordre part en une fois.
 *
 * Un seul ecouteur sur le document, comme pour les formulaires : une liste se
 * declare par `data-glisser` (la route), `data-action` (l'action a poster),
 * `data-prefixe` (ce qui precede l'identifiant dans l'`id` de chaque ligne) et,
 * s'il faut, `data-retour`. Rien d'autre a ecrire dans la page. Les fleches
 * restent : au doigt, et sans JavaScript, c'est elles qui classent.
 */
export default function Glisser() {
  useEffect(() => {
    // Le glisser HTML n'existe pas au doigt : on ne promet rien au telephone.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const rangees = (c: HTMLElement): HTMLElement[] =>
      [...c.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.id.startsWith(c.dataset.prefixe ?? "\u0000"));

    const preparer = () => {
      document.querySelectorAll<HTMLElement>("[data-glisser]").forEach((c) => {
        for (const r of rangees(c)) if (!r.classList.contains("glissable")) { r.draggable = true; r.classList.add("glissable"); }
      });
    };

    let pris: HTMLElement | null = null;
    let conteneur: HTMLElement | null = null;
    const ligneSous = (t: EventTarget | null) =>
      (t instanceof Element ? t.closest<HTMLElement>("[data-glisser] > .glissable") : null);
    const nettoyer = () => conteneur?.querySelectorAll(".glisser-avant, .glisser-apres").forEach((r) => r.classList.remove("glisser-avant", "glisser-apres"));
    const fin = () => { nettoyer(); pris?.classList.remove("glisser-en-cours"); pris = null; conteneur = null; };

    const surDebut = (e: DragEvent) => {
      const t = e.target;
      // Un champ de texte se selectionne, il ne se deplace pas.
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) { e.preventDefault(); return; }
      const r = ligneSous(t);
      if (!r) return;
      pris = r; conteneur = r.parentElement;
      r.classList.add("glisser-en-cours");
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.id); }
    };
    const surDessus = (e: DragEvent) => {
      if (!pris) return;
      const r = ligneSous(e.target);
      if (!r || r.parentElement !== conteneur) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const b = r.getBoundingClientRect();
      const apres = e.clientY > b.top + b.height / 2;
      nettoyer();
      if (r !== pris) r.classList.add(apres ? "glisser-apres" : "glisser-avant");
    };
    const surDepot = (e: DragEvent) => {
      if (!pris) return;
      const r = ligneSous(e.target);
      if (!r || r.parentElement !== conteneur) { fin(); return; }
      e.preventDefault();
      if (r !== pris) {
        r.insertAdjacentElement(r.classList.contains("glisser-apres") ? "afterend" : "beforebegin", pris);
        envoyer(conteneur!);
      }
      fin();
    };

    /** Le nouvel ordre, en un formulaire que le script des formulaires envoie sans recharger. */
    const envoyer = (c: HTMLElement) => {
      const prefixe = c.dataset.prefixe ?? "";
      const ids = rangees(c).map((r) => r.id.slice(prefixe.length)).filter((x) => /^\d+$/.test(x));
      const forme = document.createElement("form");
      forme.method = "post"; forme.action = c.dataset.glisser ?? ""; forme.hidden = true;
      const champ = (nom: string, valeur: string) => {
        const i = document.createElement("input"); i.type = "hidden"; i.name = nom; i.value = valeur; forme.appendChild(i);
      };
      champ("action", c.dataset.action ?? "ordonner");
      champ("ids", ids.join(","));
      if (c.dataset.retour) champ("retour", c.dataset.retour);
      document.body.appendChild(forme);
      forme.requestSubmit();
      setTimeout(() => forme.remove(), 0);
    };

    preparer();
    // Les pages changent sans rechargement : ce qui arrive se prepare aussi.
    let prevu = 0;
    const veille = new MutationObserver(() => { cancelAnimationFrame(prevu); prevu = requestAnimationFrame(preparer); });
    veille.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("dragstart", surDebut);
    document.addEventListener("dragover", surDessus);
    document.addEventListener("drop", surDepot);
    document.addEventListener("dragend", fin);
    return () => {
      veille.disconnect();
      document.removeEventListener("dragstart", surDebut);
      document.removeEventListener("dragover", surDessus);
      document.removeEventListener("drop", surDepot);
      document.removeEventListener("dragend", fin);
    };
  }, []);
  return null;
}
