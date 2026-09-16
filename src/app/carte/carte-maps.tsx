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
 * Les villes, sans les machines des stades qu'on a masques. Une ville videe
 * disparait ; une ville allegee se recentre sur ce qui lui reste et reprend la
 * sante de sa moins bien portante.
 */
function filtrer(groupes: Groupe[], masques: Set<string>): Groupe[] {
  if (masques.size === 0) return groupes;
  return groupes.flatMap((g) => {
    const machines = g.machines.filter((m) => !masques.has(stadeDuPoint(m)));
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
export function CarteMaps({ groupes }: { groupes: Groupe[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const carteRef = useRef<import("leaflet").Map | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const calquesRef = useRef<import("leaflet").LayerGroup[]>([]);
  const cadreRef = useRef<[number, number][] | null>(null);
  const zoomRef = useRef<(() => void) | null>(null);
  const [pret, poserPret] = useState(false);
  const [masques, poserMasques] = useState<Set<string>>(new Set());
  const [plein, poserPlein] = useState(false);

  const machines = useMemo(() => groupes.flatMap((g) => g.machines), [groupes]);
  const stades = useMemo(() => STATUTS
    .map((x) => ({ cle: x.cle, nom: x.nom, n: machines.filter((m) => stadeDuPoint(m) === x.cle).length }))
    .filter((x) => x.n > 0), [machines]);
  const visibles = useMemo(() => filtrer(groupes, masques), [groupes, masques]);

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
      LRef.current = L;
      carteRef.current = c;
      poserPret(true);
    });
    return () => { vivant = false; carteRef.current?.remove(); carteRef.current = null; LRef.current = null; };
  }, []);

  // De nouvelles machines : la carte se recadre sur elles. Declare AVANT les
  // carres, pour que le recadrage parte de la bonne liste.
  useEffect(() => { cadreRef.current = null; }, [groupes]);

  // Les carres : refaits quand les machines ou les stades montres changent.
  useEffect(() => {
    const L = LRef.current, c = carteRef.current;
    if (!pret || !L || !c) return;
    for (const x of calquesRef.current) x.remove();

    const icone = (t: number, etat: string | null, n?: number, st?: string[]) => L.divIcon({
      className: "marqueur-redbox", html: carreRedbox(t, etat, n, st),
      iconSize: [t, t], iconAnchor: [t / 2, t / 2], popupAnchor: [0, -t / 2],
    });
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
      const t = n <= 1 ? 22 : n <= 3 ? 26 : n <= 9 ? 30 : 36;
      const pastille = GRAVITE.find((e) => g.machines.some((x) => santeDuPoint(x) === e)) ?? null;
      const m = L.marker([g.latitude, g.longitude], { icon: icone(t, pastille, n, g.machines.map(stadeDuPoint)) });
      m.bindTooltip(html(g.ville) + (n > 1 ? ` · ${n}` : ""), etiquette(t));
      m.bindPopup(`<b class="ville-bulle">${html(g.ville)}</b><ul class="machines-bulle">` +
                  g.machines.map(ligne).join("") + "</ul>", { maxWidth: 320 });
      survol(m, survolVille(g), t);
      return m;
    }));

    const points = visibles.flatMap((g) => g.machines);
    const unes = L.layerGroup(points.map((p) => {
      const m = L.marker([p.latitude, p.longitude], { icon: icone(22, santeDuPoint(p), undefined, [stadeDuPoint(p)]) });
      m.bindTooltip(html(p.nom), etiquette(22));
      m.bindPopup(`<ul class="machines-bulle seule">${ligne(p)}</ul>`, { maxWidth: 320 });
      survol(m, survolMachine(p), 22);
      return m;
    }));
    calquesRef.current = [villes, unes];

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
      cadreRef.current = machines.map((p) => [p.latitude, p.longitude]);
      if (cadreRef.current.length > 0) c.fitBounds(L.latLngBounds(cadreRef.current).pad(0.35), { maxZoom: 11 });
      else c.fitBounds(FRANCE);
    }
    selonZoom();
  }, [pret, visibles, machines]);

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
    const pts = visibles.flatMap((g) => g.machines).map((p) => [p.latitude, p.longitude] as [number, number]);
    if (pts.length > 0) c.flyToBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 13, duration: .6 });
    else c.flyToBounds(FRANCE, { duration: .6 });
  }

  return (
    <div className="carte-maps-cadre" data-plein={plein ? "" : undefined}>
      <div ref={ref} className="carte-maps" role="region" aria-label="Carte des RedBox" />
      {stades.length > 1 ? (
        <div className="carte-outils filtres" role="group" aria-label="Stades montrés sur la carte">
          {stades.map((x) => {
            const montre = !masques.has(x.cle);
            return (
              <button key={x.cle} type="button" className="filtre-stade" data-stade={x.cle} aria-pressed={montre}
                      title={montre ? `Masquer : ${x.nom}` : `Montrer : ${x.nom}`}
                      onClick={() => poserMasques((m) => {
                        const n = new Set(m);
                        if (n.has(x.cle)) n.delete(x.cle); else n.add(x.cle);
                        return n.size === stades.length ? new Set() : n;
                      })}>
                <i aria-hidden="true" />{x.nom}<b className="num">{x.n}</b>
              </button>
            );
          })}
        </div>
      ) : null}
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
