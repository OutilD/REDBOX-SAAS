import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q } from "@/db";
import { nomDuRole, peutGererEquipe, ROLES, utilisateur } from "@/lib/auth";
import { origineDes } from "@/lib/borne";

export const dynamic = "force-dynamic";

type Membre = { id: number; email: string; role: string; cree_le: Date; bornes: string | null };
type Invite = { id: number; email: string; role: string; code: string; borne: string | null };
type Machine = { id: number; nom: string };

export default async function Equipe({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutGererEquipe(u)) redirect("/reglages");
  const { e } = await searchParams;

  // LES MEMBRES VIENNENT DE L'APPARTENANCE, PLUS DE LA COLONNE DE L'UTILISATEUR :
  // quelqu'un peut servir deux exploitants, et n'est de cette equipe-ci que par
  // sa ligne dans `membre`. On ramene au passage les bornes auxquelles il est
  // restreint — vide voulant dire tout le parc.
  const membres = await q<Membre>(`
    SELECT x.id, x.email, m.role, m.cree_le,
           (SELECT string_agg(b.nom, ', ' ORDER BY b.nom)
              FROM acces_borne a JOIN borne b ON b.id = a.borne_id
             WHERE a.utilisateur_id = x.id AND b.compte_id = m.compte_id) AS bornes
      FROM membre m JOIN utilisateur x ON x.id = m.utilisateur_id
     WHERE m.compte_id = $1
     ORDER BY m.cree_le`, [u.compte_id]);
  const invites = await q<Invite>(`
    SELECT i.id, i.email, i.role, i.code, b.nom AS borne
      FROM invitation i LEFT JOIN borne b ON b.id = i.borne_id
     WHERE i.compte_id = $1 AND i.utilisee_le IS NULL
     ORDER BY i.id DESC`, [u.compte_id]);
  const machines = await q<Machine>(
    "SELECT id, nom FROM borne WHERE compte_id = $1 ORDER BY nom", [u.compte_id]);

  // L'ADRESSE COMPLETE, PAS SEULEMENT LE CODE. C'est ce qu'on envoie vraiment a
  // quelqu'un : un lien qu'il ouvre, avec le code deja dedans. Un code seul
  // suppose que l'invite sache ou aller, et il ne le sait pas.
  const origine = origineDes(await headers());

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
        {e === "email" ? <p className="erreur">Adresse manquante ou déjà membre de ce compte.</p> : null}
        {e === "borne" ? <p className="erreur">Cette borne n’appartient pas à ce compte.</p> : null}

        <h2>Membres</h2>
        <div className="carte plate"><div className="lignes">
          {membres.map((m) => (
            <div className="ligne" key={m.id}>
              <div className="corps">
                <div className="nom">{m.email}{m.id === u.id ? <span className="faible"> · vous</span> : null}</div>
                {/* La portee se lit ici : sans elle, deux lignes identiques
                    cachaient que l'une voit tout le parc et l'autre une machine. */}
                <div className="meta">
                  {nomDuRole(m.role)}
                  {m.bornes ? ` · ${m.bornes} uniquement` : " · tout le compte"}
                </div>
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
          {/*
            LA PORTEE. « Tout le compte » reste le cas ordinaire — un associe, un
            reassortisseur qui tourne sur le parc. Choisir une borne enferme
            l'invite dessus : il ne verra ni les autres machines, ni leurs ventes,
            ni le stock du depot. C'est ce qu'on donne au patron du bar qui
            heberge la machine, et il n'a rien a voir du reste.
          */}
          <div className="champ">
            <label htmlFor="borne_id">Portée</label>
            <select id="borne_id" name="borne_id" defaultValue="">
              <option value="">Tout le compte — toutes les bornes</option>
              {machines.map((b) => (
                <option key={b.id} value={b.id}>Cette borne seulement — {b.nom}</option>
              ))}
            </select>
          </div>
          <div style={{ height: 16 }} />
          <button className="bouton primaire large">Créer le code d’invitation</button>
        </form>
        <p className="faible" style={{ fontSize: 13.5 }}>
          Aucun e-mail n’est envoyé : vous obtenez un lien à transmettre vous-même, par SMS
          ou de vive voix. L’invité choisit son mot de passe lui-même — vous ne le
          connaîtrez jamais.
        </p>

        {invites.length > 0 ? (
          <>
            <h2>Invitations en attente</h2>
            <div className="carte plate"><div className="lignes">
              {invites.map((i) => (
                <div className="ligne" key={i.id}>
                  <div className="corps">
                    <div className="nom">{i.email}</div>
                    <div className="meta">
                      {nomDuRole(i.role)}
                      {i.borne ? ` · ${i.borne} uniquement` : " · tout le compte"}
                    </div>
                    {origine ? (
                      <div className="meta mono" style={{ marginTop: 4, wordBreak: "break-all" }}>
                        {origine}/rejoindre?code={i.code}
                      </div>
                    ) : null}
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
