import { utilisateurDe } from "@/lib/auth";
import { adresseIci, suggerer } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * GET /api/geo?q=12 rue des li        — les adresses qui commencent ainsi
 * GET /api/geo?lat=44.84&lon=-0.57    — l'adresse la plus proche d'un point
 *
 * Le navigateur ne parle pas lui-meme a la Base Adresse Nationale : tout passe
 * par `geo.ts`, un seul endroit pour son adresse, son delai et ses regles. Il
 * faut etre connecte — ce n'est pas un geocodeur ouvert a tous.
 */
export async function GET(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return Response.json({ erreur: "non connecté" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  const pres = p.has("lat") && p.has("lon") && Number.isFinite(lat) && Number.isFinite(lon)
    ? { latitude: lat, longitude: lon } : undefined;
  try {
    if (p.has("q")) return Response.json({ suggestions: await suggerer(p.get("q") ?? "", pres) });
    if (pres) return Response.json({ suggestion: await adresseIci(pres.latitude, pres.longitude) });
  } catch {
    return Response.json({ erreur: "géocodeur indisponible" }, { status: 503 });
  }
  return Response.json({ erreur: "q, ou lat et lon" }, { status: 400 });
}
