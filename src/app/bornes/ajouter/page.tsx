import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q, q1 } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";
import { IcoAlerte } from "../../icones";

export const dynamic = "force-dynamic";

/**
 * Adopter une borne.
 *
 * Le sens de l'appairage a ete inverse. Avant, le SaaS emettait un code qu'il
 * fallait taper SUR LA BORNE — sur le clavier le plus penible du dispositif, en
 * equilibre devant une machine ouverte.
 *
 * Maintenant c'est la borne qui demande : elle affiche six caracteres, et c'est
 * vous qui les portez ici, depuis votre telephone. Le clavier est bon, et le fait
 * de lire le code prouve que vous etes devant la machine.
 */
export default async function Ajouter({ searchParams }: { searchParams: Promise<{ e?: string; code?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  if (!peutConfigurer(u)) redirect("/bornes");
  const { e, code } = await searchParams;

  const attente = await q1<{ n: number }>(
    "SELECT COUNT(*)::int n FROM appairage WHERE borne_id IS NULL AND expire_le > now()");

  // Les machines que l'editeur a deja attribuees a ce compte, pas encore posees :
  // si c'est l'une d'elles qu'on appaire, elle garde sa place et son histoire.
  const attendues = await q<{ id: number; nom: string; numero: string | null; adresse: string | null }>(`
    SELECT id, nom, numero, adresse FROM borne
     WHERE compte_id = $1 AND jeton IS NULL AND statut IN ('production', 'commandee', 'bientot')
     ORDER BY statut_le DESC`, [u.compte_id]);

  const messages: Record<string, string> = {
    code: "Code inconnu ou expiré. La RedBox en affiche un nouveau toutes les vingt minutes.",
    nom: "Donnez un nom à la RedBox.",
    prise: "Cette demande a déjà été adoptée.",
    demo: "Le mode démo est actif : désactivez-le avant d’appairer une vraie RedBox.",
    deja: "Cette RedBox est déjà rattachée à un compte. Une machine ne peut appartenir "
        + "qu’à un seul SaaS à la fois : faites-la désappairer depuis le compte qui la "
        + "détient, puis recommencez. Son catalogue et ses visuels seront repris ici.",
    attendue: "Cette RedBox attendue n’existe plus, ou a déjà été appairée.",
  };

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/bornes" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Ajouter une RedBox</h1></div>
        </div>

        {u.demo ? (
          <div className="avis" style={{ marginTop: 18 }}>
            <IcoAlerte size={17} />
            <div className="dit">
              <div className="titre">Pas de vraie RedBox pendant la démo</div>
              <div className="texte">
                Ce compte est rempli de RedBox et de ventes inventées. Une vraie machine y
                mêlerait ses ventes aux ventes fictives, et quitter la démo l’effacerait avec le
                reste. Désactivez d’abord le mode démo, puis revenez ici.
              </div>
            </div>
            <Link href="/demo" className="bouton petit">Mode démo</Link>
          </div>
        ) : null}
        <div className="carte" style={{ marginTop: 18 }}>
          <div className="faible" style={{ fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
            Sur la machine
          </div>
          <ol style={{ margin: "12px 0 0", paddingLeft: 20, lineHeight: 1.8, fontSize: 15 }}>
            <li>Appui long sur le logo, depuis l’écran d’accueil</li>
            <li>Menu <b>SaaS et réassort</b></li>
            <li>Bouton <b>Demander l’appairage</b></li>
          </ol>
          <p className="faible" style={{ fontSize: 14, marginBottom: 0 }}>
            Elle affiche alors un code de six caractères et un QR. Scannez le QR, ou recopiez
            le code ci-dessous.
          </p>
        </div>

        <form method="post" action="/api/bornes/adopter" className="carte">
          <div className="champ">
            <label htmlFor="code">Code affiché par la RedBox</label>
            <input id="code" name="code" required defaultValue={code ?? ""}
                   placeholder="XXXXXX" autoCapitalize="characters" autoComplete="off"
                   className="mono" maxLength={6}
                   style={{ fontSize: 26, letterSpacing: ".22em", textAlign: "center",
                            textTransform: "uppercase", minHeight: 62 }} />
          </div>
          {attendues.length > 0 ? (
            <fieldset className="champ choix-attendue">
              <legend>Quelle RedBox appairez-vous ?</legend>
              {attendues.map((a, i) => (
                <label key={a.id} className="coche">
                  <input type="radio" name="borne" value={a.id} defaultChecked={i === 0} />
                  <span>{a.nom}{a.numero ? ` · n° ${a.numero}` : ""}{a.adresse ? ` · ${a.adresse}` : ""}</span>
                </label>
              ))}
              <label className="coche">
                <input type="radio" name="borne" value="" />
                <span>Une autre RedBox</span>
              </label>
              <p className="faible" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
                Ces machines vous sont déjà attribuées : en choisir une la fait passer
                d’« à venir » à installée, avec sa place sur la carte.
              </p>
            </fieldset>
          ) : null}
          <div className="champ">
            <label htmlFor="nom">Nom de la RedBox</label>
            <input id="nom" name="nom" required={attendues.length === 0}
                   placeholder={attendues.length > 0 ? "laissez vide pour garder son nom" : "RedBox — Le Duplex"} />
          </div>
          <div className="champ">
            <label htmlFor="adresse">Où elle se trouve</label>
            <input id="adresse" name="adresse" placeholder="Paris 11e — facultatif" />
          </div>
          {e ? <p className="erreur" style={{ marginTop: 14 }}>{messages[e] ?? "Impossible."}</p> : null}
          <div style={{ height: 18 }} />
          <button className="bouton primaire large" disabled={u.demo}>Adopter cette RedBox</button>
        </form>

        <p className="faible" style={{ fontSize: 13.5, textAlign: "center" }}>
          {attente && attente.n > 0
            ? `${attente.n} RedBox en attente d’adoption en ce moment.`
            : "Aucune RedBox n’attend d’être adoptée."}
        </p>
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
