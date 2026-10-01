"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { GRAVITE, NOM_ETAT, enEuros, santeDuPoint, stadeDuPoint } from "@/lib/etats-carte";
import { STATUTS, nomDuStatut } from "@/lib/statuts";
import type { Groupe, Point } from "./carte-france";
import { IcoCible, IcoPleinEcran } from "../icones";

/** La metropole et la Corse, quand il n'y a rien a montrer. */
const FRANCE: [[number, number], [number, number]] = [[41.2, -5.4], [51.3, 9.9]];

/** En deca, une ville fait un carre ; a partir de la, chaque machine a le sien, a sa place. */
const ZOOM_RUE = 13;

/** Au survol d'une ville, les machines nommees ; les autres sont dans la bulle qu'on ouvre. */
const MACHINES_SURVOL = 6;

function html(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c));
}

/**
 * LE CARRE D'UNE REDBOX. Sa couleur dit le stade — rouge installee, bleu
 * bientot, ambre commandee, vert libre, violet en production — et le carre
 * d'une ville qui en melange plusieurs est raye de chacune, a proportion. La
 * sante d'une machine installee passe dans une pastille au coin. Avec un
 * chiffre, c'est une ville. Sans stade, le carre reste rouge.
 */
export function carreRedbox(taille: number, etat?: string | null, n?: number, stades?: string[]): string {
  const parts = STATUTS
    .map((s) => ({ cle: s.cle, k: (stades ?? []).filter((x) => x === s.cle).length }))
    .filter((s) => s.k > 0);
  const total = parts.reduce((t, p) => t + p.k, 0);
  let attribut = "";
  let fond = "";
  if (parts.length === 1) {
    attribut = ` data-stade="${parts[0].cle}"`;
  } else if (parts.length > 1) {
    let de = 0;
    fond = ";background:linear-gradient(90deg," + parts.map((p) => {
      const a = de;
      de += (p.k / total) * 100;
      return `var(--stade-${p.cle}) ${a.toFixed(1)}% ${de.toFixed(1)}%`;
    }).join(",") + ")";
  }
  return `<span class="carre-redbox"${attribut} style="--t:${taille}px${fond}">${n && n > 1 ? n : ""}` +
         `${etat ? `<i data-etat="${etat}"></i>` : ""}</span>`;
}

/**
 * LES TROIS LECTURES DE LA CARTE, pour le super-admin. Le stade dit ou en est
 * chaque machine de l'usine au bar ; la sante, lesquelles tournent — vert en
 * ligne, rouge silencieuse, ambre hors service, gris pas encore installee ; le
 * CA, lesquelles rapportent — le carre grandit avec le chiffre des 30 jours.
 */
export type Lecture = "stade" | "sante" | "ca";
const LECTURES: { cle: Lecture; nom: string }[] = [
  { cle: "stade", nom: "Stade" }, { cle: "sante", nom: "Santé" }, { cle: "ca", nom: "CA 30 j" },
];

/** La sante d'un point pour la carte en lecture « sante » : une machine pas encore installee est « non ». */
type Sante = "ok" | "mal" | "hs" | "non";
const SANTES: { cle: Sante; nom: string }[] = [
  { cle: "ok", nom: "En ligne" }, { cle: "mal", nom: "Silencieuse" },
  { cle: "hs", nom: "Hors service" }, { cle: "non", nom: "Pas installée" },
];
function santeCarte(p: Point): Sante {
  const e = santeDuPoint(p);
  return e === "ok" || e === "mal" || e === "hs" ? e : "non";
}

/** Le carre en lecture « sante » : raye de la sante de ses machines, comme le carre d'un stade. */
function carreSante(taille: number, santes: Sante[], n?: number): string {
  const parts = SANTES.map((s) => ({ cle: s.cle, k: santes.filter((x) => x === s.cle).length })).filter((s) => s.k > 0);
  const total = parts.reduce((t, p) => t + p.k, 0);
  let attribut = "", fond = "";
  if (parts.length === 1) attribut = ` data-sante="${parts[0].cle}"`;
  else if (parts.length > 1) {
    let de = 0;
    fond = ";background:linear-gradient(90deg," + parts.map((p) => {
      const a = de;
      de += (p.k / total) * 100;
      return `var(--sante-${p.cle}) ${a.toFixed(1)}% ${de.toFixed(1)}%`;
    }).join(",") + ")";
  }
  return `<span class="carre-redbox"${attribut} style="--t:${taille}px${fond}">${n && n > 1 ? n : ""}</span>`;
}

/** Le CA en peu de signes, pour tenir dans un marqueur : « 84 € », « 1,2 k€ ». */
function court(centimes: number): string {
  const e = centimes / 100;
  if (e >= 1000) return `${(e / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€`;
  return `${Math.round(e).toLocaleString("fr-FR")} €`;
}

/** Le marqueur en lecture « CA » : une pastille rouge dont la hauteur suit la racine du chiffre. */
function carreCa(taille: number, centimes: number): string {
  return `<span class="carre-redbox ca" style="--t:${taille}px">${court(centimes)}</span>`;
}

/** Une pilule : la sante d'une machine installee, le stade des autres. */
function pilule(x: Point): string {
  const sante = santeDuPoint(x);
  if (sante) return `<span class="pilule" data-etat="${sante}"><i></i>${NOM_ETAT[sante]}</span>`;
  const stade = stadeDuPoint(x);
  return `<span class="pilule stade" data-stade="${stade}"><i></i>${nomDuStatut(stade)}</span>`;
}

/** Une machine dans une bulle : son nom, son etat, son adresse, et le geste pour la deplacer. */
function ligne(x: Point): string {
  return `<li><a href="${html(x.href)}">${html(x.nom)}</a>${pilule(x)}` +
    (x.adresse ? `<div class="ou">${html(x.adresse)}${x.sous ? ` · ${html(x.sous)}` : ""}</div>` : "") +
    (x.situer ? `<a class="resituer" href="${html(x.situer)}">Re-situer ›</a>` : "") +
    `</li>`;
}

/**
 * CE QU'ON LIT EN SURVOLANT UNE MACHINE, sans cliquer : son nom, son stade et
 * sa sante, son adresse, puis ce que la page a juge utile — le CA, le compte,
 * le numero de serie, sa derniere visite.
 */
function survolMachine(x: Point): string {
  const stade = stadeDuPoint(x);
  const sante = santeDuPoint(x);
  return `<div class="survol-nom"><span class="point" data-stade="${stade}"></span>${html(x.nom)}</div>` +
    `<div class="survol-etats"><span class="pilule stade" data-stade="${stade}"><i></i>${nomDuStatut(stade)}</span>` +
    (sante ? `<span class="pilule" data-etat="${sante}"><i></i>${NOM_ETAT[sante]}</span>` : "") + `</div>` +
    (x.adresse ? `<div class="ou">${html(x.adresse)}</div>` : "") +
    (x.details?.length
      ? `<dl>${x.details.map(([k, v]) => `<dt>${html(k)}</dt><dd>${html(v)}</dd>`).join("")}</dl>`
      : "");
}

/** En survolant une ville : combien a chaque stade, le CA mis ensemble, et celles qui rapportent le plus. */
function survolVille(g: Groupe): string {
  if (g.machines.length === 1) return survolMachine(g.machines[0]);
  const stades = STATUTS.map((s) => ({ s, n: g.machines.filter((m) => stadeDuPoint(m) === s.cle).length }))
                        .filter((x) => x.n > 0);
  const avecCa = g.machines.some((m) => m.ca30 !== undefined);
  const tri = [...g.machines].sort((a, b) => (b.ca30 ?? -1) - (a.ca30 ?? -1) || a.nom.localeCompare(b.nom, "fr"));
  const reste = tri.length - MACHINES_SURVOL;
  return `<div class="survol-nom">${html(g.ville)} <span class="combien">${g.machines.length} machines</span></div>` +
    `<div class="survol-etats">${stades.map(({ s, n }) =>
      `<span class="pilule stade" data-stade="${s.cle}"><i></i>${s.nom} <b>${n}</b></span>`).join("")}</div>` +
    (avecCa ? `<dl><dt>CA 30 j</dt><dd>${enEuros(g.machines.reduce((t, m) => t + (m.ca30 ?? 0), 0))}</dd></dl>` : "") +
    `<ul>${tri.slice(0, MACHINES_SURVOL).map((m) =>
      `<li><span class="point" data-stade="${stadeDuPoint(m)}"></span><span class="n">${html(m.nom)}</span>` +
      (m.ca30 !== undefined ? `<span class="num">${enEuros(m.ca30)}</span>` : "") + `</li>`).join("")}</ul>` +
    (reste > 0 ? `<div class="ou">et ${reste} autre${reste > 1 ? "s" : ""} : touchez pour la liste</div>` : "");
}

/**
 * Les villes, sans les machines des classes qu'on a masquees — un stade, ou
 * une sante. Une ville videe disparait ; une ville allegee se recentre sur ce
 * qui lui reste et reprend la sante de sa moins bien portante.
 */
function filtrer(groupes: Groupe[], masques: Set<string>, classe: (p: Point) => string,
                 garder: (p: Point) => boolean = () => true): Groupe[] {
  if (masques.size === 0 && groupes.every((g) => g.machines.every(garder))) return groupes;
  return groupes.flatMap((g) => {
    const machines = g.machines.filter((m) => garder(m) && !masques.has(classe(m)));
    if (machines.length === 0) return [];
    return [{
      ...g, machines,
      etat: GRAVITE.find((e) => machines.some((m) => m.etat === e)) ?? "ok",
      latitude: machines.reduce((t, m) => t + m.latitude, 0) / machines.length,
      longitude: machines.reduce((t, m) => t + m.longitude, 0) / machines.length,
    }];
  });
}

/**
 * UNE PERSONNE SUR LA CARTE, a sa ville : un prospect de la plateforme. Futur
 * redboxer s'il a fini une lecon de l'academie, curieux sinon ; « chaud » s'il
 * avance vite. Un rond, pour ne jamais se confondre avec le carre d'une machine.
 */
export type PointPersonne = {
  cle: number; nom: string; href: string; genre: "futur" | "curieux"; chaud: boolean;
  ville: string; latitude: number; longitude: number;
  /** Ce qu'on lit sous son nom : son compte, ou il en est. */
  sous: string;
};
const GENRES_GENS = [
  { cle: "futur", nom: "Futurs redboxers" }, { cle: "curieux", nom: "Curieux" },
] as const;

/** Les personnes d'une meme ville font un seul rond, au chiffre de leur nombre. */
function villesDeGens(gens: PointPersonne[]): { ville: string; gens: PointPersonne[]; latitude: number; longitude: number }[] {
  const par = new Map<string, PointPersonne[]>();
  for (const p of gens) par.set(p.ville.toLowerCase(), [...(par.get(p.ville.toLowerCase()) ?? []), p]);
  return [...par.values()].map((g) => ({
    ville: g[0].ville, gens: g,
    latitude: g.reduce((t, p) => t + p.latitude, 0) / g.length,
    longitude: g.reduce((t, p) => t + p.longitude, 0) / g.length,
  }));
}

function rondPersonnes(taille: number, gens: PointPersonne[]): string {
  const futurs = gens.filter((p) => p.genre === "futur").length;
  const genre = futurs === 0 ? "curieux" : futurs === gens.length ? "futur" : "mixte";
  const chaud = gens.some((p) => p.chaud);
  return `<span class="rond-personnes" data-genre="${genre}"${chaud ? " data-chaud" : ""} style="--t:${taille}px">` +
    `${gens.length > 1 ? gens.length : ""}</span>`;
}

function survolPersonnes(ville: string, gens: PointPersonne[]): string {
  const tri = [...gens].sort((a, b) => Number(b.chaud) - Number(a.chaud) || (a.genre === "futur" ? -1 : 1));
  return `<div class="survol-nom">${html(ville)} <span class="combien">${gens.length} prospect${gens.length > 1 ? "s" : ""}</span></div>` +
    `<ul>${tri.slice(0, 8).map((p) =>
      `<li><span class="rond-point" data-genre="${p.genre}"></span><span class="n">${html(p.nom)}</span>` +
      `<span class="pilule" data-temp="${p.chaud ? "chaud" : p.genre === "futur" ? "tiede" : "froid"}"><i></i>` +
      `${p.chaud ? "chaud" : p.genre === "futur" ? "futur redboxer" : "curieux"}</span></li>`).join("")}</ul>` +
    (gens.length > 8 ? `<div class="ou">et ${gens.length - 8} autres : touchez pour la liste</div>` : "");
}

/**
 * UNE VRAIE CARTE, AVEC LES RUES. Leaflet et les tuiles d'OpenStreetMap : on
 * zoome jusqu'au bar, on reconnait le quartier.
 *
 * De loin, un carre par ville, avec le nombre de machines, raye de leurs
 * stades, et la pastille de la moins bien portante. De pres — a partir du zoom
 * de la rue — chaque machine a son carre a sa place exacte. On survole un
 * carre, une fiche dit ce qu'il y a dessous ; on le touche, la bulle liste les
 * machines et mene a chacune.
 *
 * Par-dessus la carte : les stades, qu'on masque ou montre d'un geste (ce sont
 * aussi la legende des couleurs), « Recentrer » et le plein ecran — ou la
 * molette zoome, puisque la page ne defile plus dessous. Echap en sort.
 *
 * Leaflet touche `window` des son chargement : il n'entre qu'apres le rendu,
 * dans le navigateur. Sans JavaScript, la liste par ville sous la carte dit
 * la meme chose.
 */
/** Le defaut de `personnes`, hors du rendu : un `[]` neuf a chaque fois recadrait la carte a chaque clic. */
const AUCUNE_PERSONNE: PointPersonne[] = [];

export function CarteMaps({ groupes, lectures = false, personnes = AUCUNE_PERSONNE, vide }:
  { groupes: Groupe[]; lectures?: boolean; personnes?: PointPersonne[]; vide?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const carteRef = useRef<import("leaflet").Map | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const calquesRef = useRef<import("leaflet").LayerGroup[]>([]);
  const cadreRef = useRef<[number, number][] | null>(null);
  const zoomRef = useRef<(() => void) | null>(null);
  const [pret, poserPret] = useState(false);
  const [masques, poserMasques] = useState<Set<string>>(new Set());
  const [plein, poserPlein] = useState(false);
  const [lecture, poserLecture] = useState<Lecture>("stade");
  const [gensMasques, poserGensMasques] = useState<Set<string>>(new Set());
  const gensVisibles = useMemo(() => personnes.filter((p) => !gensMasques.has(p.genre)), [personnes, gensMasques]);

  const machines = useMemo(() => groupes.flatMap((g) => g.machines), [groupes]);
  // Ce que les boutons du haut filtrent : le stade, ou la sante. Le CA ne filtre
  // pas — il ne montre que les machines qui ont un chiffre.
  const classe = lecture === "sante" ? santeCarte : stadeDuPoint;
  const classes = useMemo(() => (lecture === "sante" ? SANTES : STATUTS)
    .map((x) => ({ cle: x.cle as string, nom: x.nom, n: machines.filter((m) => classe(m) === x.cle).length }))
    .filter((x) => x.n > 0), [machines, lecture, classe]);
  const visibles = useMemo(() => lecture === "ca"
    ? filtrer(groupes, new Set(), classe, (m) => m.ca30 !== undefined)
    : filtrer(groupes, masques, classe), [groupes, masques, lecture, classe]);
  const sommetCa = useMemo(() => Math.max(1, ...visibles.map((g) => g.machines.reduce((t, m) => t + (m.ca30 ?? 0), 0))), [visibles]);

  // La carte, une fois pour la vie du composant.
  useEffect(() => {
    let vivant = true;
    void import("leaflet").then((L) => {
      if (!vivant || !ref.current) return;
      const c = L.map(ref.current, { scrollWheelZoom: false, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(c);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
      }).addTo(c);
      // La fiche du survol a son calque, au-dessus des etiquettes des villes voisines.
      c.createPane("survol").style.zIndex = "660";
      // Les prospects sous les machines : un carre ne disparait jamais sous un rond.
      c.createPane("personnes").style.zIndex = "590";
      LRef.current = L;
      carteRef.current = c;
      poserPret(true);
    });
    return () => { vivant = false; carteRef.current?.remove(); carteRef.current = null; LRef.current = null; };
  }, []);

  // De nouvelles machines : la carte se recadre sur elles. Declare AVANT les
  // carres, pour que le recadrage parte de la bonne liste.
  useEffect(() => { cadreRef.current = null; }, [groupes, personnes]);

  // Les carres : refaits quand les machines ou les stades montres changent.
  useEffect(() => {
    const L = LRef.current, c = carteRef.current;
    if (!pret || !L || !c) return;
    for (const x of calquesRef.current) x.remove();

    const divIcone = (t: number, dedans: string, l = t) => L.divIcon({
      className: "marqueur-redbox", html: dedans,
      iconSize: [l, t], iconAnchor: [l / 2, t / 2], popupAnchor: [0, -t / 2],
    });
    /** Le marqueur de quelques machines, selon la lecture choisie. */
    const marque = (ms: Point[], t: number) => {
      const n = ms.length > 1 ? ms.length : undefined;
      if (lecture === "sante") return { t, l: t, icone: divIcone(t, carreSante(t, ms.map(santeCarte), n)) };
      if (lecture === "ca") {
        const ca = ms.reduce((x, m) => x + (m.ca30 ?? 0), 0);
        const h = Math.round(22 + 16 * Math.sqrt(ca / sommetCa));
        const l = Math.round(Math.max(h, 16 + court(ca).length * h * .26));
        return { t: h, l, icone: divIcone(h, carreCa(h, ca), l) };
      }
      const pastille = GRAVITE.find((e) => ms.some((x) => santeDuPoint(x) === e)) ?? null;
      return { t, l: t, icone: divIcone(t, carreRedbox(t, pastille, n, ms.map(stadeDuPoint))) };
    };
    const etiquette = (t: number) => ({
      permanent: true, direction: "right" as const, className: "etiquette-ville", offset: [t / 2 + 4, 0] as [number, number],
    });
    const survol = (m: import("leaflet").Marker, contenu: string, t: number) => {
      const fiche = L.tooltip({ pane: "survol", direction: "top", offset: [0, -t / 2 - 6],
                                className: "survol-redbox", opacity: 1 }).setContent(contenu);
      m.on("mouseover", () => { if (!m.isPopupOpen()) c.openTooltip(fiche.setLatLng(m.getLatLng())); });
      m.on("mouseout popupopen", () => { c.closeTooltip(fiche); });
    };

    const villes = L.layerGroup(visibles.map((g) => {
      const n = g.machines.length;
      const { t, l, icone } = marque(g.machines, n <= 1 ? 22 : n <= 3 ? 26 : n <= 9 ? 30 : 36);
      const m = L.marker([g.latitude, g.longitude], { icon: icone });
      m.bindTooltip(html(g.ville) + (n > 1 ? ` · ${n}` : ""), etiquette(l));
      m.bindPopup(`<b class="ville-bulle">${html(g.ville)}</b><ul class="machines-bulle">` +
                  g.machines.map(ligne).join("") + "</ul>", { maxWidth: 320 });
      survol(m, survolVille(g), t);
      return m;
    }));

    const points = visibles.flatMap((g) => g.machines);
    const unes = L.layerGroup(points.map((p) => {
      const { t, l, icone } = marque([p], 22);
      const m = L.marker([p.latitude, p.longitude], { icon: icone });
      m.bindTooltip(html(p.nom), etiquette(l));
      m.bindPopup(`<ul class="machines-bulle seule">${ligne(p)}</ul>`, { maxWidth: 320 });
      survol(m, survolMachine(p), t);
      return m;
    }));
    const gens = L.layerGroup(villesDeGens(gensVisibles).map((v) => {
      const n = v.gens.length;
      const t = n <= 1 ? 16 : n <= 3 ? 22 : n <= 9 ? 26 : 30;
      const m = L.marker([v.latitude, v.longitude], {
        pane: "personnes",
        icon: L.divIcon({ className: "marqueur-redbox", html: rondPersonnes(t, v.gens),
                          iconSize: [t, t], iconAnchor: [t / 2, t / 2], popupAnchor: [0, -t / 2] }),
      });
      m.bindPopup(`<b class="ville-bulle">${html(v.ville)}</b><ul class="machines-bulle">` +
        v.gens.map((p) => `<li><a href="${html(p.href)}">${html(p.nom)}</a>` +
          `<span class="pilule" data-temp="${p.chaud ? "chaud" : p.genre === "futur" ? "tiede" : "froid"}"><i></i>` +
          `${p.chaud ? "chaud" : p.genre === "futur" ? "futur redboxer" : "curieux"}</span>` +
          `<div class="ou">${html(p.sous)}</div></li>`).join("") + "</ul>", { maxWidth: 320 });
      survol(m, survolPersonnes(v.ville, v.gens), t);
      return m;
    })).addTo(c);
    calquesRef.current = [villes, unes, gens];

    const selonZoom = () => {
      if (c.getZoom() >= ZOOM_RUE) { villes.remove(); unes.addTo(c); }
      else { unes.remove(); villes.addTo(c); }
    };
    // Seulement notre ecouteur : le bouton de zoom de Leaflet ecoute aussi `zoomend`.
    if (zoomRef.current) c.off("zoomend", zoomRef.current);
    zoomRef.current = selonZoom;
    c.on("zoomend", selonZoom);
    // Le cadre ne bouge qu'a l'arrivee des machines, pas quand on masque un stade.
    if (!cadreRef.current) {
      cadreRef.current = [...machines, ...personnes].map((p) => [p.latitude, p.longitude]);
      if (cadreRef.current.length > 0) c.fitBounds(L.latLngBounds(cadreRef.current).pad(0.35), { maxZoom: 11 });
      else c.fitBounds(FRANCE);
    }
    selonZoom();
  }, [pret, visibles, machines, lecture, sommetCa, gensVisibles, personnes]);

  // Plein ecran : la carte prend la fenetre, la molette zoome, Echap en sort.
  useEffect(() => {
    const c = carteRef.current;
    if (!c) return;
    if (plein) c.scrollWheelZoom.enable(); else c.scrollWheelZoom.disable();
    const t = requestAnimationFrame(() => c.invalidateSize());
    document.documentElement.toggleAttribute("data-carte-pleine", plein);
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") poserPlein(false); };
    if (plein) window.addEventListener("keydown", echap);
    return () => { cancelAnimationFrame(t); window.removeEventListener("keydown", echap); };
  }, [plein]);
  useEffect(() => () => document.documentElement.removeAttribute("data-carte-pleine"), []);

  function recentrer() {
    const L = LRef.current, c = carteRef.current;
    if (!L || !c) return;
    const pts = [...visibles.flatMap((g) => g.machines), ...gensVisibles].map((p) => [p.latitude, p.longitude] as [number, number]);
    if (pts.length > 0) c.flyToBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 13, duration: .6 });
    else c.flyToBounds(FRANCE, { duration: .6 });
  }

  return (
    <div className="carte-maps-cadre" data-plein={plein ? "" : undefined}>
      <div ref={ref} className="carte-maps" role="region" aria-label="Carte des RedBox" />
      {vide && groupes.length === 0 && personnes.length === 0 ? <p className="carte-vide">{vide}</p> : null}
      <div className="carte-outils filtres" role="group" aria-label={lecture === "sante" ? "Santés montrées sur la carte" : "Stades montrés sur la carte"}>
        {lectures ? (
          <div className="carte-lectures" role="radiogroup" aria-label="Colorer la carte par">
            {LECTURES.map((x) => (
              <button key={x.cle} type="button" role="radio" aria-checked={lecture === x.cle}
                      onClick={() => { poserLecture(x.cle); poserMasques(new Set()); }}>{x.nom}</button>
            ))}
          </div>
        ) : null}
        {lecture !== "ca" && classes.length > 1 ? classes.map((x) => {
          const montre = !masques.has(x.cle);
          return (
            <button key={x.cle} type="button" className="filtre-stade"
                    data-stade={lecture === "stade" ? x.cle : undefined} data-sante={lecture === "sante" ? x.cle : undefined}
                    aria-pressed={montre} title={montre ? `Masquer : ${x.nom}` : `Montrer : ${x.nom}`}
                    onClick={() => poserMasques((m) => {
                      const n = new Set(m);
                      if (n.has(x.cle)) n.delete(x.cle); else n.add(x.cle);
                      return n.size === classes.length ? new Set() : n;
                    })}>
              <i aria-hidden="true" />{x.nom}<b className="num">{x.n}</b>
            </button>
          );
        }) : null}
        {personnes.length > 0 ? GENRES_GENS.map((x) => {
          const n = personnes.filter((p) => p.genre === x.cle).length;
          if (n === 0) return null;
          const montre = !gensMasques.has(x.cle);
          return (
            <button key={x.cle} type="button" className="filtre-stade filtre-gens" data-genre={x.cle} aria-pressed={montre}
                    title={montre ? `Masquer : ${x.nom}` : `Montrer : ${x.nom}`}
                    onClick={() => poserGensMasques((m) => {
                      const s2 = new Set(m);
                      if (s2.has(x.cle)) s2.delete(x.cle); else s2.add(x.cle);
                      return s2;
                    })}>
              <i aria-hidden="true" />{x.nom}<b className="num">{n}</b>
            </button>
          );
        }) : null}
        {lecture === "ca" ? (
          <span className="carte-note">La taille suit le chiffre d’affaires des 30 derniers jours.</span>
        ) : null}
      </div>
      <div className="carte-outils gestes">
        <button type="button" className="bouton icone" onClick={recentrer} title="Recentrer sur les machines" aria-label="Recentrer sur les machines">
          <IcoCible />
        </button>
        <button type="button" className="bouton icone" onClick={() => poserPlein((p) => !p)} aria-pressed={plein}
                title={plein ? "Quitter le plein écran (Échap)" : "Plein écran"} aria-label={plein ? "Quitter le plein écran" : "Plein écran"}>
          <IcoPleinEcran />
        </button>
      </div>
    </div>
  );
}
