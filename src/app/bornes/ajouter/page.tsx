import Link from "next/link";
import { redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { q1 } from "@/db";
import { peutConfigurer, utilisateur } from "@/lib/auth";

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

  const messages: Record<string, string> = {
    code: "Code inconnu ou expiré. La borne en affiche un nouveau toutes les vingt minutes.",
    nom: "Donnez un nom à la borne.",
    prise: "Cette demande a déjà été adoptée.",
    deja: "Cette borne est déjà rattachée à un compte. Une machine ne peut appartenir "
        + "qu’à un seul SaaS à la fois : faites-la désappairer depuis le compte qui la "
        + "détient, puis recommencez. Son catalogue et ses visuels seront repris ici.",
  };

  return (
    <>
      <Entete page="bornes" />
      <main className="ecran">
        <div className="rangee" style={{ marginTop: 18 }}>
          <Link href="/bornes" className="bouton petit">‹</Link>
          <div className="pousse"><h1 style={{ margin: 0 }}>Ajouter une borne</h1></div>
        </div>

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
            <label htmlFor="code">Code affiché par la borne</label>
            <input id="code" name="code" required defaultValue={code ?? ""}
                   placeholder="XXXXXX" autoCapitalize="characters" autoComplete="off"
                   className="mono" maxLength={6}
                   style={{ fontSize: 26, letterSpacing: ".22em", textAlign: "center",
                            textTransform: "uppercase", minHeight: 62 }} />
          </div>
          <div className="champ">
            <label htmlFor="nom">Nom de la borne</label>
            <input id="nom" name="nom" required placeholder="RedBox — Le Duplex" />
          </div>
          <div className="champ">
            <label htmlFor="adresse">Où elle se trouve</label>
            <input id="adresse" name="adresse" placeholder="Paris 11e — facultatif" />
          </div>
          {e ? <p className="erreur" style={{ marginTop: 14 }}>{messages[e] ?? "Impossible."}</p> : null}
          <div style={{ height: 18 }} />
          <button className="bouton primaire large">Adopter cette borne</button>
        </form>

        <p className="faible" style={{ fontSize: 13.5, textAlign: "center" }}>
          {attente && attente.n > 0
            ? `${attente.n} borne${attente.n > 1 ? "s" : ""} en attente d’adoption en ce moment.`
            : "Aucune borne n’attend d’être adoptée."}
        </p>
      </main>
      <NavBasse page="bornes" />
    </>
  );
}
