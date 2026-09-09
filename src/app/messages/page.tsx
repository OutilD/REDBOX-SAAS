import { redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";
import Messagerie from "./vue";

export const dynamic = "force-dynamic";

/** La liste des salons — et, sur grand ecran, une colonne vide qui attend. */
export default async function Messages({ searchParams }:
  { searchParams: Promise<{ nouveau?: string; e?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const { nouveau, e } = await searchParams;
  return <Messagerie u={u} nouveau={nouveau === "1"} erreur={e} />;
}
