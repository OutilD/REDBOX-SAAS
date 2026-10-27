"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ENTETE_ENVOI } from "@/lib/envoi";
import { CONTACT_MAX, ETAPES, NOM_MAX, NOTE_MAX, VILLE_MAX, type Etape } from "@/lib/crm";
import { IcoChevron, IcoEpingle, IcoPrecedent } from "../icones";

export type Carte = {
  id: number; nom: string; ville: string | null; contact: string | null; note: string | null;
  etape: Etape; depuis: string;
};

/**
 * LE TABLEAU DE PROSPECTION : une colonne par etape, une carte par lieu.
 *
 * Sur ordinateur, on prend la carte et on la pose dans sa colonne ; au doigt,
 * les deux fleches de la carte la passent a l'etape d'avant ou d'apres. Le
 * deplacement se montre tout de suite et se confirme ensuite ; refuse, la
 * carte revient. « Modifier » est un formulaire ordinaire, qui marche sans
 * JavaScript.
 */
export function Kanban({ lieux, ecrire }: { lieux: Carte[]; ecrire: boolean }) {
  const router = useRouter();
  const [liste, poserListe] = useState(lieux);
  const [tenue, tenir] = useState<number | null>(null);
  const [survol, survoler] = useState<Etape | null>(null);
  const [souci, signaler] = useState<string | null>(null);
  useEffect(() => { poserListe(lieux); }, [lieux]);

  async function deplacer(id: number, etape: Etape) {
    const avant = liste;
    const c = liste.find((x) => x.id === id);
    if (!c || c.etape === etape) return;
    poserListe([{ ...c, etape, depuis: "à l’instant" }, ...liste.filter((x) => x.id !== id)]);
    signaler(null);
    const f = new FormData();
    f.set("action", "deplacer"); f.set("id", String(id)); f.set("etape", etape);
    try {
      const r = await fetch("/api/crm", { method: "POST", body: f, headers: { [ENTETE_ENVOI]: "1" } });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      poserListe(avant);
      signaler("Le déplacement n’a pas été enregistré. Réessayez.");
    }
  }

  return (
    <>
      {souci ? <p className="erreur" style={{ margin: "0 0 12px" }}>{souci}</p> : null}
      <div className="kanban crm" onDragEnd={() => { tenir(null); survoler(null); }}>
        {ETAPES.map((s, rang) => {
          const cartes = liste.filter((x) => x.etape === s.cle);
          const precedente = ETAPES[rang - 1];
          const suivante = ETAPES[rang + 1];
          return (
            <section key={s.cle} className="colonne" data-etape={s.cle}
                     data-survol={survol === s.cle ? "" : undefined}
                     onDragOver={(ev) => { if (tenue !== null) { ev.preventDefault(); survoler(s.cle); } }}
                     onDragLeave={() => survoler((x) => (x === s.cle ? null : x))}
                     onDrop={(ev) => { ev.preventDefault(); if (tenue !== null) void deplacer(tenue, s.cle); tenir(null); survoler(null); }}>
              <header>
                <h3>{s.nom} <span className="compte num">{cartes.length}</span></h3>
                <p>{s.quoi}</p>
              </header>
              {cartes.length === 0 ? <p className="vide">{tenue !== null ? "Déposez ici." : "Aucun établissement."}</p> : null}
              {cartes.map((c) => (
                <article key={c.id} id={`l${c.id}`} className="machine" draggable={ecrire}
                         data-tenue={tenue === c.id ? "" : undefined}
                         onDragStart={(ev) => { tenir(c.id); ev.dataTransfer.effectAllowed = "move"; }}>
                  <div className="nom">{c.nom}</div>
                  {c.ville ? <div className="ou"><IcoEpingle size={13} /> {c.ville}</div> : null}
                  {c.contact ? <div className="ou">{c.contact}</div> : null}
                  {c.note ? <p className="crm-note">{c.note}</p> : null}
                  <div className="etats"><span className="depuis faible">{c.depuis}</span></div>

                  {ecrire ? (
                    <>
                      <div className="gestes">
                        <button type="button" className="bouton petit carre" disabled={!precedente}
                                onClick={() => precedente && void deplacer(c.id, precedente.cle)}
                                aria-label={precedente ? `Passer en ${precedente.nom}` : "Première étape"}
                                title={precedente ? `Passer en « ${precedente.nom} »` : undefined}>
                          <IcoPrecedent size={15} />
                        </button>
                        <button type="button" className="bouton petit carre" disabled={!suivante}
                                onClick={() => suivante && void deplacer(c.id, suivante.cle)}
                                aria-label={suivante ? `Passer en ${suivante.nom}` : "Dernière étape"}
                                title={suivante ? `Passer en « ${suivante.nom} »` : undefined}>
                          <IcoChevron size={15} />
                        </button>
                      </div>
                      <details>
                        <summary>Modifier</summary>
                        <form method="post" action="/api/crm">
                          <input type="hidden" name="id" value={c.id} />
                          <div className="champ">
                            <label htmlFor={`n-${c.id}`}>Établissement</label>
                            <input id={`n-${c.id}`} name="nom" defaultValue={c.nom} required maxLength={NOM_MAX} />
                          </div>
                          <div className="champ">
                            <label htmlFor={`v-${c.id}`}>Ville</label>
                            <input id={`v-${c.id}`} name="ville" defaultValue={c.ville ?? ""} maxLength={VILLE_MAX} />
                          </div>
                          <div className="champ">
                            <label htmlFor={`c-${c.id}`}>Contact</label>
                            <input id={`c-${c.id}`} name="contact" defaultValue={c.contact ?? ""} maxLength={CONTACT_MAX} />
                          </div>
                          <div className="champ">
                            <label htmlFor={`e-${c.id}`}>Étape</label>
                            <select id={`e-${c.id}`} name="etape" defaultValue={c.etape}>
                              {ETAPES.map((x) => <option key={x.cle} value={x.cle}>{x.nom}</option>)}
                            </select>
                          </div>
                          <div className="champ">
                            <label htmlFor={`t-${c.id}`}>Note</label>
                            <textarea id={`t-${c.id}`} name="note" rows={3} defaultValue={c.note ?? ""} maxLength={NOTE_MAX} />
                          </div>
                          <div className="rangee" style={{ marginTop: 12, gap: 8 }}>
                            <button className="bouton primaire petit" name="action" value="maj">Enregistrer</button>
                            <button className="bouton petit" name="action" value="supprimer" formNoValidate>Effacer</button>
                          </div>
                        </form>
                      </details>
                    </>
                  ) : null}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
