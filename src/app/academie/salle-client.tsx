"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IcoImprimer, IcoSommaire } from "../icones";

/** Le biscuit du sommaire replie, lu par le serveur au prochain rendu (`salle.tsx`). */
const BISCUIT_SOMMAIRE = "rbx_aca_sommaire";

/**
 * REPLIER LE SOMMAIRE, SUR GRAND ECRAN. L'etat est un attribut de la salle et
 * un biscuit : rien ne clignote au rechargement. Au telephone le sommaire est
 * un tiroir, ouvert par une case a cocher — sans JavaScript du tout.
 */
export function BasculeSommaire({ depart }: { depart: boolean }) {
  const [ferme, poser] = useState(depart);
  const mot = ferme ? "Afficher le sommaire" : "Masquer le sommaire";
  return (
    <>
      <button type="button" className="bouton icone aca-bascule-bureau" title={mot} aria-label={mot}
              aria-expanded={!ferme} aria-controls="aca-sommaire"
              onClick={() => {
                const suivant = !ferme;
                document.getElementById("aca-salle")?.toggleAttribute("data-sommaire-ferme", suivant);
                document.cookie = suivant
                  ? `${BISCUIT_SOMMAIRE}=ferme; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 3600}`
                  : `${BISCUIT_SOMMAIRE}=; Path=/; SameSite=Lax; Max-Age=0`;
                poser(suivant);
              }}>
        <IcoSommaire />
      </button>
      <label htmlFor="aca-tiroir" className="bouton icone aca-bascule-tiroir" title="Sommaire" aria-label="Ouvrir le sommaire">
        <IcoSommaire />
      </label>
    </>
  );
}

/** Le fil de lecture : combien de la lecon a defile, en une ligne rouge sous la barre du cours. */
export function BarreLecture() {
  const [pct, poser] = useState(0);
  useEffect(() => {
    let attente = 0;
    const mesurer = () => {
      attente = 0;
      const el = document.querySelector<HTMLElement>(".aca-lecture");
      if (!el) return;
      const haut = el.getBoundingClientRect().top + window.scrollY;
      const parcours = el.offsetHeight - window.innerHeight * 0.6;
      const p = parcours > 0 ? (window.scrollY - haut + 120) / parcours : 1;
      poser(Math.max(0, Math.min(1, p)));
    };
    const demander = () => { if (!attente) attente = requestAnimationFrame(mesurer); };
    mesurer();
    window.addEventListener("scroll", demander, { passive: true });
    window.addEventListener("resize", demander);
    return () => {
      window.removeEventListener("scroll", demander);
      window.removeEventListener("resize", demander);
      if (attente) cancelAnimationFrame(attente);
    };
  }, []);
  return (
    <span className="aca-fil-lecture" aria-hidden="true">
      <span style={{ transform: `scaleX(${pct})` }} />
    </span>
  );
}

/**
 * LES FLECHES DU CLAVIER : lecon precedente, lecon suivante. Jamais quand on
 * ecrit, jamais avec un modificateur — Alt+fleche reste l'historique.
 */
export function Raccourcis({ avant, apres }: { avant: string | null; apres: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))) return;
      if (e.key === "ArrowLeft" && avant) router.push(avant);
      else if (e.key === "ArrowRight" && apres) router.push(apres);
      else if (e.key === "Escape") {
        const t = document.getElementById("aca-tiroir") as HTMLInputElement | null;
        if (t?.checked) t.checked = false;
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [avant, apres, router]);
  return null;
}

/** Imprimer le certificat. */
export function Imprimer() {
  return (
    <button type="button" className="bouton primaire" onClick={() => window.print()}>
      <IcoImprimer /> Imprimer ou enregistrer en PDF
    </button>
  );
}
