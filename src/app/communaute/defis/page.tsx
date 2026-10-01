import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { estSuperAdmin, peutConfigurer, utilisateur } from "@/lib/auth";
import { FORMES_DEFI, MESURES, avancement, classementDefi, evaluerDefis, joursRestants,
         lesDefis, periode, rangDefi, type Defi, type Participant } from "@/lib/defis";
import { Badge } from "../badge";
import { Portrait } from "../vignette-personne";

export const dynamic = "force-dynamic";

const ERREURS: Record<string, string> = {
  champs: "Il manque un titre, une mesure, un objectif ou des dates valides.",
  dates: "La fin doit venir après le début.",
};

/**
 * LES DEFIS DU MOIS.
 *
 * Le defi en cours d'abord : ou j'en suis, combien de jours il reste, et le
 * classement de tous ceux qui y participent. Ensuite ce qui arrive et ce qui
 * est passe. L'equipe RedBox les pose en bas de page.
 */
export default async function Defis({ searchParams }:
  { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { e, ok } = await searchParams;
  // Comme les badges a la Communaute : on vient voir, donc on evalue ici.
  // AVANT de lire les defis, et pas en parallele : le compteur « reussi par »
  // et la coche du classement doivent compter le defi qu'on vient de reussir.
  await evaluerDefis(u.id);
  const { enCours, aVenir, passes } = await lesDefis();
  // Mon avancement et le classement ne dependent que du defi : ensemble.
  const details = await Promise.all(enCours.map(async (d) => {
    const [moi, classement] = await Promise.all([avancement(d, u.id), classementDefi(d)]);
    return { d, moi, classement };
  }));
  // Comme la route qui les publie : un membre « lecture » de l'editeur ne voit pas le formulaire.
  const editeur = estSuperAdmin(u) || (u.editeur && peutConfigurer(u));

  // Par defaut, le mois civil en cours (heure de Paris).
  const ici = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const [a, m] = ici.split("-").map(Number);
  const debutMois = `${a}-${String(m).padStart(2, "0")}-01`;
  const finMois = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);

  return (
    <>
      <Entete page="communaute" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/communaute" className="bouton petit" aria-label="Retour à la communauté">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Défis du mois</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12, maxWidth: 720 }}>
          Un même objectif pour tous les redboxers, le temps d’un mois. Atteint, le trophée
          est à vous pour toujours, avec ses points.
        </p>

        {ok ? <p className="avis-ok">{ok === "cree" ? "Défi publié." : "Défi retiré."}</p> : null}
        {e ? <p className="erreur">{ERREURS[e] ?? "Impossible."}</p> : null}

        {details.length === 0 ? (
          <div className="carte" style={{ marginTop: 14 }}>
            <p className="faible" style={{ margin: 0 }}>
              Aucun défi en cours.{aVenir.length > 0 ? ` Le prochain commence ${periode(aVenir[0]).replace(/^du /, "le ").replace(/ au .*$/, "")}.` : ""}
            </p>
          </div>
        ) : null}

        {details.map(({ d, moi, classement }) => (
          <DefiEnCours key={d.id} d={d} moi={moi} classement={classement} uid={u.id} editeur={editeur} />
        ))}

        {aVenir.length > 0 ? (
          <>
            <div className="titre-section"><h2>À venir</h2></div>
            <div className="lignes">
              {aVenir.map((d) => <LigneDefi key={d.id} d={d} editeur={editeur} />)}
            </div>
          </>
        ) : null}

        {passes.length > 0 ? (
          <>
            <div className="titre-section"><h2>Terminés</h2></div>
            <div className="lignes">
              {passes.map((d) => <LigneDefi key={d.id} d={d} editeur={editeur} />)}
            </div>
          </>
        ) : null}

        {editeur ? (
          <form method="post" action="/api/communaute/defis" className="carte" style={{ marginTop: 22 }}>
            <input type="hidden" name="action" value="creer" />
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Publier un défi</h2>
            <p className="faible" style={{ fontSize: 13, margin: "0 0 14px" }}>
              Visible par tous les redboxers dès sa date de début. Les bornes et salons de démonstration ne comptent pas.
            </p>
            <div className="champ">
              <label htmlFor="titre">Titre</label>
              <input id="titre" name="titre" maxLength={80} required placeholder="100 ventes en octobre" />
            </div>
            <div className="deux-colonnes">
              <div className="champ">
                <label htmlFor="mesure">Ce qui compte</label>
                <select id="mesure" name="mesure" defaultValue="ventes">
                  {Object.entries(MESURES).map(([k, v]) => <option key={k} value={k}>{v.nom}</option>)}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="objectif">Objectif</label>
                <input id="objectif" name="objectif" type="number" min={1} max={1000000} required defaultValue={100} />
              </div>
            </div>
            <div className="deux-colonnes">
              <div className="champ">
                <label htmlFor="debut">Début</label>
                <input id="debut" name="debut" type="date" required defaultValue={debutMois} />
              </div>
              <div className="champ">
                <label htmlFor="fin">Fin (incluse)</label>
                <input id="fin" name="fin" type="date" required defaultValue={finMois} />
              </div>
            </div>
            <div className="deux-colonnes">
              <div className="champ">
                <label htmlFor="forme">Trophée</label>
                <select id="forme" name="forme" defaultValue="trophee">
                  {FORMES_DEFI.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="points">Points</label>
                <input id="points" name="points" type="number" min={0} max={1000} defaultValue={150} />
              </div>
            </div>
            <button className="bouton primaire">Publier</button>
          </form>
        ) : null}
      </main>
      <NavBasse page="communaute" />
    </>
  );
}

function DefiEnCours({ d, moi, classement, uid, editeur }:
  { d: Defi; moi: number; classement: Participant[]; uid: number; editeur: boolean }) {
  const pct = Math.min(100, Math.round((moi / d.objectif) * 100));
  const reste = joursRestants(d.fin);
  const unite = MESURES[d.mesure].unite;
  const fait = moi >= d.objectif;
  return (
    <section style={{ marginTop: 14 }}>
      <div className={`carte${fait ? " chaude" : ""}`}>
        <div className="rangee" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Badge forme={d.forme} taille={72} rang={rangDefi(d.points)} obtenu={fait} titre={d.titre} />
          <div className="pousse" style={{ minWidth: 200 }}>
            <div style={{ fontSize: 20, fontWeight: 750, letterSpacing: "-.02em" }}>{d.titre}</div>
            <div className="faible" style={{ fontSize: 13.5 }}>
              {MESURES[d.mesure].nom} · {d.objectif} {d.objectif > 1 ? unite[1] : unite[0]} · {periode(d)}
            </div>
            <div className="faible num" style={{ fontSize: 13, marginTop: 2 }}>
              {reste > 1 ? `${reste} jours restants` : reste === 1 ? "Dernier jour" : "Terminé"}
              {" · "}+{d.points} pts · réussi par {d.reussis}
            </div>
          </div>
          {editeur ? <Retirer id={d.id} /> : null}
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="piste" style={{ height: 10, borderRadius: 5, background: "var(--surface-3)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--rouge)", borderRadius: 5 }} />
          </div>
          <div className="rangee num" style={{ justifyContent: "space-between", marginTop: 6, fontSize: 13.5 }}>
            <span><b>{moi}</b> / {d.objectif}</span>
            <span className="faible">{fait ? "Défi réussi — trophée gagné" : `encore ${d.objectif - moi}`}</span>
          </div>
        </div>
      </div>

      <div className="titre-section">
        <h2>Classement du défi</h2>
        <span className="faible num" style={{ fontSize: 12.5 }}>
          {classement.length} participant{classement.length > 1 ? "s" : ""}
        </span>
      </div>
      {classement.length === 0 ? (
        <p className="faible" style={{ fontSize: 13.5 }}>Personne n’a encore marqué. La première place est libre.</p>
      ) : (
        <ol className="palmares ouvert">
          {classement.map((p, i) => {
            const rang = i + 1;
            const medaille = rang === 1 ? "or" : rang === 2 ? "argent" : rang === 3 ? "bronze" : "";
            const part = Math.min(100, Math.round((p.n / d.objectif) * 100));
            return (
              <li key={p.id} className={[p.id === uid ? "moi" : "", medaille].filter(Boolean).join(" ")}>
                <Link href={`/communaute/${p.id}`} className="ligne">
                  <span className="rang num">{rang}<sup>{rang === 1 ? "er" : "e"}</sup></span>
                  <Portrait image_id={p.image_id} pseudo={p.pseudo} couleur={p.couleur} taille={44} />
                  <span className="qui">
                    <span className="nom">
                      <span>{p.pseudo}</span>
                      {p.editeur ? <span className="etiquette editeur">RedBox</span> : null}
                      {p.id === uid ? <span className="etiquette">vous</span> : null}
                    </span>
                    <span className="dessous">{p.reussi ? "Objectif atteint ✓" : `${part} % de l’objectif`}</span>
                  </span>
                  <span className="part" aria-hidden="true">
                    <span className="piste"><span style={{ width: `${part}%` }} /></span>
                  </span>
                  <span className="pts">
                    <span className="n num">{p.n}<small>/ {d.objectif}</small></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LigneDefi({ d, editeur }: { d: Defi; editeur: boolean }) {
  return (
    <div className="carte plate rangee" style={{ gap: 12, alignItems: "center", marginTop: 8 }}>
      <Badge forme={d.forme} taille={36} rang={rangDefi(d.points)} titre={d.titre} />
      <div className="pousse">
        <div style={{ fontWeight: 700 }}>{d.titre}</div>
        <div className="faible" style={{ fontSize: 12.5 }}>
          {d.objectif} · {MESURES[d.mesure].nom.toLowerCase()} · {periode(d)} · réussi par {d.reussis}
        </div>
      </div>
      {editeur ? <Retirer id={d.id} /> : null}
    </div>
  );
}

function Retirer({ id }: { id: number }) {
  return (
    <form method="post" action="/api/communaute/defis">
      <input type="hidden" name="action" value="retirer" />
      <input type="hidden" name="id" value={id} />
      <button className="bouton petit danger" title="Retire le défi et les trophées déjà gagnés">Retirer</button>
    </form>
  );
}
