"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUTS, type Statut } from "@/lib/statuts";
import { IcoChevron, IcoColonnes, IcoEpingle, IcoListe, IcoLoupe, IcoPrecedent } from "../icones";

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
const RANG: Record<Statut, number> = Object.fromEntries(STATUTS.map((s, i) => [s.cle, i])) as Record<Statut, number>;

/** La machine visee par l'adresse, `#m12` : un lien venu de la carte. */
function viseeDansAdresse(): number | null {
  const m = /^#m(\d+)$/.exec(window.location.hash);
  return m ? Number(m[1]) : null;
}

/** Sans accents ni casse : « theatro » trouve « Théâtro ». */
function pli(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * CINQ COLONNES, UNE PAR STADE, OU UNE LISTE.
 *
 * Le glisser-deposer est le geste naturel pour « celle-la passe en commandee » ;
 * il ne marche pas au doigt, alors chaque carte porte aussi deux fleches — stade
 * d'avant, stade d'apres. ATTRIBUER ouvre une fenetre : on cherche le compte par
 * son nom, on donne l'adresse prevue, c'est fait. Le formulaire complet reste
 * replie dans chaque carte et marche sans JavaScript.
 *
 * Au-dessus, la recherche (nom, numero de serie, compte, adresse) et le filtre
 * par compte valent pour les deux vues. La vue en liste est un tableau, pour
 * relire cinquante machines d'un coup et changer un stade d'un menu.
 *
 * Le changement est montre tout de suite et confirme ensuite ; s'il est
 * refuse, la carte revient a sa place et le serveur dit pourquoi.
 */
export function TableauParc({ machines, comptes }: { machines: Machine[]; comptes: Compte[] }) {
  const router = useRouter();
  const [liste, poserListe] = useState(machines);
  const [tenue, tenir] = useState<number | null>(null);
  const [survol, survoler] = useState<Statut | null>(null);
  const [souci, signaler] = useState<string | null>(null);
  const [pages, poserPages] = useState<Partial<Record<Statut, number>>>({});
  const [cherche, chercher] = useState("");
  const [compte, choisirCompte] = useState("");
  const [vue, poserVue] = useState<"colonnes" | "liste">("colonnes");
  const [attribuee, attribuer] = useState<Machine | null>(null);
  // Le tour change a chaque visee : viser deux fois la meme machine la ramene quand meme.
  const [visee, viser] = useState<{ id: number; tour: number } | null>(null);
  const listeRef = useRef(liste);
  useEffect(() => { listeRef.current = liste; }, [liste]);
  useEffect(() => { poserListe(machines); }, [machines]);

  // La vue choisie est une commodite de cet ecran : elle reste dans ce navigateur.
  useEffect(() => {
    try { if (localStorage.getItem("rbx_parc_vue") === "liste") poserVue("liste"); } catch { /* navigation privee */ }
  }, []);
  function changerVue(v: "colonnes" | "liste") {
    poserVue(v);
    try { localStorage.setItem("rbx_parc_vue", v); } catch { /* navigation privee */ }
  }

  useEffect(() => {
    const suivre = () => {
      const id = viseeDansAdresse();
      const m = id === null ? undefined : listeRef.current.find((x) => x.id === id);
      if (!m) return;
      chercher(""); choisirCompte("");
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

  const filtrees = useMemo(() => {
    const mots = pli(cherche.trim()).split(/\s+/).filter(Boolean);
    return liste.filter((m) => {
      if (compte === "aucun" ? m.compte_id !== null : compte && String(m.compte_id) !== compte) return false;
      if (mots.length === 0) return true;
      const texte = pli([m.nom, m.numero, m.compte, m.adresse, m.note].filter(Boolean).join(" "));
      return mots.every((x) => texte.includes(x));
    });
  }, [liste, cherche, compte]);

  // Pas de page vide apres une recherche : on repart de la premiere. Pas au
  // premier rendu — un lien `#m12` vient d'ouvrir la page de sa machine.
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    poserPages({});
  }, [cherche, compte]);

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

  const avecCompte = comptes.filter((c) => liste.some((m) => m.compte_id === c.id));

  return (
    <>
      <div className="parc-outils">
        <label className="parc-recherche">
          <IcoLoupe size={17} />
          <span className="lecteur-seul">Chercher une machine</span>
          <input type="search" value={cherche} onChange={(e) => chercher(e.target.value)}
                 placeholder="Nom, n° de série, compte, adresse…" />
        </label>
        <label className="parc-filtre">
          <span className="lecteur-seul">Filtrer par compte</span>
          <select value={compte} onChange={(e) => choisirCompte(e.target.value)}>
            <option value="">Tous les comptes</option>
            <option value="aucun">Sans compte</option>
            {avecCompte.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
        <span className="parc-compte num" aria-live="polite">
          {filtrees.length === liste.length ? `${liste.length} machine${liste.length > 1 ? "s" : ""}` : `${filtrees.length} sur ${liste.length}`}
        </span>
        <div className="periodes petites parc-vues" role="group" aria-label="Affichage">
          <button type="button" aria-current={vue === "colonnes" ? "true" : undefined} onClick={() => changerVue("colonnes")}>
            <IcoColonnes size={15} /> Colonnes
          </button>
          <button type="button" aria-current={vue === "liste" ? "true" : undefined} onClick={() => changerVue("liste")}>
            <IcoListe size={15} /> Liste
          </button>
        </div>
      </div>

      {souci ? <p className="erreur" style={{ margin: "0 0 12px" }}>{souci}</p> : null}

      {vue === "liste" ? (
        <div className="tableau-enveloppe carte" style={{ padding: 0 }}>
          <table className="tableau parc-table">
            <thead>
              <tr>
                <th>Machine</th><th>Stade</th><th>Compte</th><th>Adresse</th><th>Depuis</th><th><span className="lecteur-seul">Gestes</span></th>
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 ? (
                <tr><td colSpan={6} className="vide-table">Aucune machine ne correspond.</td></tr>
              ) : [...filtrees].sort((a, b) => RANG[a.statut] - RANG[b.statut] || a.nom.localeCompare(b.nom, "fr")).map((m) => (
                <tr key={m.id} id={`m${m.id}`} data-stade={m.statut}>
                  <th>
                    <span className="nom-machine">{m.nom}</span>
                    <span className="sous-ligne mono">{m.numero ? `n° ${m.numero}` : "sans numéro"}</span>
                  </th>
                  <td>
                    <label className="stade-select">
                      <span className="lecteur-seul">Stade de {m.nom}</span>
                      <i aria-hidden="true" />
                      <select value={m.statut} onChange={(e) => void deplacer(m.id, e.target.value as Statut)}>
                        {STATUTS.map((x) => <option key={x.cle} value={x.cle}>{x.nom}</option>)}
                      </select>
                    </label>
                    {m.statut === "installee" ? (
                      <span className="pilule" data-etat={ETAT_INSTALLEE[m.etat][1] === "ok" ? "ok" : ETAT_INSTALLEE[m.etat][1] === "mal" ? "mal" : "attente"}>
                        <i />{ETAT_INSTALLEE[m.etat][0]}
                      </span>
                    ) : null}
                  </td>
                  <td>{m.compte ?? <span className="faible">—</span>}</td>
                  <td>
                    <span className="adresse">{m.adresse ?? <span className="faible">à préciser</span>}</span>
                    {!m.situee ? <span className="sous-ligne">pas sur la carte</span> : null}
                  </td>
                  <td className="faible">{m.depuis}</td>
                  <td className="gestes">
                    <button type="button" className="bouton petit" onClick={() => attribuer(m)} disabled={m.appairee}
                            title={m.appairee ? "Appairée : désappairez-la pour changer de compte" : undefined}>
                      {m.compte_id ? "Réattribuer" : "Attribuer"}
                    </button>
                    <a href={`/carte/situer/${m.id}?r=parc`} className="bouton petit" title={m.situee ? "Re-situer sur la carte" : "Placer sur la carte"}>
                      <IcoEpingle size={15} /><span className="lecteur-seul">{m.situee ? "Re-situer" : "Placer"}</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="kanban" onDragEnd={() => { tenir(null); survoler(null); }}>
          {STATUTS.map((s, rangStade) => {
            const cartes = filtrees.filter((m) => m.statut === s.cle);
            const nPages = Math.max(1, Math.ceil(cartes.length / PAR_PAGE));
            const page = Math.min(pages[s.cle] ?? 0, nPages - 1);
            const vues = cartes.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
            const aller = (p: number) => poserPages((x) => ({ ...x, [s.cle]: p }));
            const precedent = STATUTS[rangStade - 1];
            const suivant = STATUTS[rangStade + 1];
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
                {cartes.length === 0 ? <p className="vide">{tenue !== null ? "Déposez ici." : "Rien ici."}</p> : null}
                {vues.map((m) => (
                  <article key={m.id} id={`m${m.id}`} className="machine" draggable
                           data-tenue={tenue === m.id ? "" : undefined}
                           data-visee={visee?.id === m.id ? "" : undefined}
                           onDragStart={(ev) => { tenir(m.id); ev.dataTransfer.effectAllowed = "move"; }}>
                    <div className="haut">
                      <span className="nom">{m.nom}</span>
                      {m.numero ? <span className="serie mono">{m.numero}</span> : null}
                    </div>
                    <div className="qui" data-vide={m.compte ? undefined : ""}>
                      <span className="jeton-compte" aria-hidden="true">{(m.compte ?? "?").slice(0, 1).toUpperCase()}</span>
                      <span className="texte">{m.compte ?? "sans compte"}</span>
                    </div>
                    <div className="ou">
                      <IcoEpingle size={13} />
                      <span>{m.adresse ?? "adresse à préciser"}</span>
                    </div>
                    <div className="etats">
                      {m.statut === "installee" ? (
                        <span className={`pilule ${ETAT_INSTALLEE[m.etat][1]}`}><i />{ETAT_INSTALLEE[m.etat][0]}</span>
                      ) : null}
                      {!m.situee ? <span className="pilule attente"><i />pas sur la carte</span> : null}
                      <span className="depuis">{m.depuis}</span>
                    </div>

                    <div className="gestes">
                      <button type="button" className="bouton petit carre" disabled={!precedent}
                              onClick={() => precedent && void deplacer(m.id, precedent.cle)}
                              title={precedent ? `Passer en « ${precedent.nom} »` : undefined}
                              aria-label={precedent ? `Passer en ${precedent.nom}` : "Premier stade"}>
                        <IcoPrecedent size={15} />
                      </button>
                      <button type="button" className="bouton petit" onClick={() => attribuer(m)} disabled={m.appairee}
                              title={m.appairee ? "Appairée : désappairez-la pour changer de compte" : undefined}>
                        {m.compte_id ? "Réattribuer" : "Attribuer"}
                      </button>
                      <a href={`/carte/situer/${m.id}?r=parc`} className="bouton petit carre"
                         title={m.situee ? "Re-situer sur la carte" : "Placer sur la carte"}
                         aria-label={m.situee ? "Re-situer sur la carte" : "Placer sur la carte"}>
                        <IcoEpingle size={15} />
                      </a>
                      <button type="button" className="bouton petit carre" disabled={!suivant}
                              onClick={() => suivant && void deplacer(m.id, suivant.cle)}
                              title={suivant ? `Passer en « ${suivant.nom} »` : undefined}
                              aria-label={suivant ? `Passer en ${suivant.nom}` : "Dernier stade"}>
                        <IcoChevron size={15} />
                      </button>
                    </div>

                    <details>
                      <summary>Tout modifier</summary>
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
      )}

      {attribuee ? (
        <Attribution machine={attribuee} comptes={comptes} fermer={() => attribuer(null)} />
      ) : null}
    </>
  );
}

/**
 * ATTRIBUER UNE MACHINE : a qui, et ou. On cherche le compte par son nom —
 * trente comptes dans un menu deroulant ne se parcourent plus —, on donne
 * l'adresse prevue. Une machine libre qui recoit un compte passe en commandee ;
 * la rendre a « aucun compte » la remet libre a l'achat.
 *
 * Le formulaire renvoie TOUTE la fiche (numero, nom, note) : la route la
 * reecrit en entier, un champ absent l'effacerait.
 */
function Attribution({ machine: m, comptes, fermer }: { machine: Machine; comptes: Compte[]; fermer: () => void }) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const [cherche, chercher] = useState("");
  const [choisi, choisir] = useState<string>(m.compte_id ? String(m.compte_id) : "");

  useEffect(() => {
    const d = fenetre.current;
    if (d && !d.open) d.showModal();
  }, []);

  const trouves = useMemo(() => {
    const x = pli(cherche.trim());
    return x ? comptes.filter((c) => pli(c.nom).includes(x)) : comptes;
  }, [comptes, cherche]);
  // Ce que la route fera du stade — ecrit ici pour l'annoncer, et envoye tel quel.
  const devient: Statut = choisi === ""
    ? (m.statut === "commandee" || m.statut === "bientot" ? "libre" : m.statut)
    : (m.statut === "libre" ? "commandee" : m.statut);
  const nomDevient = STATUTS.find((s) => s.cle === devient)?.nom ?? devient;

  return (
    <dialog ref={fenetre} className="parc-fenetre" onClose={fermer}
            onClick={(e) => { if (e.target === fenetre.current) fenetre.current?.close(); }}
            aria-labelledby="attribuer-titre">
      <form method="post" action="/api/admin/parc/modifier">
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="statut" value={devient} />
        <input type="hidden" name="numero" value={m.numero ?? ""} />
        <input type="hidden" name="nom" value={m.nom} />
        <input type="hidden" name="note" value={m.note ?? ""} />
        <input type="hidden" name="compte_id" value={choisi} />

        <header>
          <div>
            <h2 id="attribuer-titre">Attribuer {m.nom}</h2>
            <p>{m.numero ? `n° ${m.numero} · ` : ""}{STATUTS.find((s) => s.cle === m.statut)?.nom}</p>
          </div>
          <button type="button" className="bouton icone" aria-label="Fermer" onClick={() => fenetre.current?.close()}>×</button>
        </header>

        <div className="corps">
          <label className="parc-recherche">
            <IcoLoupe size={17} />
            <span className="lecteur-seul">Chercher un compte</span>
            <input type="search" autoFocus value={cherche} onChange={(e) => chercher(e.target.value)} placeholder="Chercher un compte…" />
          </label>
          <div className="comptes" role="radiogroup" aria-label="Compte">
            <label data-choisi={choisi === "" ? "" : undefined}>
              <input type="radio" name="choix-compte" checked={choisi === ""} onChange={() => choisir("")} />
              <span className="jeton-compte sans" aria-hidden="true">—</span>
              <span className="nom">Aucun compte <span className="faible">· libre à l’achat</span></span>
            </label>
            {trouves.map((c) => (
              <label key={c.id} data-choisi={choisi === String(c.id) ? "" : undefined}>
                <input type="radio" name="choix-compte" checked={choisi === String(c.id)} onChange={() => choisir(String(c.id))} />
                <span className="jeton-compte" aria-hidden="true">{c.nom.slice(0, 1).toUpperCase()}</span>
                <span className="nom">{c.nom}</span>
              </label>
            ))}
            {trouves.length === 0 ? <p className="faible" style={{ margin: 8 }}>Aucun compte ne s’appelle ainsi.</p> : null}
          </div>

          <div className="champ" style={{ marginTop: 14 }}>
            <label htmlFor="attribuer-adresse">Adresse prévue</label>
            <input id="attribuer-adresse" name="adresse" defaultValue={m.adresse ?? ""} maxLength={160}
                   placeholder="12 rue des Lilas, 33000 Bordeaux" />
          </div>
          <p className="parc-devient">
            Après enregistrement : <span className="pilule stade" data-stade={devient}><i />{nomDevient}</span>
          </p>
        </div>

        <footer>
          <button type="button" className="bouton" onClick={() => fenetre.current?.close()}>Annuler</button>
          <button className="bouton primaire">Enregistrer</button>
        </footer>
      </form>
    </dialog>
  );
}
