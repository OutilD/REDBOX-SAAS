import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, euros, leJour, depuis } from "@/db";
import { estSuperAdmin, nomDuRole, utilisateur } from "@/lib/auth";
import { nomAffiche } from "@/lib/personnes";
import { DOMAINE } from "@/lib/invente";
import { BADGES, RANGS, rangDe } from "@/lib/communaute";
import { Badge } from "../../communaute/badge";

export const dynamic = "force-dynamic";

type Compte = {
  id: number; nom: string; cree_le: Date; demo: boolean; vitrine: boolean; editeur: boolean;
  membres: number; installees: number; en_ligne: number; a_venir: number;
  ventes_30: number; ca_30: number; ventes_total: number; ca_total: number;
  derniere_vente: Date | null;
};

type Membre = {
  compte_id: number; id: number; email: string; pseudo: string | null; nom: string | null; role: string;
  super_admin: boolean; cree_le: Date;
  /** Les badges qu'elle a deja, merites ou remis a la main. */
  badges: string[];
};

/**
 * TOUS LES COMPTES, ET LEURS CHIFFRES.
 *
 * L'editeur ne rentre pas dans la console d'un client : il n'en a pas le
 * besoin, et ce serait une porte de trop. Il voit la meme chose que le
 * tableau de bord du client, mais pour tous a la fois : le parc, ce qui vend,
 * ce qui ne vend plus, et qui a acces. Les comptes de demo sont a part, en
 * bas : leurs chiffres sont inventes.
 *
 * Le drapeau super-admin se donne et se retire ici, personne a personne. On
 * ne se le retire pas a soi-meme : le dernier ne doit pas pouvoir fermer la
 * porte derriere lui.
 *
 * Les badges se remettent aussi ici, a la personne, TOUS : ceux que la console
 * ne peut pas prouver — « J'y etais », pour un evenement RedBox — comme ceux
 * dont l'objectif n'est pas encore atteint.
 */
export default async function Comptes({ searchParams }:
  { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!estSuperAdmin(u)) redirect("/");
  const { e } = await searchParams;

  const [comptes, membres] = await Promise.all([
    q<Compte>(`
      SELECT c.id, c.nom, c.cree_le, c.demo, c.vitrine, c.editeur,
             (SELECT COUNT(*) FROM membre m JOIN utilisateur x ON x.id = m.utilisateur_id
               WHERE m.compte_id = c.id AND x.email NOT LIKE '%@' || $1)::int AS membres,
             (SELECT COUNT(*) FROM borne b WHERE b.compte_id = c.id
               AND b.statut = 'installee' AND b.jeton IS NOT NULL)::int AS installees,
             (SELECT COUNT(*) FROM borne b WHERE b.compte_id = c.id AND b.jeton IS NOT NULL
               AND b.vue_le > now() - interval '15 minutes')::int AS en_ligne,
             (SELECT COUNT(*) FROM borne b WHERE b.compte_id = c.id
               AND b.statut IN ('production', 'commandee', 'bientot'))::int AS a_venir,
             (SELECT COUNT(*) FROM vente v JOIN borne b ON b.id = v.borne_id
               WHERE b.compte_id = c.id AND v.statut = 'distribue'
                 AND v.faite_le >= now() - interval '30 days')::int AS ventes_30,
             (SELECT COALESCE(SUM(v.prix_c), 0) FROM vente v JOIN borne b ON b.id = v.borne_id
               WHERE b.compte_id = c.id AND v.statut = 'distribue'
                 AND v.faite_le >= now() - interval '30 days')::int AS ca_30,
             (SELECT COUNT(*) FROM vente v JOIN borne b ON b.id = v.borne_id
               WHERE b.compte_id = c.id AND v.statut = 'distribue')::int AS ventes_total,
             (SELECT COALESCE(SUM(v.prix_c), 0) FROM vente v JOIN borne b ON b.id = v.borne_id
               WHERE b.compte_id = c.id AND v.statut = 'distribue')::int AS ca_total,
             (SELECT MAX(v.faite_le) FROM vente v JOIN borne b ON b.id = v.borne_id
               WHERE b.compte_id = c.id AND v.statut = 'distribue') AS derniere_vente
        FROM compte c
       ORDER BY c.demo, c.vitrine, c.editeur DESC, c.nom`, [DOMAINE]),
    q<Membre>(`
      SELECT m.compte_id, u.id, u.email, u.pseudo, u.nom, m.role, u.super_admin, u.cree_le,
             COALESCE((SELECT array_agg(o.badge) FROM badge_obtenu o
                        WHERE o.utilisateur_id = u.id), '{}') AS badges
        FROM membre m JOIN utilisateur u ON u.id = m.utilisateur_id
       -- Les personnes inventees par la demo (« Sami », l'invitee) ne sont pas
       -- des comptes : elles n'ont rien a faire dans la liste de la plateforme.
       WHERE u.email NOT LIKE '%@' || $1
       ORDER BY m.compte_id, (m.role = 'proprietaire') DESC, u.email`, [DOMAINE]),
  ]);

  // La vitrine est a part, comme la demo : ses chiffres sont inventes.
  const reels = comptes.filter((c) => !c.demo && !c.vitrine);
  const vitrines = comptes.filter((c) => c.vitrine);
  const demos = comptes.filter((c) => c.demo);
  const somme = (f: (c: Compte) => number) => reels.reduce((s, c) => s + f(c), 0);
  const superAdmins = new Set(membres.filter((m) => m.super_admin).map((m) => m.id)).size;

  return (
    <>
      <Entete page="admin_comptes" />
      <main className="ecran">
        <div className="tete-tableau">
          <div className="quoi">
            <h1>Comptes</h1>
            <p className="sous">
              {reels.length} compte{reels.length > 1 ? "s" : ""}
              {demos.length > 0 ? `, et ${demos.length} en démo` : ""}.
            </p>
          </div>
          <div className="rangee-actions">
            <Link href="/admin" className="bouton">Tableau</Link>
            <Link href="/admin/parc" className="bouton">Parc</Link>
          </div>
        </div>

        {e === "soi" ? <p className="erreur" style={{ marginTop: 14 }}>On ne se retire pas soi-même le rôle de super-admin.</p> : null}

        <section className="chiffres-cle" aria-label="La plateforme en chiffres">
          <div className="mesures cinq">
            <div className="mesure">
              <span className="etiquette">Comptes</span>
              <span className="ligne-chiffre"><span className="chiffre num">{reels.length}</span></span>
              <span className="dessous">{superAdmins} super-admin{superAdmins > 1 ? "s" : ""}</span>
            </div>
            <div className="mesure">
              <span className="etiquette">Personnes</span>
              <span className="ligne-chiffre"><span className="chiffre num">{somme((c) => c.membres)}</span></span>
              <span className="dessous">sur les comptes réels</span>
            </div>
            <div className="mesure">
              <span className="etiquette">RedBox installées</span>
              <span className="ligne-chiffre"><span className="chiffre num">{somme((c) => c.installees)}</span></span>
              <span className="dessous">{somme((c) => c.en_ligne)} en ligne · {somme((c) => c.a_venir)} à venir</span>
            </div>
            <div className="mesure">
              <span className="etiquette">Ventes 30 jours</span>
              <span className="ligne-chiffre"><span className="chiffre num">{somme((c) => c.ventes_30)}</span></span>
              <span className="dessous">{euros(somme((c) => c.ca_30))}</span>
            </div>
            <div className="mesure">
              <span className="etiquette">Ventes depuis le début</span>
              <span className="ligne-chiffre"><span className="chiffre num">{somme((c) => c.ventes_total)}</span></span>
              <span className="dessous">{euros(somme((c) => c.ca_total))}</span>
            </div>
          </div>
        </section>

        {[{ titre: "Comptes", liste: reels }, { titre: "Vitrine", liste: vitrines }, { titre: "En démo", liste: demos }]
          .filter((g) => g.liste.length > 0).map((g) => (
          <section key={g.titre} style={{ marginTop: 22 }}>
            <h2>{g.titre}</h2>
            <div className="tableau-enveloppe carte" style={{ padding: 0 }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Compte</th><th>Créé</th><th className="num">Personnes</th>
                    <th className="num">RedBox</th><th className="num">En ligne</th><th className="num">À venir</th>
                    <th className="num">Ventes 30 j</th><th className="num">CA 30 j</th>
                    <th className="num">Ventes total</th><th className="num">CA total</th><th>Dernière vente</th>
                  </tr>
                </thead>
                <tbody>
                  {g.liste.map((c) => (
                    <tr key={c.id}>
                      <th>
                        <a href={`#c${c.id}`}>{c.nom}</a>
                        {c.editeur ? <span className="pilule" style={{ marginLeft: 8 }}><i />éditeur</span> : null}
                      </th>
                      <td>{leJour(c.cree_le)}</td>
                      <td className="num">{c.membres}</td>
                      <td className="num">{c.installees}</td>
                      <td className={`num ${c.installees > 0 && c.en_ligne < c.installees ? "mal" : ""}`}>{c.en_ligne}</td>
                      <td className="num">{c.a_venir}</td>
                      <td className="num">{c.ventes_30}</td>
                      <td className="num">{euros(c.ca_30)}</td>
                      <td className="num">{c.ventes_total}</td>
                      <td className="num">{euros(c.ca_total)}</td>
                      <td>{c.derniere_vente ? depuis(c.derniere_vente) : "jamais"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {g.liste.map((c) => {
              const gens = membres.filter((m) => m.compte_id === c.id);
              return (
                <details key={c.id} id={`c${c.id}`} className="carte" style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 650 }}>
                    {c.nom} · {gens.length} personne{gens.length > 1 ? "s" : ""}
                  </summary>
                  <ul className="liste-a-situer comptes-membres" style={{ marginTop: 12 }}>
                    {gens.map((m) => (
                      <li key={m.id}>
                        <div className="pousse" style={{ minWidth: 0 }}>
                          <div className="nom">{nomAffiche(m)}</div>
                          <div className="ou">{nomDuRole(m.role)} · depuis {leJour(m.cree_le)}</div>
                        </div>
                        {m.super_admin ? <span className="pilule ok"><i />super-admin</span> : null}
                        <form method="post" action="/api/admin/super-admin">
                          <input type="hidden" name="utilisateur_id" value={m.id} />
                          <input type="hidden" name="valeur" value={m.super_admin ? "0" : "1"} />
                          <button className="bouton petit" disabled={m.id === u.id && m.super_admin}>
                            {m.super_admin ? "Retirer super-admin" : "Faire super-admin"}
                          </button>
                        </form>
                        <Badges m={m} />
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </section>
        ))}
      </main>
      <NavBasse page="admin_comptes" />
    </>
  );
}

/**
 * Ses badges en un coup d'oeil — les plus rares d'abord, en petites pieces —,
 * et la porte vers la page ou on les donne et les reprend.
 */
function Badges({ m }: { m: Membre }) {
  const siens = BADGES.filter((b) => m.badges.includes(b.cle))
    .map((b) => ({ ...b, rang: rangDe(b) }))
    .sort((x, z) => RANGS.indexOf(z.rang) - RANGS.indexOf(x.rang) || z.points - x.points);
  const montres = siens.slice(0, 6);
  return (
    <Link href={`/admin/comptes/badges/${m.id}`} className="badges-resume" title={`Gérer les badges de ${nomAffiche(m)}`}>
      <span className="pieces" aria-hidden>
        {montres.map((b) => <Badge key={b.cle} forme={b.forme} rang={b.rang} taille={24} />)}
      </span>
      <span className="combien num">{siens.length}/{BADGES.length}</span>
      <span className="agir">Badges</span>
    </Link>
  );
}
