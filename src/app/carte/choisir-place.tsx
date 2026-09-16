"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { carreRedbox } from "./carte-maps";
import { IcoCalques, IcoCible, IcoEpingle } from "../icones";

type Suggestion = { libelle: string; ville: string; latitude: number; longitude: number };
type Lieu = { latitude: number; longitude: number };

/** La metropole et la Corse, quand la machine n'a encore aucune place. */
const FRANCE: [[number, number], [number, number]] = [[41.2, -5.4], [51.3, 9.9]];
const TAILLE = 28;

const PLAN = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
  maxZoom: 19,
};
/** La vue du ciel : on reconnait la terrasse, l'entree du centre commercial, le quai de la gare. */
const SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagerie &copy; Esri, Maxar, Earthstar Geographics",
  maxZoom: 19,
};

/** La distance entre deux places, a vol d'oiseau, en metres. */
function distance(a: Lieu, b: Lieu): number {
  const r = Math.PI / 180;
  const x = Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 +
    Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}

function enMetres(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * CHOISIR LA PLACE D'UNE MACHINE : UNE ADRESSE, PUIS UN POINT.
 *
 * Le champ propose les adresses au fil de la frappe (fleches, Entree, Echap).
 * En choisir une pose le carre rouge dessus et zoome jusqu'a la rue ; toucher
 * la carte ou glisser le carre affine la place, et l'adresse la plus proche est
 * proposee sans jamais remplacer celle qu'on a ecrite. Le formulaire est un
 * vrai formulaire : latitude, longitude et ville voyagent en champs caches.
 */
export function ChoisirPlace({ action, r, annuler, adresse: adresseDepart, ville: villeDepart, latitude, longitude }: {
  action: string; r: string; annuler: string;
  adresse: string | null; ville: string | null; latitude: number | null; longitude: number | null;
}) {
  const depart: Lieu | null = latitude !== null && longitude !== null ? { latitude, longitude } : null;
  const boite = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const carteRef = useRef<import("leaflet").Map | null>(null);
  const marqueurRef = useRef<import("leaflet").Marker | null>(null);
  const tuilesRef = useRef<import("leaflet").TileLayer | null>(null);
  const [fond, setFond] = useState<"plan" | "satellite">("plan");
  // La derniere recherche d'adresse par le point gagne : on glisse vite.
  const tour = useRef(0);
  // Seule la frappe lance les suggestions — pas une adresse qu'on vient de choisir.
  // Une adresse deja connue mais introuvable les ouvre d'emblee.
  const saisie = useRef(Boolean(!depart && adresseDepart));

  const [adresse, setAdresse] = useState(adresseDepart ?? "");
  const [ville, setVille] = useState(villeDepart ?? "");
  const [point, setPoint] = useState<Lieu | null>(depart);
  const [proposee, setProposee] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const [avis, setAvis] = useState<string | null>(null);

  /** L'adresse la plus proche du point : la ville, et une adresse a proposer. */
  const deviner = useCallback(async (lat: number, lon: number) => {
    const n = ++tour.current;
    setProposee(null);
    try {
      const rep = await fetch(`/api/geo?lat=${lat}&lon=${lon}`);
      if (!rep.ok || n !== tour.current) return;
      const { suggestion: s } = (await rep.json()) as { suggestion: Suggestion | null };
      if (!s || n !== tour.current) return;
      setVille(s.ville);
      setProposee(s.libelle);
      saisie.current = false;
      setAdresse((a) => (a.trim() ? a : s.libelle));
    } catch { /* la place compte ; l'adresse, on peut la taper */ }
  }, []);

  /** Pose (ou deplace) le carre rouge. */
  const poser = useCallback((lat: number, lon: number, zoom?: number) => {
    setPoint({ latitude: lat, longitude: lon });
    const L = LRef.current, carte = carteRef.current;
    if (!L || !carte) return;
    if (marqueurRef.current) {
      marqueurRef.current.setLatLng([lat, lon]);
    } else {
      const m = L.marker([lat, lon], {
        draggable: true, autoPan: true, title: "La RedBox — glissez pour affiner",
        icon: L.divIcon({ className: "marqueur-redbox", html: carreRedbox(TAILLE),
                          iconSize: [TAILLE, TAILLE], iconAnchor: [TAILLE / 2, TAILLE / 2] }),
      });
      m.on("dragend", () => {
        const p = m.getLatLng();
        setPoint({ latitude: p.lat, longitude: p.lng });
        void deviner(p.lat, p.lng);
      });
      marqueurRef.current = m.addTo(carte);
    }
    if (zoom) carte.setView([lat, lon], zoom);
  }, [deviner]);

  // Une seule carte pour la vie du composant : la place de depart ne sert qu'a l'ouvrir.
  useEffect(() => {
    let vivant = true;
    void import("leaflet").then((L) => {
      if (!vivant || !boite.current) return;
      LRef.current = L;
      const carte = L.map(boite.current, { scrollWheelZoom: true, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(carte);
      carteRef.current = carte;
      tuilesRef.current = L.tileLayer(PLAN.url, { maxZoom: PLAN.maxZoom, attribution: PLAN.attribution }).addTo(carte);
      if (depart) poser(depart.latitude, depart.longitude, 17);
      else carte.fitBounds(FRANCE);
      carte.on("click", (ev) => {
        poser(ev.latlng.lat, ev.latlng.lng);
        void deviner(ev.latlng.lat, ev.latlng.lng);
      });
    });
    return () => {
      vivant = false;
      carteRef.current?.remove();
      carteRef.current = null; marqueurRef.current = null; LRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Plan ou satellite : on change de tuiles, la carte ne bouge pas.
  useEffect(() => {
    const L = LRef.current, carte = carteRef.current;
    if (!L || !carte) return;
    const f = fond === "satellite" ? SATELLITE : PLAN;
    tuilesRef.current?.remove();
    tuilesRef.current = L.tileLayer(f.url, { maxZoom: f.maxZoom, attribution: f.attribution }).addTo(carte);
  }, [fond]);

  // Les suggestions, un quart de seconde apres la derniere touche.
  useEffect(() => {
    if (!saisie.current) return;
    const texte = adresse.trim();
    if (texte.length < 3) { setSuggestions([]); setOuvert(false); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const pres = point ? `&lat=${point.latitude}&lon=${point.longitude}` : "";
        const rep = await fetch(`/api/geo?q=${encodeURIComponent(texte)}${pres}`, { signal: ctrl.signal });
        if (!rep.ok) {
          setAvis("La recherche d’adresse ne répond pas. Touchez la carte pour placer la machine.");
          return;
        }
        const { suggestions: s } = (await rep.json()) as { suggestions: Suggestion[] };
        setSuggestions(s); setActif(-1); setOuvert(s.length > 0);
        setAvis(s.length === 0 ? "Aucune adresse ne correspond. Touchez la carte à l’endroit de la machine." : null);
      } catch { /* annulee par la touche suivante */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse]);

  function choisir(s: Suggestion) {
    saisie.current = false;
    tour.current++;
    setAdresse(s.libelle); setVille(s.ville); setProposee(null);
    setOuvert(false); setSuggestions([]); setAvis(null);
    poser(s.latitude, s.longitude, 17);
  }

  function localiser() {
    if (!navigator.geolocation) { setAvis("Ce navigateur ne sait pas donner sa position."); return; }
    setAvis("Localisation…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setAvis(null);
        poser(p.coords.latitude, p.coords.longitude, 18);
        void deviner(p.coords.latitude, p.coords.longitude);
      },
      () => setAvis("Position refusée ou introuvable. Tapez l’adresse, ou touchez la carte."),
      { enableHighAccuracy: true, timeout: 10000 });
  }

  function recentrer() {
    const carte = carteRef.current;
    if (!carte) return;
    if (point) carte.flyTo([point.latitude, point.longitude], Math.max(carte.getZoom(), 17), { duration: .5 });
    else carte.flyToBounds(FRANCE, { duration: .5 });
  }

  const liste = ouvert && suggestions.length > 0;
  const ecart = depart && point ? distance(depart, point) : 0;

  return (
    <form method="post" action={action} className="choisir-place">
      <input type="hidden" name="r" value={r} />
      <input type="hidden" name="latitude" value={point?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={point?.longitude ?? ""} />
      <input type="hidden" name="ville" value={ville} />

      <div className="panneau">
        <ol className="etapes">
          <li data-fait={adresse.trim() ? "" : undefined}>
            <span className="rang num" aria-hidden="true">1</span>
            <div className="champ recherche">
              <label htmlFor="place-adresse">L’adresse</label>
              <input id="place-adresse" name="adresse" required maxLength={160} autoComplete="off" spellCheck={false}
                     placeholder="12 rue des Lilas, 33000 Bordeaux" value={adresse}
                     role="combobox" aria-autocomplete="list" aria-expanded={liste} aria-controls="place-suggestions"
                     aria-activedescendant={liste && actif >= 0 ? `place-s${actif}` : undefined}
                     onChange={(e) => { saisie.current = true; setAdresse(e.target.value); }}
                     onFocus={() => { if (suggestions.length > 0) setOuvert(true); }}
                     onBlur={() => setTimeout(() => setOuvert(false), 150)}
                     onKeyDown={(e) => {
                       if (!liste) return;
                       if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => (i + 1) % suggestions.length); }
                       else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
                       else if (e.key === "Enter") { e.preventDefault(); choisir(suggestions[Math.max(0, actif)]); }
                       else if (e.key === "Escape") { e.preventDefault(); setOuvert(false); }
                     }} />
              {liste ? (
                <ul id="place-suggestions" role="listbox" className="suggestions">
                  {suggestions.map((s, i) => (
                    <li key={`${s.libelle}-${i}`} id={`place-s${i}`} role="option" aria-selected={i === actif}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(s)}>
                      <IcoEpingle size={15} /><span>{s.libelle}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="aide-place">Tapez au moins trois lettres, puis choisissez dans la liste.</p>
            </div>
          </li>
          <li data-fait={point ? "" : undefined}>
            <span className="rang num" aria-hidden="true">2</span>
            <div>
              <div className="titre-etape">L’emplacement exact</div>
              <p className="aide-place">
                {point ? "Touchez la carte ou glissez le carré rouge jusqu’à la machine. La vue satellite aide à trouver l’entrée."
                       : "Choisissez une adresse, ou touchez la carte à l’endroit de la machine."}
              </p>
              <button type="button" className="bouton petit" onClick={localiser}><IcoCible size={16} /> Je suis devant la machine</button>
              {point ? (
                <dl className="coordonnees num">
                  <div><dt>Latitude</dt><dd>{point.latitude.toFixed(5)}</dd></div>
                  <div><dt>Longitude</dt><dd>{point.longitude.toFixed(5)}</dd></div>
                  {ville ? <div><dt>Ville</dt><dd>{ville}</dd></div> : null}
                  {depart && ecart >= 1 ? <div><dt>Déplacée de</dt><dd>{enMetres(ecart)}</dd></div> : null}
                </dl>
              ) : null}
              {proposee && proposee !== adresse ? (
                <p className="proposee">
                  <span>Adresse la plus proche : <b>{proposee}</b></span>
                  <button type="button" className="bouton petit" onClick={() => { saisie.current = false; setAdresse(proposee); }}>
                    Utiliser
                  </button>
                </p>
              ) : null}
              {avis ? <p className="faible avis-place" role="status">{avis}</p> : null}
            </div>
          </li>
        </ol>

        <div className="actions">
          <a href={annuler} className="bouton">Annuler</a>
          <button className="bouton primaire" disabled={!point}>Enregistrer la place</button>
        </div>
      </div>

      <div className="scene">
        <div ref={boite} className="carte-maps" data-fond={fond} role="region" aria-label="Carte : touchez pour placer la RedBox" />
        <div className="carte-outils gestes">
          <button type="button" className="bouton icone" onClick={recentrer}
                  title={point ? "Revenir sur la machine" : "Voir toute la France"} aria-label="Recentrer">
            <IcoCible />
          </button>
          <button type="button" className="bouton icone" aria-pressed={fond === "satellite"}
                  onClick={() => setFond((f) => (f === "plan" ? "satellite" : "plan"))}
                  title={fond === "plan" ? "Vue satellite" : "Vue plan"} aria-label={fond === "plan" ? "Vue satellite" : "Vue plan"}>
            <IcoCalques />
          </button>
        </div>
        <span className="fond-nom" aria-hidden="true">{fond === "plan" ? "Plan" : "Satellite"}</span>
      </div>
    </form>
  );
}
