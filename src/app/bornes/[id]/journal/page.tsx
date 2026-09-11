import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../../chrome";
import { q, q1, depuis, FUSEAU } from "@/db";
import { peutVoirBorne, utilisateur } from "@/lib/auth";
import { NOM_SOURCE, SOURCES, estSource, texteDe, type Source } from "@/lib/journal";
import { Repli } from "../../../repli";

export const dynamic = "force-dynamic";

type Borne = { id: number; nom: string; version: string | null };

type Ligne = {
  id: number; source: Source; quand: Date; commande_id: string | null; ligne: string;
};

/** Combien de lignes par page. Assez pour lire une soiree, pas de quoi noyer le navigateur. */
const PAGE = 300;

/**
 * LE JOURNAL D'UNE BORNE, LU DEPUIS ICI.
 *
 * La machine ecrit deux fichiers sur son disque : le journal des commandes
 * (chaque geste d'une vente, grave avant d'etre fait) et la trace technique
 * (ce qui passe sur les bus). Jusqu'ici, les lire voulait dire ouvrir la porte,
 * brancher une cle et exporter. La borne les recopie maintenant a chaque
 * synchronisation, et c'est cette copie qu'on regarde.
 *
 * UNE SEULE QUESTION A LA FOIS. On arrive ici pour une commande precise — celle
 * dont le client dit qu'il a paye sans rien recevoir — ou pour une heure precise.
 * Le filtre par commande melange donc les deux journaux dans l'ordre du temps :
 * c'est le recit complet de cette vente, du panier au verdict de la cellule.
 */
export default async function JournalBorne({ params, searchParams }:
  { params: Promise<{ id: string }>;
    searchParams: Promise<{ s?: string; c?: string; q?: string; j?: string; avant?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!peutVoirBorne(u, id)) notFound();
  const sp = await searchParams;

  const b = await q1<Borne>(
    "SELECT id, nom, version FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) notFound();

  // Un numero de commande tape dans la recherche vaut filtre par commande :
  // c'est ce qu'on colle depuis la page des ventes ou depuis l'ecran d'echec de
  // la machine, et c'est toujours la question qu'on vient poser.
  const source: Source | null = estSource(sp.s) ? sp.s : null;
  const saisie = (sp.q ?? "").trim();
  const commande = (sp.c ?? (/^ORD-[0-9A-Z]{8}$/i.test(saisie) ? saisie : "")).toUpperCase() || null;
  const texte = commande && saisie.toUpperCase() === commande ? null : (saisie || null);
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(sp.j ?? "") ? sp.j! : null;
  const avant = sp.avant && !Number.isNaN(Date.parse(sp.avant)) ? new Date(sp.avant) : null;

  // L'ordre du temps est celui de la ligne (l'heure que la borne a ecrite), pas
  // celui de l'arrivee ici : les deux journaux voyagent dans des paquets
  // separes et se croiseraient. Une ligne sans heure prend celle de sa reception.
  //
  // POUR UNE COMMANDE, ON PREND AUSSI CE QUI S'EST PASSE PENDANT. Les trames de
  // la carte et du terminal ne portent pas le numero de commande ; or ce sont
  // elles qu'on vient lire — la reponse de la cellule, le VEND APPROVED, le
  // remboursement. On ouvre donc la fenetre du premier au dernier geste de la
  // commande, avec un peu de marge, et on y verse tout ce que la borne a ecrit.
  const lignes = commande
    ? await q<Ligne>(`
        WITH fen AS (
          SELECT MIN(horodatage) AS du, MAX(horodatage) AS au
            FROM journal_borne WHERE borne_id = $1 AND commande_id = $2)
        SELECT j.id, j.source, COALESCE(j.horodatage, j.recu_le) AS quand, j.commande_id, j.ligne
          FROM journal_borne j, fen
         WHERE j.borne_id = $1
           AND ($3::text IS NULL OR j.source = $3)
           AND (j.commande_id = $2
                OR j.horodatage BETWEEN fen.du - interval '3 seconds' AND fen.au + interval '8 seconds')
         ORDER BY quand ASC, j.id ASC
         LIMIT ${PAGE + 1}`,
        [id, commande, source])
    : await q<Ligne>(`
        SELECT id, source, COALESCE(horodatage, recu_le) AS quand, commande_id, ligne
          FROM journal_borne
         WHERE borne_id = $1
           AND ($2::text IS NULL OR source = $2)
           AND ($3::text IS NULL OR ligne ILIKE '%' || $3 || '%')
           AND ($4::date IS NULL OR (COALESCE(horodatage, recu_le) AT TIME ZONE '${FUSEAU}')::date = $4)
           AND ($5::timestamptz IS NULL OR COALESCE(horodatage, recu_le) < $5)
         ORDER BY quand DESC, id DESC
         LIMIT ${PAGE + 1}`,
        [id, source, texte, jour, avant]);
  const suite = !commande && lignes.length > PAGE;
  if (suite) lignes.pop();

  const totaux = await q<{ source: Source; n: number; derniere: Date }>(`
    SELECT source, COUNT(*)::int AS n, MAX(recu_le) AS derniere
      FROM journal_borne WHERE borne_id = $1 GROUP BY source`, [id]);
  const rien = totaux.length === 0;
  const derniere = totaux.reduce<Date | null>(
    (m, t) => (!m || t.derniere > m ? t.derniere : m), null);

  const lien = (p: Record<string, string | null | undefined>) => {
    const base: Record<string, string | null | undefined> = {
      s: source, c: commande, q: texte ?? undefined, j: jour, ...p,
    };
    const qs = Object.entries(base)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
    return `/bornes/${id}/journal${qs ? "?" + qs : ""}`;
  };

  const filtre = source || commande || texte || jour;

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href={`/bornes/${id}`} className="bouton petit" aria-label="Retour à la RedBox">‹</Link>
          <div className="pousse">
            <h1 style={{ margin: 0, fontSize: 22 }}>Journal</h1>
            <div className="faible" style={{ fontSize: 13 }}>
              {b.nom}
              {derniere ? ` · dernière ligne reçue ${depuis(derniere)}` : ""}
            </div>
          </div>
        </div>

        <p className="faible" style={{ fontSize: 13.5, margin: "12px 0 0", maxWidth: 720 }}>
          Ce que la machine écrit sur son disque, recopié à chaque synchronisation.
          <b> Commandes</b> : chaque étape d’une vente, gravée avant d’être faite ; conservé sans limite.
          <b> Diagnostic</b> : les échanges avec la carte à ressorts et le terminal de paiement ;
          conservé soixante jours. Les battements de supervision, qui font l’essentiel du volume
          et ne disent rien, ne sont pas remontés.
        </p>

        {/* Le filtre. Des liens et un formulaire GET : l'adresse dit tout, elle se
            colle dans un message a un technicien et se rouvre telle quelle. */}
        <div className="rangee-actions" style={{ marginTop: 16 }}>
          <nav className="periodes petites" aria-label="Choisir un journal">
            <Link href={lien({ s: null, avant: null })} aria-current={!source ? "true" : undefined}>
              Tous
            </Link>
            {SOURCES.map((s) => {
              const n = totaux.find((t) => t.source === s)?.n ?? 0;
              return (
                <Link key={s} href={lien({ s, avant: null })} aria-current={source === s ? "true" : undefined}>
                  {NOM_SOURCE[s]} <span className="compte num">{n}</span>
                </Link>
              );
            })}
          </nav>
          <form method="get" action={`/bornes/${id}/journal`} className="rangee-actions" style={{ flex: 1 }}>
            {source ? <input type="hidden" name="s" value={source} /> : null}
            <input type="search" name="q" defaultValue={commande ?? texte ?? ""}
                   placeholder="Numéro de commande ou texte" aria-label="Rechercher"
                   style={{ flex: 1, minWidth: 180 }} />
            <input type="date" name="j" defaultValue={jour ?? ""} aria-label="Jour" />
            <button className="bouton">Filtrer</button>
            {filtre ? <Link href={`/bornes/${id}/journal`} className="bouton petit">Effacer</Link> : null}
          </form>
        </div>

        {commande ? (
          <div className="avis-ok" style={{ marginTop: 14 }}>
            Le récit de la commande <span className="num">{commande}</span> dans l’ordre du temps :
            ses propres lignes, et tout ce que la RedBox a écrit entre son premier et son dernier geste.
          </div>
        ) : null}

        {rien ? (
          <Repli titre="Cette RedBox n’a encore rien remonté"
                 texte={`Le journal voyage avec la version 5.13 ou plus de l’application de la RedBox${
                        b.version ? ` (celle-ci est en ${b.version})` : ""}. Une fois à jour, la première
                        synchronisation apporte ce que la machine a gardé.`}
                 action={{ nom: "Retour à la RedBox", vers: `/bornes/${id}` }} />
        ) : lignes.length === 0 ? (
          <Repli titre="Rien ne correspond"
                 texte={commande
                   ? "Aucune ligne ne parle de cette commande. Soit elle est antérieure à la première remontée, soit le numéro est mal recopié."
                   : "Aucune ligne pour ce filtre. Élargissez la période ou retirez un mot."}
                 action={{ nom: "Tout afficher", vers: `/bornes/${id}/journal` }} />
        ) : (
          <div className="carte plate" style={{ marginTop: 14, padding: 0, overflowX: "auto" }}>
            <table className="journal">
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} className={l.source}>
                    <td className="quand num" title={l.quand.toISOString()}>{heure(l.quand)}</td>
                    <td className="src"><span className={`pilule ${l.source === "commandes" ? "ok" : ""}`}>
                      {l.source === "commandes" ? "cmd" : "diag"}</span></td>
                    <td className="texte">{Texte({ source: l.source, ligne: l.ligne, lien: (c) => lien({ c, q: null, avant: null }) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {suite ? (
          <div className="rangee-actions" style={{ marginTop: 14, justifyContent: "center" }}>
            <Link href={lien({ avant: lignes[lignes.length - 1].quand.toISOString() })} className="bouton">
              Plus ancien ›
            </Link>
          </div>
        ) : null}
      </main>
      <NavBasse page="bornes" />
    </>
  );
}

/** Jour et heure a la milliseconde, en heure de Paris : c'est celle des tickets et des releves. */
function heure(d: Date): string {
  const s = d.toLocaleString("fr-FR", {
    timeZone: FUSEAU, day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${s}.${ms}`;
}

/**
 * Le texte d'une ligne, ou chaque numero de commande devient un lien vers son
 * recit. Les barres du journal des commandes deviennent des espaces : elles
 * separent des champs, pas des mots.
 */
function Texte({ source, ligne, lien }: { source: Source; ligne: string; lien: (c: string) => string }) {
  let t = texteDe(source, ligne);
  if (source === "commandes") t = t.replace(/\|/g, "   ");
  const parts = t.split(/(ORD-[0-9A-Z]{8})/);
  return parts.map((p, i) =>
    /^ORD-[0-9A-Z]{8}$/.test(p)
      ? <Link key={i} href={lien(p)} className="num">{p}</Link>
      : <span key={i}>{p}</span>);
}
