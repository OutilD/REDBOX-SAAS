"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { GRAVITE, NOM_ETAT, enEuros, santeDuPoint, stadeDuPoint } from "@/lib/etats-carte";
import { STATUTS, nomDuStatut } from "@/lib/statuts";
import type { Groupe, Point } from "./carte-france";

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
 * UNE VRAIE CARTE, AVEC LES RUES. Leaflet et les tuiles d'OpenStreetMap : on
 * zoome jusqu'au bar, on reconnait le quartier.
 *
 * De loin, un carre par ville, avec le nombre de machines, raye de leurs
 * stades, et la pastille de la moins bien portante. De pres — a partir du zoom
 * de la rue — chaque machine a son carre a sa place exacte. On survole un
 * carre, une fiche dit ce qu'il y a dessous ; on le touche, la bulle liste les
 * machines et mene a chacune.
 *
 * Leaflet touche `window` des son chargement : il n'entre qu'apres le rendu,
 * dans le navigateur. Sans JavaScript, la liste par ville sous la carte dit
 * la meme chose.
 */
export function CarteMaps({ groupes }: { groupes: Groupe[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivant = true;
    let carte: import("leaflet").Map | undefined;
    void import("leaflet").then((L) => {
      if (!vivant || !ref.current) return;
      const c = L.map(ref.current, { scrollWheelZoom: false, zoomControl: true });
      carte = c;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
      }).addTo(c);
      // La fiche du survol a son calque, au-dessus des etiquettes des villes voisines.
      c.createPane("survol").style.zIndex = "660";

      const icone = (t: number, etat: string | null, n?: number, stades?: string[]) => L.divIcon({
        className: "marqueur-redbox", html: carreRedbox(t, etat, n, stades),
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

      const villes = L.layerGroup(groupes.map((g) => {
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

      const points = groupes.flatMap((g) => g.machines);
      const machines = L.layerGroup(points.map((p) => {
        const m = L.marker([p.latitude, p.longitude], { icon: icone(22, santeDuPoint(p), undefined, [stadeDuPoint(p)]) });
        m.bindTooltip(html(p.nom), etiquette(22));
        m.bindPopup(`<ul class="machines-bulle seule">${ligne(p)}</ul>`, { maxWidth: 320 });
        survol(m, survolMachine(p), 22);
        return m;
      }));

      const selonZoom = () => {
        if (c.getZoom() >= ZOOM_RUE) { villes.remove(); machines.addTo(c); }
        else { machines.remove(); villes.addTo(c); }
      };
      c.on("zoomend", selonZoom);

      if (points.length > 0) {
        c.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])).pad(0.35),
                    { maxZoom: 11 });
      } else {
        c.fitBounds(FRANCE);
      }
      selonZoom();
    });
    return () => { vivant = false; carte?.remove(); };
  }, [groupes]);

  return <div ref={ref} className="carte-maps" role="region" aria-label="Carte des RedBox" />;
}
