import { BISCUIT, detruireSession, enTeteBiscuit, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const brut = req.headers.get("cookie") ?? "";
  for (const morceau of brut.split(";")) {
    const [nom, ...reste] = morceau.trim().split("=");
    if (nom === BISCUIT) await detruireSession(decodeURIComponent(reste.join("=")));
  }
  return versPage(req, "/connexion", enTeteBiscuit(null));
}
