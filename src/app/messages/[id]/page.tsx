import { notFound, redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";
import Messagerie from "../vue";
import { LECTEURS_PAR_PAGE } from "@/lib/salons";
import { aMontrer } from "../../voir-plus";

export const dynamic = "force-dynamic";

/** Un salon ouvert. Hors de portee, il n'existe pas. */
export default async function SalonOuvert({ params, searchParams }:
  { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; qui?: string; n?: string; fond?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { e, qui, n, fond } = await searchParams;
  return <Messagerie u={u} salon_id={id} erreur={e} qui={qui === "1"} fondOuvert={fond === "1"}
                     lecteursN={aMontrer(n, LECTEURS_PAR_PAGE)} />;
}
