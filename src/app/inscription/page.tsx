import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";
import { PSEUDO_MAX } from "@/lib/communaute";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  pseudo: `Choisissez un pseudo de ${PSEUDO_MAX} caractères au plus.`,
  email: "Cette adresse n’est pas valable.",
  pris: "Cette adresse a déjà un compte. Connectez-vous plutôt.",
  mdp: "Le mot de passe doit faire au moins huit caractères, et les deux saisies doivent être identiques.",
  code: "Code d’inscription incorrect.",
};

/**
 * Créer un compte.
 *
 * Le premier inscrit d'un compte en est le PROPRIETAIRE : c'est lui qui pourra
 * ensuite faire entrer les autres. Un compte sans propriétaire est un compte que
 * plus personne ne peut reprendre.
 */
export default async function Inscription({ searchParams }:
  { searchParams: Promise<{ e?: string; pseudo?: string; email?: string }> }) {
  if (await utilisateur()) redirect("/");
  const { e, pseudo, email } = await searchParams;
  const codeExige = Boolean(process.env.REDBOX_CODE_INSCRIPTION);

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: 20 }}>
      <form method="post" action="/api/inscription" className="carte"
            style={{ width: "min(400px, 100%)", padding: 26 }}>
        <Image src="/logo-redbox.png" alt="RedBox" width={232} height={150}
               className="logo-entree" priority />
        <p className="sous" style={{ marginBottom: 22, textAlign: "center" }}>
          Créer votre espace d’exploitation
        </p>

        {/* UN SEUL NOM : LE PSEUDO. « Nom de l'organisation » laissait croire
            qu'on nommait une societe, alors que c'est ce nom-la que tout le
            monde voit. Le pseudo nomme aussi l'espace ; il se renomme ensuite. */}
        <div className="champ">
          <label htmlFor="pseudo">Pseudo</label>
          <input id="pseudo" name="pseudo" required maxLength={PSEUDO_MAX} defaultValue={pseudo ?? ""}
                 placeholder="Kenny, Le Duplex…" autoComplete="nickname" />
          <p className="faible" style={{ fontSize: 12, margin: "6px 0 0" }}>
            Le nom que tous les redboxers verront dans la communauté : classement, messages,
            profil. Vous pourrez le changer.
          </p>
        </div>
        <div className="champ">
          <label htmlFor="email">Adresse mail</label>
          <input id="email" name="email" type="email" required defaultValue={email ?? ""}
                 autoComplete="username" inputMode="email" autoCapitalize="off" />
        </div>
        <div className="champ">
          <label htmlFor="mdp">Mot de passe</label>
          <input id="mdp" name="mdp" type="password" required minLength={8}
                 autoComplete="new-password" />
          <p className="faible" style={{ fontSize: 12, margin: "6px 0 0" }}>Huit caractères au moins.</p>
        </div>
        <div className="champ">
          <label htmlFor="mdp2">Le même, pour être sûr</label>
          <input id="mdp2" name="mdp2" type="password" required minLength={8}
                 autoComplete="new-password" />
        </div>
        {codeExige ? (
          <div className="champ">
            <label htmlFor="code">Code d’inscription</label>
            <input id="code" name="code" required className="mono"
                   autoCapitalize="characters" autoComplete="off"
                   placeholder="fourni avec votre RedBox" />
          </div>
        ) : null}

        {e ? <p className="erreur" style={{ marginTop: 14 }}>{MESSAGES[e] ?? "Impossible."}</p> : null}

        <div style={{ height: 18 }} />
        <button className="bouton primaire large">Créer mon compte</button>

        <p className="faible" style={{ fontSize: 13, textAlign: "center", margin: "16px 0 0" }}>
          Déjà inscrit ? <Link href="/connexion" style={{ textDecoration: "underline" }}>Se connecter</Link>
        </p>
      </form>
    </main>
  );
}
