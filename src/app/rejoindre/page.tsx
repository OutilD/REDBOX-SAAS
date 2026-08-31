import Image from "next/image";
import { redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Rejoindre({ searchParams }: { searchParams: Promise<{ e?: string; code?: string }> }) {
  if (await utilisateur()) redirect("/");
  const { e, code } = await searchParams;
  const messages: Record<string, string> = {
    code: "Code inconnu, déjà utilisé ou annulé.",
    mdp: "Le mot de passe doit faire au moins huit caractères, et les deux saisies doivent être identiques.",
    deja: "Cette adresse a déjà un accès.",
  };
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: 20 }}>
      <form method="post" action="/api/rejoindre" className="carte" style={{ width: "min(390px, 100%)", padding: 26 }}>
        {/* Le vrai logo, pas la marque reconstituee en texte : c'est la premiere
            chose qu'on voit de RedBox, et c'est celle qui doit etre juste. */}
        <Image src="/logo-redbox.png" alt="RedBox" width={232} height={150}
               className="logo-entree" priority />
        <p className="sous" style={{ marginBottom: 22 }}>
          Vous avez reçu un code : choisissez votre mot de passe.
        </p>
        <div className="champ">
          <label htmlFor="code">Code d’invitation</label>
          <input id="code" name="code" required defaultValue={code ?? ""} placeholder="XXXX-XXXX"
                 className="mono" autoCapitalize="characters" autoComplete="off"
                 style={{ letterSpacing: ".14em", textAlign: "center", fontSize: 19 }} />
        </div>
        <div className="champ">
          <label htmlFor="mdp">Mot de passe</label>
          <input id="mdp" name="mdp" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <div className="champ">
          <label htmlFor="mdp2">Le même, pour être sûr</label>
          <input id="mdp2" name="mdp2" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        {e ? <p className="erreur" style={{ marginTop: 14 }}>{messages[e] ?? "Impossible."}</p> : null}
        <div style={{ height: 18 }} />
        <button className="bouton primaire large">Rejoindre</button>
      </form>
    </main>
  );
}
