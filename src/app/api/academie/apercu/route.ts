import { utilisateurDe, versPage } from "@/lib/auth";
import { BISCUIT_APERCU, peutEditer } from "@/lib/academie";

export const dynamic = "force-dynamic";

/**
 * POST /api/academie/apercu — l'editeur regarde l'academie comme un futur
 * redboxer, ou revient a sa vue. Un biscuit de session : l'apercu ne survit
 * pas a la fermeture du navigateur, on ne l'oublie pas allume.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const retour = String(f.get("retour") ?? "/academie");
  const sur = retour.startsWith("/academie") ? retour : "/academie";
  if (!peutEditer(u)) return versPage(req, sur);
  const prospect = String(f.get("vue")) === "prospect";
  return versPage(req, sur, prospect
    ? `${BISCUIT_APERCU}=prospect; Path=/; HttpOnly; SameSite=Lax`
    : `${BISCUIT_APERCU}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
