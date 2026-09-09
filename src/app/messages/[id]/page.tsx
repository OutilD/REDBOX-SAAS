import { notFound, redirect } from "next/navigation";
import { utilisateur } from "@/lib/auth";
import { salonDe } from "@/lib/salons";
import Messagerie from "../vue";

export const dynamic = "force-dynamic";

/** Un salon ouvert. Hors de portee, il n'existe pas. */
export default async function SalonOuvert({ params, searchParams }:
  { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; qui?: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await salonDe(u, id))) notFound();
  const { e, qui } = await searchParams;
  return <Messagerie u={u} salon_id={id} erreur={e} qui={qui === "1"} />;
}
