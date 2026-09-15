"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUTS, type Statut } from "@/lib/statuts";

export type Compte = { id: number; nom: string };
export type Machine = {
  id: number; numero: string | null; nom: string; adresse: string | null;
  statut: Statut; depuis: string; note: string | null;
  appairee: boolean; etat: "ok" | "mal" | "hs" | "bientot" | "attente";
  compte_id: number | null; compte: string | null; situee: boolean;
};

const ETAT_INSTALLEE: Record<Machine["etat"], [string, string]> = {
  ok: ["en ligne", "ok"], mal: ["silencieuse", "mal"], hs: ["hors service", "attente"],
  bientot: ["à appairer", "attente"], attente: ["désappairée", "attente"],
};

/** Cartes par page dans une colonne : au-dela, la pile se tourne plutot qu'elle ne s'allonge. */
const PAR_PAGE = 6;

/** La machine visee par l'adresse, `#m12` : un lien venu de la carte. */
function viseeDansAdresse(): number | null {
  const m = /^#m(\d+)$/.exec(window.location.hash);
  return m ? Number(m[1]) : null;
}

/**
 * CINQ COLONNES, UNE PAR STADE, ET DES CARTES QU'ON GLISSE.
 *
 * Le glisser-deposer est le geste naturel pour « celle-la passe en commandee » ;
 * il ne marche pas au doigt sur un telephone, et pas sans JavaScript. Chaque
 * carte porte donc aussi un formulaire complet — stade, compte, adresse — qui
 * marche partout et fait la meme chose par une autre porte.
 *
 * Le changement est montre tout de suite et confirme ensuite ; s'il est
 * refuse, la carte revient a sa colonne et le serveur dit pourquoi.
 *
 * UNE COLONNE SE TOURNE PAR PAGES. Cinquante machines libres feraient une pile
 * qu'on ne parcourt plus, et au bas de laquelle on ne glisse plus rien. Une
 * carte deposee se range en tete de sa nouvelle colonne, page un, pour qu'on la
 * voie arriver ; un lien `#m12` venu de la carte ouvre la page ou elle est.
 */
export function TableauParc({ machines, comptes }: { machines: Machine[]; comptes: Compte[] }) {
  const router = useRouter();
  const [liste, poserListe] = useState(machines);
  const [tenue, tenir] = useState<number | null>(null);
  const [survol, survoler] = useState<Statut | null>(null);
  const [souci, signaler] = useState<string | null>(null);
  const [pages, poserPages] = useState<Partial<Record<Statut, number>>>({});
  // Le tour change a chaque visee : viser deux fois la meme machine la ramene quand meme.
  const [visee, viser] = useState<{ id: number; tour: number } | null>(null);
  const listeRef = useRef(liste);
  useEffect(() => { listeRef.current = liste; }, [liste]);

  useEffect(() => {
    const suivre = () => {
      const id = viseeDansAdresse();
      const m = id === null ? undefined : listeRef.current.find((x) => x.id === id);
      if (!m) return;
      const rang = listeRef.current.filter((x) => x.statut === m.statut).findIndex((x) => x.id === m.id);
      poserPages((p) => ({ ...p, [m.statut]: Math.floor(rang / PAR_PAGE) }));
      viser((v) => ({ id: m.id, tour: (v?.tour ?? 0) + 1 }));
    };
    suivre();
    window.addEventListener("hashchange", suivre);
    return () => window.removeEventListener("hashchange", suivre);
  }, []);

  // La bonne page affichee, la carte visee vient sous les yeux.
  useEffect(() => {
    if (visee) document.getElementById(`m${visee.id}`)?.scrollIntoView({ block: "center" });
  }, [visee]);

  async function deplacer(id: number, statut: Statut) {
    const avant = liste;
    const m = liste.find((x) => x.id === id);
    if (!m || m.statut === statut) return;
    const deplacee: Machine = {
      ...m, statut, depuis: "à l’instant",
      compte_id: statut === "libre" ? null : m.compte_id,
      compte: statut === "libre" ? null : m.compte,
    };
    poserListe([deplacee, ...liste.filter((x) => x.id !== id)]);
    poserPages((p) => ({ ...p, [statut]: 0 }));
    signaler(null);
    try {
      const r = await fetch("/api/admin/parc/statut", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, statut }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.erreur ?? "refusé");
      router.refresh();
    } catch (e) {
      poserListe(avant);
      signaler(e instanceof Error ? e.message : "Impossible.");
    }
  }

  return (
    <div className="kanban" onDragEnd={() => { tenir(null); survoler(null); }}>
      {souci ? <p className="erreur" style={{ gridColumn: "1 / -1", margin: 0 }}>{souci}</p> : null}
      {STATUTS.map((s) => {
        const cartes = liste.filter((m) => m.statut === s.cle);
        const nPages = Math.max(1, Math.ceil(cartes.length / PAR_PAGE));
        const page = Math.min(pages[s.cle] ?? 0, nPages - 1);
        const vues = cartes.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
        const aller = (p: number) => poserPages((x) => ({ ...x, [s.cle]: p }));
        return (
          <section key={s.cle} id={`col-${s.cle}`} className="colonne" data-stade={s.cle}
                   data-survol={survol === s.cle ? "" : undefined}
                   onDragOver={(ev) => { if (tenue !== null) { ev.preventDefault(); survoler(s.cle); } }}
                   onDragLeave={() => survoler((x) => (x === s.cle ? null : x))}
                   onDrop={(ev) => { ev.preventDefault(); if (tenue !== null) void deplacer(tenue, s.cle); tenir(null); survoler(null); }}>
            <header>
              <h3>{s.nom} <span className="compte num">{cartes.length}</span></h3>
              <p>{s.quoi}</p>
            </header>
            {cartes.length === 0 ? <p className="vide">Rien ici.</p> : null}
            {vues.map((m) => (
              <article key={m.id} id={`m${m.id}`} className="machine" draggable
                       data-tenue={tenue === m.id ? "" : undefined}
                       onDragStart={(ev) => { tenir(m.id); ev.dataTransfer.effectAllowed = "move"; }}>
                <div className="rangee">
                  <div className="pousse" style={{ minWidth: 0 }}>
                    <div className="nom">{m.nom}</div>
                    <div className="ou">
                      {m.numero ? <span className="mono">n° {m.numero}</span> : <span>sans numéro</span>}
                      {" · "}{m.compte ?? "sans compte"}
                    </div>
                  </div>
                </div>
                <div className="ou">{m.adresse ?? "adresse à préciser"}{m.adresse && !m.situee ? " · pas encore sur la carte" : ""}</div>
                <div className="etats">
                  {m.statut === "installee" ? (
                    <span className={`pilule ${ETAT_INSTALLEE[m.etat][1]}`}><i />{ETAT_INSTALLEE[m.etat][0]}</span>
                  ) : null}
                  <span className="pilule"><i />{m.depuis}</span>
                </div>

                <details>
                  <summary>Modifier</summary>
                  <form method="post" action="/api/admin/parc/modifier">
                    <input type="hidden" name="id" value={m.id} />
                    <div className="champ">
                      <label htmlFor={`s-${m.id}`}>Stade</label>
                      <select id={`s-${m.id}`} name="statut" defaultValue={m.statut}>
                        {STATUTS.map((x) => <option key={x.cle} value={x.cle}>{x.nom}</option>)}
                      </select>
                    </div>
                    <div className="champ">
                      <label htmlFor={`c-${m.id}`}>Compte</label>
                      <select id={`c-${m.id}`} name="compte_id" defaultValue={m.compte_id ?? ""}
                              disabled={m.appairee}>
                        <option value="">— aucun</option>
                        {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                      </select>
                      {m.appairee ? <p className="faible" style={{ fontSize: 12, margin: "4px 0 0" }}>
                        Appairée : le compte se change en la désappairant d’abord.</p> : null}
                    </div>
                    <div className="champ">
                      <label htmlFor={`n-${m.id}`}>Numéro de série</label>
                      <input id={`n-${m.id}`} name="numero" className="mono" defaultValue={m.numero ?? ""} maxLength={40} />
                    </div>
                    <div className="champ">
                      <label htmlFor={`o-${m.id}`}>Nom</label>
                      <input id={`o-${m.id}`} name="nom" defaultValue={m.nom} maxLength={80} />
                    </div>
                    <div className="champ">
                      <label htmlFor={`a-${m.id}`}>Adresse</label>
                      <input id={`a-${m.id}`} name="adresse" defaultValue={m.adresse ?? ""} maxLength={160} />
                    </div>
                    <div className="champ">
                      <label htmlFor={`t-${m.id}`}>Note</label>
                      <input id={`t-${m.id}`} name="note" defaultValue={m.note ?? ""} maxLength={300} />
                    </div>
                    <div className="rangee" style={{ marginTop: 12, gap: 8 }}>
                      <button className="bouton primaire petit">Enregistrer</button>
                      {!m.appairee ? (
                        <button className="bouton petit" formAction="/api/admin/parc/supprimer"
                                formNoValidate>Effacer</button>
                      ) : null}
                    </div>
                  </form>
                </details>
              </article>
            ))}
            {nPages > 1 ? (
              <nav className="pages-colonne" aria-label={`Pages de la colonne ${s.nom}`}>
                <button type="button" className="bouton petit" disabled={page === 0}
                        onClick={() => aller(page - 1)} aria-label="Page précédente">‹</button>
                <span className="num">
                  {page * PAR_PAGE + 1}–{Math.min(cartes.length, (page + 1) * PAR_PAGE)} sur {cartes.length}
                </span>
                <button type="button" className="bouton petit" disabled={page === nPages - 1}
                        onClick={() => aller(page + 1)} aria-label="Page suivante">›</button>
              </nav>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
