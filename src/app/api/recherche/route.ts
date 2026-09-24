import { q } from "@/db";
import { utilisateurDe } from "@/lib/auth";
import { lecteur, ouverte, type Acces } from "@/lib/academie";
import { DOMAINE } from "@/lib/invente";
import { salonsDe } from "@/lib/salons";

export const dynamic = "force-dynamic";

export type Trouve = { nom: string; sous?: string; vers: string };
export type Groupe = { titre: string; items: Trouve[] };

/**
 * GET /api/recherche?q=…   (JSON, depuis la boite de recherche)
 *
 * UNE SEULE BOITE POUR TOUT : une machine, un produit, un salon, une lecon,
 * un article de la centrale, un redboxer. Chaque famille est bornee a ce que
 * la personne a le droit de voir — le compte, ses machines, ses portes —, et
 * rend ses cinq meilleures reponses. Les pages du menu, elles, se filtrent
 * dans le navigateur : la boite les connait deja.
 */
export async function GET(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return Response.json({ erreur: "non connecté" }, { status: 401 });
  const brut = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (brut.length < 2) return Response.json({ groupes: [] });
  const motif = `%${brut.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const pli = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const cherche = pli(brut);
  const contient = (...champs: (string | null | undefined)[]) => champs.some((c) => c && pli(c).includes(cherche));

  const [bornes, produits, salons, lecons, centrale, personnes, l] = await Promise.all([
    q<{ id: number; nom: string; adresse: string | null }>(`
      SELECT id, nom, adresse FROM borne
       WHERE compte_id = $1 AND ($2::bigint[] IS NULL OR id = ANY($2)) AND jeton IS NOT NULL
         AND (nom ILIKE $3 OR adresse ILIKE $3)
       ORDER BY nom LIMIT 5`, [u.compte_id, u.bornes, motif]),
    u.bornes === null ? q<{ id: number; nom: string; sku: string; actif: boolean }>(`
      SELECT id, nom, sku, actif FROM produit
       WHERE compte_id = $1 AND (nom ILIKE $2 OR sku ILIKE $2)
       ORDER BY actif DESC, nom LIMIT 5`, [u.compte_id, motif]) : [],
    salonsDe(u).catch(() => []),
    q<{ id: number; titre: string; module: string; acces: Acces; module_acces: Acces }>(`
      SELECT le.id, le.titre, m.titre AS module, le.acces, m.acces AS module_acces
        FROM academie_lecon le JOIN academie_module m ON m.id = le.module_id
       WHERE le.publie AND m.publie AND (le.titre ILIKE $1 OR le.resume ILIKE $1)
       ORDER BY m.ordre, le.ordre LIMIT 5`, [motif]),
    q<{ id: number; nom: string; fournisseur: string }>(`
      SELECT p.id, p.nom, f.nom AS fournisseur
        FROM centrale_produit p JOIN centrale_fournisseur f ON f.id = p.fournisseur_id
       WHERE p.nom ILIKE $1 OR f.nom ILIKE $1
       ORDER BY p.disponible DESC, p.nom LIMIT 5`, [motif]),
    q<{ id: number; pseudo: string; compte: string | null }>(`
      SELECT x.id, x.pseudo, k.nom AS compte
        FROM utilisateur x LEFT JOIN compte k ON k.id = x.compte_id
       WHERE x.pseudo ILIKE $1 AND x.email NOT LIKE '%@' || $2 AND x.id <> $3
       ORDER BY x.pseudo LIMIT 5`, [motif, DOMAINE, u.id]),
    lecteur(u),
  ]);

  const groupes: Groupe[] = [
    { titre: "RedBox", items: bornes.map((b) => ({ nom: b.nom, sous: b.adresse ?? undefined, vers: `/bornes/${b.id}` })) },
    { titre: "Produits", items: produits.map((p) => ({ nom: p.nom, sous: `${p.sku}${p.actif ? "" : " · suspendu"}`, vers: `/stock/${p.id}` })) },
    { titre: "Salons", items: salons.filter((s) => contient(s.nom, s.sujet, s.borne)).slice(0, 5)
        .map((s) => ({ nom: `#${s.nom}`, sous: s.sujet ?? s.borne ?? undefined, vers: `/messages/${s.id}` })) },
    { titre: "Académie", items: lecons.filter((x) => ouverte(l, x.module_acces, x.acces))
        .map((x) => ({ nom: x.titre, sous: x.module, vers: `/academie/lecon/${x.id}` })) },
    { titre: "Centrale d’achat", items: centrale.map((c) => ({ nom: c.nom, sous: c.fournisseur, vers: `/centrale/produit/${c.id}` })) },
    { titre: "Redboxers", items: personnes.map((p) => ({ nom: p.pseudo, sous: p.compte ?? undefined, vers: `/communaute/${p.id}` })) },
  ].filter((g) => g.items.length > 0);

  return Response.json({ groupes }, { headers: { "Cache-Control": "no-store" } });
}
