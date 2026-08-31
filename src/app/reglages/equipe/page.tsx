import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q } from "@/db";
import { nomDuRole, peutGererEquipe, ROLES, utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Membre = { id: number; email: string; role: string; cree_le: Date };
type Invite = { id: number; email: string; role: string; code: string };

export default async function Equipe({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutGererEquipe(u)) redirect("/reglages");
  const { e } = await searchParams;

  const membres = await q<Membre>(
    "SELECT id, email, role, cree_le FROM utilisateur WHERE compte_id = $1 ORDER BY cree_le", [u.compte_id]);
  const invites = await q<Invite>(
    "SELECT id, email, role, code FROM invitation WHERE compte_id = $1 AND utilisee_le IS NULL ORDER BY id DESC",
    [u.compte_id]);

  return (
    <>
      <Entete page="equipe" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/reglages" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0, fontSize: 22 }}>Équipe</h1></div>
        </div>
        <p className="sous" style={{ marginTop: 12 }}>
          Une borne appartient au compte, jamais à une personne : l’associé qui part ne part pas
          avec la machine.
        </p>
        {e === "email" ? <p className="erreur">Adresse manquante ou déjà connue sur ce compte.</p> : null}

        <h2>Membres</h2>
        <div className="carte plate"><div className="lignes">
          {membres.map((m) => (
            <div className="ligne" key={m.id}>
              <div className="corps">
                <div className="nom">{m.email}{m.id === u.id ? <span className="faible"> · vous</span> : null}</div>
                <div className="meta">{nomDuRole(m.role)}</div>
              </div>
              {m.role !== "proprietaire" && m.id !== u.id ? (
                <div className="fin" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <form method="post" action="/api/equipe/role" style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="id" value={m.id} />
                    <select name="role" defaultValue={m.role} style={{ width: 150, minHeight: 40 }}>
                      {ROLES.map((r) => <option key={r.cle} value={r.cle}>{r.nom}</option>)}
                    </select>
                    <button className="bouton petit">OK</button>
                  </form>
                  <form method="post" action="/api/equipe/retirer">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="bouton petit danger">Retirer</button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </div></div>

        <h2>Inviter quelqu’un</h2>
        <form method="post" action="/api/equipe/inviter" className="carte">
          <div className="champ">
            <label htmlFor="email">Adresse</label>
            <input id="email" name="email" type="email" required placeholder="quelqu.un@exemple.fr"
                   inputMode="email" autoCapitalize="off" />
          </div>
          <div className="champ">
            <label htmlFor="role">Rôle</label>
            <select id="role" name="role" defaultValue="reassort">
              {ROLES.map((r) => <option key={r.cle} value={r.cle}>{r.nom} — {r.peut}</option>)}
            </select>
          </div>
          <div style={{ height: 16 }} />
          <button className="bouton primaire large">Créer le code d’invitation</button>
        </form>
        <p className="faible" style={{ fontSize: 13.5 }}>
          Aucun e-mail n’est envoyé : vous obtenez un code à donner de la main à la main.
          L’invité choisit son mot de passe lui-même sur <span className="mono">/rejoindre</span> —
          vous ne le connaîtrez jamais.
        </p>

        {invites.length > 0 ? (
          <>
            <h2>Invitations en attente</h2>
            <div className="carte plate"><div className="lignes">
              {invites.map((i) => (
                <div className="ligne" key={i.id}>
                  <div className="corps">
                    <div className="nom">{i.email}</div>
                    <div className="meta">{nomDuRole(i.role)}</div>
                  </div>
                  <div className="fin" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 16, letterSpacing: ".1em" }}>{i.code}</span>
                    <form method="post" action="/api/equipe/annuler">
                      <input type="hidden" name="id" value={i.id} />
                      <button className="bouton petit">Annuler</button>
                    </form>
                  </div>
                </div>
              ))}
            </div></div>
          </>
        ) : null}
      </main>
      <NavBasse page="equipe" />
    </>
  );
}
