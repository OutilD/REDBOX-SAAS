"use client";

import { useEffect, useRef, useState } from "react";
import { IcoLoupe } from "../icones";

/** Sans accents ni casse : « equipe » trouve « Équipe ». */
const pli = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * CHERCHER UN SALON. La liste est rendue par le serveur ; la recherche ne fait
 * que masquer ce qui ne correspond pas, et replie les sections videes. Sans
 * JavaScript, le champ n'apparait pas et la liste reste entiere.
 *
 * « / » place le curseur dans le champ, comme sur Slack ou GitHub.
 */
export default function RechercheSalons() {
  const [texte, poser] = useState("");
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mots = pli(texte.trim()).split(/\s+/).filter(Boolean);
    const liste = document.querySelector(".messagerie .salons nav");
    if (!liste) return;
    let trouves = 0;
    liste.querySelectorAll<HTMLElement>("[data-cherche]").forEach((el) => {
      const ok = mots.every((m) => pli(el.dataset.cherche ?? "").includes(m));
      el.hidden = !ok;
      if (ok) trouves++;
    });
    liste.querySelectorAll<HTMLDetailsElement>("details.groupe-salons").forEach((d) => {
      const visibles = d.querySelectorAll("[data-cherche]:not([hidden])").length;
      d.hidden = visibles === 0;
      if (mots.length > 0 && visibles > 0) d.open = true;
    });
    const vide = liste.querySelector<HTMLElement>(".aucun-salon");
    if (vide) vide.hidden = trouves > 0;
  }, [texte]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))) return;
      e.preventDefault();
      champ.current?.focus();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);

  return (
    <label className="recherche-salons">
      <IcoLoupe size={16} />
      <span className="lecteur-seul">Chercher un salon</span>
      <input ref={champ} type="search" value={texte} placeholder="Chercher un salon"
             onChange={(e) => poser(e.target.value)}
             onKeyDown={(e) => { if (e.key === "Escape") { poser(""); e.currentTarget.blur(); } }} />
      <kbd aria-hidden="true">/</kbd>
    </label>
  );
}
