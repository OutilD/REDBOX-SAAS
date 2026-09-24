import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1, depuis, FUSEAU } from "@/db";
import { peutVoirBorne, utilisateur } from "@/lib/auth";
import { AVORTEES, LIBELLES, SQL_AVORTEE } from "@/lib/ventes";
import { Repli } from "../../../repli";
import { IcoBorne } from "../../../icones";

export const dynamic = "force-dynamic";

const JOURS = 30;

type Evenement = { id: number; quand: Date; titre: string; corps: string; genre: Genre };
type Genre = "coupure" | "retour" | "redemarrage" | "terminal_panne" | "terminal_retour" | "reset" | "service" | "maj" | "autre";

/**
 * De quoi parle une ligne de la machine : son titre, ecrit par `composer`
 * dans `lib/notifications.ts`. On lit le debut, c'est stable.
 */
function genreDe(titre: string): Genre {
  if (titre.startsWith("Hors ligne")) return "coupure";
  if (titre.startsWith("De retour")) return "retour";
  if (titre.startsWith("Redémarrée")) return "redemarrage";
  if (titre.startsWith("Terminal de paiement en panne")) return "terminal_panne";
  if (titre.startsWith("Terminal de paiement revenu")) return "terminal_retour";
  if (titre.startsWith("Terminal de paiement réinitialisé") || titre.startsWith("Réinitialisation échouée")) return "reset";
  if (titre.startsWith("Mise hors service") || titre.startsWith("Remise en service")) return "service";
  if (titre.startsWith("Mise à jour")) return "maj";
  return "autre";
}

const NOMS: Record<Genre, string> = {
  coupure: "Coupure", retour: "De retour", redemarrage: "Redémarrage", terminal_panne: "Terminal en panne",
  terminal_retour: "Terminal revenu", reset: "Terminal réinitialisé", service: "Mise en/hors service", maj: "Mise à jour", autre: "Autre",
};

/**
 * LA SANTE D'UNE MACHINE SUR TRENTE JOURS.
 *
 * Une RedBox qui decroche une fois, ca arrive ; une qui decroche tous les
 * trois jours, c'est une prise qui bouge, un routeur fatigue ou un terminal
 * qui se fige — et on ne le voit qu'en mettant les evenements bout a bout.
 * Ici : les coupures, redemarrages et pannes de terminal que la console a
 * annonces (ce sont ses propres messages dans le salon de la machine), les
 * paiements qui n'ont pas abouti, et une bande d'un jour par case.
 */
export default async function Sante({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!peutVoirBorne(u, id)) notFound();
  const b = await q1<{ id: number; nom: string; vue_le: Date | null; sante: { paiement?: string; paiement_pertes?: number } | null }>(
    "SELECT id, nom, vue_le, sante FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) notFound();

  const [lignes, avortees, ventes] = await Promise.all([
    q<{ id: number; quand: Date; texte: string }>(`
      SELECT m.id, m.cree_le AS quand, m.texte
        FROM message m JOIN salon s ON s.id = m.salon_id
       WHERE s.borne_id = $1 AND m.utilisateur_id IS NULL AND m.supprime_le IS NULL
         AND m.cree_le >= now() - interval '${JOURS} days'
       ORDER BY m.cree_le DESC LIMIT 400`, [id]),
    q<{ statut: string; n: number }>(`
      SELECT v.statut, COUNT(*)::int AS n FROM vente v
       WHERE v.borne_id = $1 AND ${SQL_AVORTEE} AND v.faite_le >= now() - interval '${JOURS} days'
       GROUP BY v.statut`, [id]),
    q<{ jour: string; n: number }>(`
      SELECT to_char(v.faite_le AT TIME ZONE '${FUSEAU}', 'YYYY-MM-DD') AS jour, COUNT(*)::int AS n
        FROM vente v WHERE v.borne_id = $1 AND v.statut = 'distribue' AND v.faite_le >= now() - interval '${JOURS} days'
       GROUP BY 1`, [id]),
  ]);

  const evenements: Evenement[] = lignes.map((l) => {
    const [titre, ...reste] = l.texte.split("\n");
    return { id: l.id, quand: l.quand, titre, corps: reste.join(" "), genre: genreDe(titre) };
  }).filter((e) => e.genre !== "autre");
  const compte = (g: Genre) => evenements.filter((e) => e.genre === g).length;
  const coupures = compte("coupure"), redemarrages = compte("redemarrage"), pannes = compte("terminal_panne");
  const refusees = avortees.filter((a) => a.statut === "carte_refusee").reduce((s, a) => s + a.n, 0);
  const nAvortees = avortees.reduce((s, a) => s + a.n, 0);
  const pertes = Number(b.sante?.paiement_pertes ?? 0);

  // La bande : un jour par case, du plus ancien au plus recent.
  const jourDe = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: FUSEAU });
  const parJour = new Map<string, Genre[]>();
  for (const e of evenements) parJour.set(jourDe(e.quand), [...(parJour.get(jourDe(e.quand)) ?? []), e.genre]);
  const ventesParJour = new Map(ventes.map((v) => [v.jour, v.n]));
  const cases: { jour: string; ton: "mal" | "attente" | "ok" | "rien"; titre: string }[] = [];
  for (let i = JOURS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const jour = jourDe(d);
    const g = parJour.get(jour) ?? [];
    const n = ventesParJour.get(jour) ?? 0;
    const grave = g.some((x) => x === "coupure" || x === "terminal_panne");
    const moyen = g.some((x) => x === "redemarrage" || x === "reset" || x === "service");
    const ton = grave ? "mal" : moyen ? "attente" : n > 0 || g.length > 0 ? "ok" : "rien";
    const dit = [n ? `${n} vente${n > 1 ? "s" : ""}` : "aucune vente", ...g.map((x) => NOMS[x])].join(" · ");
    cases.push({ jour, ton, titre: `${new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: FUSEAU })} : ${dit}` });
  }

  const verdict = coupures + pannes === 0 && redemarrages <= 1
    ? "Rien à signaler sur trente jours."
    : coupures + pannes >= 3
      ? "Cette machine décroche souvent : vérifiez son alimentation, sa box internet et son terminal."
      : "Quelques incidents, rien d’inquiétant si ça ne se répète pas.";

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href={`/bornes/${id}`} className="bouton petit" aria-label="Retour à la RedBox">‹</Link>
          <div className="pousse">
            <h1 style={{ margin: 0, fontSize: 22 }}>Santé</h1>
            <div className="faible" style={{ fontSize: 13 }}>{b.nom} · sur {JOURS} jours{b.vue_le ? ` · vue ${depuis(b.vue_le)}` : ""}</div>
          </div>
        </div>
        <p className="sous" style={{ marginTop: 12, maxWidth: 720 }}>{verdict}</p>

        <div className="bandeau quatre">
          <div><div className={`stat ${coupures ? "alerte" : ""}`}><span className="valeur num">{coupures}</span><span className="libelle">coupure{coupures > 1 ? "s" : ""} (plus de 15 min)</span></div></div>
          <div><div className={`stat ${redemarrages > 1 ? "alerte" : ""}`}><span className="valeur num">{redemarrages}</span><span className="libelle">redémarrage{redemarrages > 1 ? "s" : ""}</span></div></div>
          <div><div className={`stat ${pannes ? "alerte" : ""}`}><span className="valeur num">{pannes}</span><span className="libelle">panne{pannes > 1 ? "s" : ""} du terminal</span></div></div>
          <div><div className={`stat ${refusees > 5 ? "alerte" : ""}`}><span className="valeur num">{refusees}</span><span className="libelle">carte{refusees > 1 ? "s" : ""} refusée{refusees > 1 ? "s" : ""}</span></div></div>
        </div>

        <h2>Jour par jour</h2>
        <div className="carte">
          <div className="sante-bande" role="img" aria-label={`Trente derniers jours : ${cases.filter((c) => c.ton === "mal").length} jour(s) avec incident`}>
            {cases.map((c) => <span key={c.jour} className={`case ${c.ton}`} title={c.titre} />)}
          </div>
          <div className="sante-legende faible">
            <span><i className="ok" /> vend, sans incident</span>
            <span><i className="attente" /> redémarrage ou réglage</span>
            <span><i className="mal" /> coupure ou terminal en panne</span>
            <span><i className="rien" /> aucune vente</span>
          </div>
        </div>

        {nAvortees > 0 || pertes > 0 ? (
          <>
            <h2>Paiements qui n’ont pas abouti</h2>
            <div className="carte plate"><div className="lignes">
              {AVORTEES.map((st) => avortees.find((a) => a.statut === st)).filter((a): a is { statut: string; n: number } => !!a).map((a) => (
                <div className="ligne" key={a.statut}>
                  <div className="corps"><div className="nom">{LIBELLES[a.statut] ?? a.statut}</div></div>
                  <div className="fin num">{a.n}</div>
                </div>
              ))}
              {pertes > 0 ? (
                <div className="ligne">
                  <div className="corps"><div className="nom">Réponses du terminal perdues</div>
                    <div className="meta">compteur de la machine depuis son dernier démarrage</div></div>
                  <div className="fin num">{pertes}</div>
                </div>
              ) : null}
            </div></div>
          </>
        ) : null}

        <h2>Ce qui s’est passé</h2>
        {evenements.length === 0 ? (
          <Repli icone={<IcoBorne />} titre="Aucun incident sur trente jours" dedans />
        ) : (
          <div className="carte plate"><div className="lignes">
            {evenements.map((e) => (
              <div className="ligne" key={e.id}>
                <span className={`pilule ${e.genre === "coupure" || e.genre === "terminal_panne" ? "mal" : e.genre === "retour" || e.genre === "terminal_retour" ? "ok" : "attente"}`}><i />{NOMS[e.genre]}</span>
                <div className="corps">
                  <div className="nom">{e.titre.replace(/ · .*$/, "")}</div>
                  <div className="meta">{e.corps}</div>
                </div>
                <div className="fin faible" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{depuis(e.quand)}</div>
              </div>
            ))}
          </div></div>
        )}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
