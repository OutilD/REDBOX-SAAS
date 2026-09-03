"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IcoBorne, IcoChevron, IcoCoche, IcoLoupe } from "./icones";

export type Machine = { id: number; nom: string };

/**
 * LE SELECTEUR DE BORNE, AVEC RECHERCHE.
 *
 * Un `<select>` ne se cherche pas. Tant qu'un exploitant a trois machines c'est
 * sans consequence ; a trente, derouler une liste pour trouver « Le Sous-Sol »
 * est un travail. On ouvre donc un vrai menu, avec un champ en tete qui filtre
 * a la frappe.
 *
 * LE SANS-JAVASCRIPT RESTE SERVI. La console doit marcher sur le telephone
 * qu'on a en main dans un bar mal couvert : ce bouton porte `avec-script` et
 * disparait sans JS, ou le `<noscript>` de l'entete rend le vieux formulaire.
 * Il rechargeait, mais il marchait.
 *
 * LES CHOIX SONT DES LIENS, pas des appels au routeur. Chaque ligne est une
 * adresse complete — on peut l'ouvrir dans un onglet, la mettre en favori,
 * l'envoyer a quelqu'un. Un `router.push` aurait rendu la meme page et perdu
 * tout cela.
 */
export function SelecteurBorne(
  { machines, borne, fenetre, base }:
  { machines: Machine[]; borne?: string; fenetre?: string; base: string }) {

  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState("");
  const cadre = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);

  const choisie = machines.find((m) => String(m.id) === borne) ?? null;

  // On ferme au clic dehors et a Echap. Sans ca, un menu ouvert suit
  // l'utilisateur d'un bout a l'autre de la page.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (cadre.current && !cadre.current.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", touche);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", touche);
    };
  }, [ouvert]);

  // Le champ prend le curseur a l'ouverture : on ouvre ce menu POUR chercher.
  useEffect(() => { if (ouvert) champ.current?.focus(); }, [ouvert]);

  const q = filtre.trim().toLowerCase();
  const vues = q ? machines.filter((m) => m.nom.toLowerCase().includes(q)) : machines;
  const vers = (id: string) =>
    `${base}?${fenetre ? `f=${fenetre}&` : ""}${id ? `b=${id}` : ""}`.replace(/[?&]$/, "");

  return (
    <div className="borne-chip avec-script" ref={cadre} data-ouvert={ouvert ? "" : undefined}>
      <button type="button" className="declencheur" aria-haspopup="listbox"
              aria-expanded={ouvert} onClick={() => { setOuvert(!ouvert); setFiltre(""); }}>
        <span className="glyphe" aria-hidden="true"><IcoBorne size={15} /></span>
        <span className="nom">{choisie ? choisie.nom : "Toutes les bornes"}</span>
        <span className="chevron" aria-hidden="true"><IcoChevron size={14} /></span>
      </button>

      {ouvert ? (
        <div className="menu" role="listbox" aria-label="Choisir une borne">
          {/*
            LE CHAMP EST TOUJOURS LA.

            Je l'avais conditionne a cinq machines — au-dessous, la liste tient
            d'un coup d'oeil et un champ vide serait du bruit. C'est le meme
            raisonnement qui avait rendu ce selecteur invisible sur un compte a
            une borne : juste sur le papier, et faux devant quelqu'un qui cherche
            ce qu'on vient de lui promettre. Un champ inutile se voit ; un champ
            absent se cherche.
          */}
          <div className="chercher">
            <span aria-hidden="true"><IcoLoupe size={15} /></span>
            <input ref={champ} type="search" value={filtre} placeholder="Chercher une borne…"
                   onChange={(e) => setFiltre(e.target.value)}
                   aria-label="Chercher une borne" />
          </div>

          <div className="choix">
            <Link href={vers("")} role="option" aria-selected={!choisie}
                  className={!choisie ? "actif" : ""} onClick={() => setOuvert(false)}>
              <span className="etiquette">Toutes les bornes</span>
              {!choisie ? <IcoCoche size={15} /> : null}
            </Link>

            {vues.map((m) => (
              <Link key={m.id} href={vers(String(m.id))} role="option"
                    aria-selected={choisie?.id === m.id}
                    className={choisie?.id === m.id ? "actif" : ""}
                    onClick={() => setOuvert(false)}>
                <span className="etiquette">{m.nom}</span>
                {choisie?.id === m.id ? <IcoCoche size={15} /> : null}
              </Link>
            ))}

            {vues.length === 0 ? (
              <p className="rien">Aucune borne ne porte ce nom.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
