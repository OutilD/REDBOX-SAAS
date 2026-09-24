import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, depuis } from "@/db";
import { estSuperAdmin, utilisateur } from "@/lib/auth";
import { Repli } from "../../repli";
import { IcoAlerte } from "../../icones";

export const dynamic = "force-dynamic";

const JOURS = 14;

/**
 * LA SANTE DE LA CONSOLE, pour les super-admins : ce qui est lent et ce qui
 * plante, en production, sans lire les journaux du serveur. Les requetes de
 * plus d'une seconde et les erreurs sont relevees par `db.relever` et le
 * crochet `onRequestError` ; on garde quatorze jours.
 */
export default async function SanteConsole() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");

  // Le menage d'abord : quatorze jours suffisent a voir une tendance.
  await q(`DELETE FROM releve_perf WHERE quand < now() - interval '${JOURS} days'`);
  const [jour, lentes, erreurs] = await Promise.all([
    q<{ genre: string; n: number; p95: number | null }>(`
      SELECT genre, COUNT(*)::int AS n,
             percentile_disc(0.95) WITHIN GROUP (ORDER BY duree_ms)::int AS p95
        FROM releve_perf WHERE quand > now() - interval '24 hours' GROUP BY genre`),
    q<{ texte: string; n: number; moyenne: number; pire: number; derniere: Date }>(`
      SELECT texte, COUNT(*)::int AS n, AVG(duree_ms)::int AS moyenne, MAX(duree_ms)::int AS pire, MAX(quand) AS derniere
        FROM releve_perf WHERE genre = 'sql_lente'
       GROUP BY texte ORDER BY COUNT(*) * AVG(duree_ms) DESC LIMIT 20`),
    q<{ texte: string; route: string | null; n: number; derniere: Date }>(`
      SELECT texte, route, COUNT(*)::int AS n, MAX(quand) AS derniere
        FROM releve_perf WHERE genre = 'erreur'
       GROUP BY texte, route ORDER BY MAX(quand) DESC LIMIT 30`),
  ]);
  const lentes24 = jour.find((x) => x.genre === "sql_lente");
  const erreurs24 = jour.find((x) => x.genre === "erreur")?.n ?? 0;

  return (
    <>
      <Entete page="admin_sante" />
      <main className="ecran">
        <h1 style={{ marginTop: 18 }}>Santé de la console</h1>
        <p className="sous" style={{ maxWidth: 720 }}>
          Ce qui est lent et ce qui plante, en production. Une requête à la base de plus d’une seconde,
          ou une erreur du serveur, est relevée ici — au plus une fois par minute pour la même. Gardé {JOURS} jours.
        </p>

        <div className="bandeau quatre">
          <div><div className={`stat ${(lentes24?.n ?? 0) > 20 ? "alerte" : ""}`}><span className="valeur num">{lentes24?.n ?? 0}</span><span className="libelle">requêtes lentes (24 h)</span></div></div>
          <div><div className="stat"><span className="valeur num">{lentes24?.p95 ? `${(lentes24.p95 / 1000).toFixed(1).replace(".", ",")} s` : "—"}</span><span className="libelle">95 % sous (24 h)</span></div></div>
          <div><div className={`stat ${erreurs24 ? "alerte" : ""}`}><span className="valeur num">{erreurs24}</span><span className="libelle">erreur{erreurs24 > 1 ? "s" : ""} serveur (24 h)</span></div></div>
          <div><div className="stat"><span className="valeur num">{erreurs.length}</span><span className="libelle">erreurs distinctes ({JOURS} j)</span></div></div>
        </div>

        <h2>Erreurs du serveur</h2>
        {erreurs.length === 0 ? (
          <Repli icone={<IcoAlerte />} titre="Aucune erreur relevée" dedans />
        ) : (
          <div className="carte plate"><div className="lignes">
            {erreurs.map((e, i) => (
              <div className="ligne" key={i}>
                <div className="corps">
                  <div className="nom mono" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{e.texte}</div>
                  <div className="meta">{e.route ?? "route inconnue"} · {e.n} fois · dernière {depuis(e.derniere)}</div>
                </div>
              </div>
            ))}
          </div></div>
        )}

        <h2>Requêtes lentes</h2>
        {lentes.length === 0 ? (
          <Repli icone={<IcoAlerte />} titre="Aucune requête lente relevée" dedans />
        ) : (
          <div className="carte plate"><div className="lignes">
            {lentes.map((l, i) => (
              <div className="ligne" key={i}>
                <div className="corps">
                  <div className="nom mono" style={{ fontSize: 12.5, overflowWrap: "anywhere", fontWeight: 500 }}>{l.texte}</div>
                  <div className="meta">{l.n} fois · moyenne {(l.moyenne / 1000).toFixed(1).replace(".", ",")} s · pire {(l.pire / 1000).toFixed(1).replace(".", ",")} s · dernière {depuis(l.derniere)}</div>
                </div>
              </div>
            ))}
          </div></div>
        )}
      </main>
      <NavBasse page="admin_sante" />
    </>
  );
}
