import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";
import { BISCUIT_APERCU, lecteur, peutEditer } from "@/lib/academie";

/**
 * Le debut de chaque page de l'academie : la personne, ce qu'elle peut lire,
 * et si elle fait partie de l'equipe qui ecrit — meme quand elle regarde en
 * apercu « prospect », l'onglet Editer et le moyen d'en sortir lui restent.
 */
export async function lecteurDePage() {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const apercu = (await cookies()).get(BISCUIT_APERCU)?.value ?? null;
  return { u, l: await lecteur(u, apercu), equipe: peutEditer(u) };
}
