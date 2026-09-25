"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IcoChevron, IcoCoche, IcoLoupe } from "./icones";

export type Option = { valeur: string; nom: string; detail?: string };

/**
 * UN CHOIX DE FORMULAIRE, AVEC RECHERCHE.
 *
 * Le `<select>` du systeme ne se cherche pas, et ne se dessine pas : il sort
 * gris sur un ecran noir, avec la fleche de chaque navigateur. Celui-ci a le
 * dessin du selecteur de RedBox (`selecteur-borne.tsx`) — la meme liste, le
 * meme champ de recherche en tete, la meme coche —, mais il remplit un
 * formulaire au lieu de changer de page : la valeur part dans un champ cache
 * qui porte `name`.
 *
 * AU CLAVIER : les fleches parcourent, Entree choisit, Echap ferme. La frappe
 * filtre sur le nom et sur le detail (« Bar Le Central », ou son adresse).
 *
 * SANS JAVASCRIPT, le `<select>` d'origine : il est rendu par le serveur et
 * remplace a l'hydratation. Le formulaire marche dans les deux cas.
 *
 * Un changement de valeur emet `change` sur le champ cache, comme un vrai
 * champ : ce qui ecoute le formulaire (l'apercu de la vitrine) l'entend.
 */
export function Choix({ name, options, defaut, id, requis, invite = "Choisir…", recherche = "Chercher…",
                        chercher = true }: {
  name: string; options: Option[]; defaut?: string | number; id?: string; requis?: boolean;
  /** Ce qu'on lit tant que rien n'est choisi. */
  invite?: string;
  recherche?: string;
  /** Le champ de recherche, pour une longue liste. Une liste de six se lit d'un coup d'oeil. */
  chercher?: boolean;
}) {
  const auto = useId();
  const ident = id ?? auto;
  const [monte, setMonte] = useState(false);
  const [valeur, setValeur] = useState(defaut === undefined ? "" : String(defaut));
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [survol, setSurvol] = useState(0);
  const cadre = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const cache = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const premier = useRef(true);

  useEffect(() => setMonte(true), []);

  // Le champ cache annonce son changement, comme le ferait un vrai champ.
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    cache.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [valeur]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (cadre.current && !cadre.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const q = filtre.trim().toLowerCase();
  const vues = q ? options.filter((o) => `${o.nom} ${o.detail ?? ""}`.toLowerCase().includes(q)) : options;
  const choisie = options.find((o) => o.valeur === valeur) ?? null;

  // A l'ouverture, le curseur va dans la recherche et la ligne choisie est en vue.
  useEffect(() => {
    if (!ouvert) return;
    const i = Math.max(0, options.findIndex((o) => o.valeur === valeur));
    setSurvol(i);
    (chercher ? champ.current : liste.current)?.focus();
    requestAnimationFrame(() => liste.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  useEffect(() => { setSurvol(0); }, [filtre]);
  useEffect(() => {
    liste.current?.querySelector<HTMLElement>(`[data-i="${survol}"]`)?.scrollIntoView({ block: "nearest" });
  }, [survol]);

  if (!monte) {
    return (
      <select id={ident} name={name} defaultValue={valeur} required={requis}>
        {valeur === "" ? <option value="" disabled>{invite}</option> : null}
        {options.map((o) => <option key={o.valeur} value={o.valeur}>{o.nom}{o.detail ? ` · ${o.detail}` : ""}</option>)}
      </select>
    );
  }

  const prendre = (o: Option) => { setValeur(o.valeur); setOuvert(false); setFiltre(""); };
  const touche = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOuvert(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSurvol((s) => Math.min(vues.length - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSurvol((s) => Math.max(0, s - 1)); }
    if (e.key === "Enter") { e.preventDefault(); if (vues[survol]) prendre(vues[survol]); }
  };

  return (
    <div className="choix-champ" ref={cadre} data-ouvert={ouvert ? "" : undefined}>
      {/* Un champ texte cache, et non `hidden` : `required` y est verifie par le navigateur. */}
      <input ref={cache} className="choix-valeur" name={name} value={valeur} required={requis}
             tabIndex={-1} aria-hidden onChange={() => {}}
             onInvalid={() => setOuvert(true)} />
      <button type="button" id={ident} className="declencheur" aria-haspopup="listbox" aria-expanded={ouvert}
              onClick={() => { setOuvert(!ouvert); setFiltre(""); }}
              onKeyDown={(e) => { if (!ouvert && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setOuvert(true); } }}>
        <span className={`nom${choisie ? "" : " sans-choix"}`}>
          {choisie ? choisie.nom : invite}
          {choisie?.detail ? <span className="detail">{choisie.detail}</span> : null}
        </span>
        <span className="chevron" aria-hidden><IcoChevron size={14} /></span>
      </button>

      {ouvert ? (
        <div className="menu" onKeyDown={touche}>
          {chercher ? (
            <div className="chercher">
              <span aria-hidden><IcoLoupe size={15} /></span>
              <input ref={champ} type="search" value={filtre} placeholder={recherche} aria-label={recherche}
                     role="combobox" aria-expanded aria-controls={`${ident}-liste`} aria-autocomplete="list"
                     aria-activedescendant={vues[survol] ? `${ident}-o${survol}` : undefined}
                     onChange={(e) => setFiltre(e.target.value)} />
            </div>
          ) : null}
          <div className="choix" role="listbox" id={`${ident}-liste`} ref={liste} tabIndex={-1}>
            {vues.map((o, i) => (
              <button type="button" key={o.valeur} id={`${ident}-o${i}`} data-i={i} role="option"
                      aria-selected={o.valeur === valeur} tabIndex={-1}
                      className={`${o.valeur === valeur ? "actif" : ""}${i === survol ? " survol" : ""}`}
                      onMouseEnter={() => setSurvol(i)} onClick={() => prendre(o)}>
                <span className="etiquette">
                  {o.nom}
                  {o.detail ? <span className="detail">{o.detail}</span> : null}
                </span>
                {o.valeur === valeur ? <IcoCoche size={15} /> : null}
              </button>
            ))}
            {vues.length === 0 ? <p className="rien">Rien ne correspond.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
