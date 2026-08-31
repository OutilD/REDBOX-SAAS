"use client";

import { useEffect } from "react";

/**
 * Le retour d'attente sur les boutons.
 *
 * Un seul ecouteur, pose une fois sur le document, plutot qu'un composant a
 * envelopper autour de chaque formulaire : il y en a une vingtaine, et celui
 * qu'on oublierait serait justement celui qui frustre.
 *
 * On NE DESACTIVE PAS le bouton. Un `disabled` pose pendant la soumission fait
 * perdre son `name`/`value` au bouton qui l'a declenchee — et plusieurs de nos
 * formulaires s'en servent (« Supprimer » porte l'identifiant de la ligne). On
 * neutralise donc les clics suivants par le style, ce qui protege du double
 * envoi sans toucher aux donnees envoyees.
 *
 * Le verrou se leve tout seul au bout de quinze secondes : si la navigation
 * echoue, l'ecran ne doit pas rester bloque pour toujours.
 */
export default function Occupe() {
  useEffect(() => {
    const LEVEE_MS = 15_000;

    const liberer = (el: Element) => {
      el.classList.remove("occupe");
      el.removeAttribute("aria-busy");
      el.closest("form")?.classList.remove("forme-occupee");
    };

    const marquer = (el: Element | null) => {
      if (!el || el.classList.contains("occupe")) return;
      el.classList.add("occupe");
      el.setAttribute("aria-busy", "true");
      el.closest("form")?.classList.add("forme-occupee");
      window.setTimeout(() => liberer(el), LEVEE_MS);
    };

    const surEnvoi = (e: Event) => {
      const forme = e.target as HTMLFormElement;
      const sub = (e as SubmitEvent).submitter;
      marquer(sub ?? forme.querySelector("button[type=submit], button:not([type])"));
    };

    // Un lien de navigation peut lui aussi mettre une seconde a repondre.
    // On ignore ceux qui ouvrent ailleurs ou qui sont modifies au clavier :
    // ils ne remplacent pas la page, donc rien n'attend.
    const surClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element)?.closest?.("a.bouton, a.produit-ligne, a.lieu-ligne");
      if (!a || (a as HTMLAnchorElement).target === "_blank") return;
      marquer(a);
    };

    // La page a change : plus rien n'attend.
    const surRetour = () => document.querySelectorAll(".occupe").forEach(liberer);

    document.addEventListener("submit", surEnvoi, true);
    document.addEventListener("click", surClic, true);
    window.addEventListener("pageshow", surRetour);
    return () => {
      document.removeEventListener("submit", surEnvoi, true);
      document.removeEventListener("click", surClic, true);
      window.removeEventListener("pageshow", surRetour);
    };
  }, []);

  return null;
}
