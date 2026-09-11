import { q1, transaction, type PgClient } from "@/db";
import { parJeton, RYTHME_CALME, RYTHME_VIF } from "@/lib/borne";
import { spireValide } from "@/lib/machine";
import { evaluerLeCompte, signaler, type Evenement } from "@/lib/notifications";
import { A_REGARDER, STATUTS, baseMigree, rabattu, statutRecu } from "@/lib/ventes";

export const dynamic = "force-dynamic";

/** Ce que la borne propose quand le compte n'a encore aucun catalogue. */
type CatalogueLocal = {
  categories?: { nom: string; ordre?: number }[];
  produits?: { sku: string; nom: string; categorie?: string | null;
               prix_centimes?: number; age_min?: number; capteur_fiable?: boolean }[];
  planogramme?: { lane: number; rangee?: number; colonne?: number;
                  sku?: string | null; capacite?: number; seuil_bas?: number;
                  quantite?: number }[];
};

type Releve = {
  version?: string;
  maintenance_pin?: string;
  catalogue_version?: string;
  sante?: unknown;
  catalogue_local?: CatalogueLocal;
  canaux?: { lane: number; sku?: string | null; quantite: number; capacite?: number }[];
  ventes?: { commande_id: string; article?: number | null; lane?: number | null;
             sku?: string | null; prix_centimes: number; statut: string; faite_le: string }[];
  transferts_appliques?: number[];
  corrections_appliquees?: number[];
};

const CONNUS = new Set(STATUTS);

/**
 * POST /api/borne/etat   (Bearer jeton)
 *
 * Le releve periodique. Quatre regles le gouvernent :
 *
 *  1. LA BORNE A RAISON sur les quantites. On recopie ses compteurs, on n'ecrase
 *     jamais les siens avec les notres.
 *  2. LA REMONTEE EST REJOUABLE. Une machine qui a perdu le reseau renvoie son
 *     lot entier ; la cle (borne, commande, canal, rang) absorbe les doublons, et le
 *     mouvement de vente est rattache a la vente pour ne jamais compter deux fois.
 *  3. UN TRANSFERT N'EST CONFIRME QUE PAR LA MACHINE. Tant qu'elle ne l'a pas
 *     acquitte, la marchandise est « en route » et reste visible.
 *  4. TOUT OU RIEN. Une seule transaction : un releve a moitie enregistre ferait
 *     mentir le stock sans que personne puisse dire ou.
 */
export async function POST(req: Request) {
  const borne = await parJeton(req.headers);
  if (!borne) return Response.json({ erreur: "jeton invalide" }, { status: 401 });

  let r: Releve;
  try { r = await req.json(); }
  catch { return Response.json({ erreur: "corps illisible" }, { status: 400 }); }

  // Ce que ce releve apporte de neuf, pour prevenir les telephones une fois
  // la transaction passee — jamais avant : on ne signale pas ce qui pourrait
  // etre annule, et on ne fait pas attendre la machine.
  const evenements: Evenement[] = [];
  const nouvelles: { nom: string | null; prix_c: number; lane: number | null; statut: string }[] = [];
  const videes: { lane: number; nom: string | null; ailleurs: number }[] = [];

  const bilan = await transaction(async (c) => {
    await c.query(
      `UPDATE borne SET vue_le = now(), version = COALESCE($1, version),
              catalogue_version = COALESCE($4, catalogue_version), sante = $2,
              maintenance_vu = COALESCE($5, maintenance_vu)
        WHERE id = $3`,
      [r.version ?? null, r.sante ? JSON.stringify(r.sante) : null, borne.id,
       r.catalogue_version ?? null, r.maintenance_pin ?? null]);

    // 0. Adoption du catalogue de la machine.
    //
    //    Seulement si le compte n'a RIEN — la garde est dans la transaction, donc
    //    deux bornes qui se synchronisent en meme temps ne peuvent pas importer
    //    deux fois. Passe ce moment, c'est le SaaS qui dicte : une machine ne
    //    reecrit jamais un catalogue que quelqu'un a compose.
    let adopte = 0;
    if (r.catalogue_local && borne.compte_id && borne.lieu_id) {
      const combien = await c.query<{ n: number }>(
        "SELECT COUNT(*)::int n FROM produit WHERE compte_id = $1", [borne.compte_id]);
      if (combien.rows[0].n === 0) {
        adopte = await adopter(c, borne.compte_id, borne.id, borne.lieu_id, r.catalogue_local);
      }
    }

    // 1. Acquittements d'abord : le releve qui suit est deja celui d'apres
    //    chargement, et on ne veut pas le lire comme un ecart inexplique.
    let confirmes = 0;
    const ids = (r.transferts_appliques ?? []).filter(Number.isInteger);
    if (ids.length > 0 && borne.lieu_id) {
      // `RETURNING` plutot qu'une relecture : la clause WHERE ne laisse passer
      // que les transferts encore ouverts, donc ce qui sort d'ici est
      // exactement ce qui vient d'etre confirme — un acquittement rejoue ne
      // recompte rien.
      const u = await c.query<{ lane: number | null; quantite: number }>(`
        UPDATE mouvement SET confirme_le = now()
         WHERE id = ANY($1::bigint[]) AND vers_lieu_id = $2
           AND motif = 'transfert' AND confirme_le IS NULL AND annule_le IS NULL
        RETURNING lane, quantite`,
        [ids, borne.lieu_id]);
      confirmes = u.rowCount ?? 0;

      for (const m of u.rows) {
        if (m.lane === null) continue;
        await c.query(
          "UPDATE canal SET quantite = quantite + $1 WHERE borne_id = $2 AND lane = $3",
          [m.quantite, borne.id, m.lane]);
      }
      if (u.rows.length > 0) {
        evenements.push({ genre: "chargements",
                          unites: u.rows.reduce((s, m) => s + m.quantite, 0),
                          spires: new Set(u.rows.map((m) => m.lane)).size });
      }
    }

    // 1 ter. Les corrections de compteur qu'elle vient de poser. On les ferme
    //     avant de lire son releve : le compteur qu'elle annonce est deja le
    //     corrige, et une correction laissee ouverte repartirait au tour
    //     suivant pour ecraser les ventes survenues depuis.
    const idsCorr = (r.corrections_appliquees ?? []).filter(Number.isInteger);
    if (idsCorr.length > 0) {
      await c.query(`
        UPDATE correction_canal SET applique_le = now()
         WHERE id = ANY($1::bigint[]) AND borne_id = $2 AND applique_le IS NULL`,
        [idsCorr, borne.id]);
    }

    // 2. Les compteurs de la machine.
    //
    // EN UNE SEULE INSTRUCTION, pas une par canal. Chaque aller-retour vers la
    // base coute un demi-tour de reseau, et une transaction ne peut pas les
    // paralleliser — elle tient une connexion unique. Onze spirales faisaient
    // donc vingt-deux allers-retours et frolaient les douze secondes de delai
    // cote borne : le releve expirait, la machine reessayait deux minutes plus
    // tard, et le parc paraissait capricieux. Une machine a soixante canaux
    // n'aurait jamais abouti.
    //
    // `unnest` deplie les tableaux en lignes ; le `LEFT JOIN` sur le SKU resout
    // les produits au passage, et `ON CONFLICT` couvre le canal apparu depuis.
    // ON N'ENREGISTRE QUE DES SPIRES QUI EXISTENT.
    //
    // C'est par ici que les fausses entraient : la route accueillait tout canal
    // annonce par la machine, pour ne pas perdre une spire apparue. Mais une
    // machine dont la vitrine de demonstration inventait une 601 faisait naitre
    // une 601 dans le SaaS — qu'on pouvait ensuite charger, vendre, et qui
    // n'aurait jamais rien distribue.
    //
    // Une adresse hors geometrie est donc ignoree, et comptee pour qu'on le
    // sache plutot que de le deviner.
    const annonces = (r.canaux ?? []).filter(
      (ca) => Number.isInteger(ca.lane) && Number.isInteger(ca.quantite));
    const propres = annonces.filter(
      (ca) => spireValide(Math.ceil(ca.lane / 10), ((ca.lane - 1) % 10) + 1));
    const refuses = annonces.length - propres.length;
    const canaux = propres.length;
    if (canaux > 0) {
      await c.query(`
        INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id,
                           quantite, quantite_borne, capacite, releve_le, releve_borne_le)
        SELECT $1, d.lane, (d.lane - 1) / 10 + 1, (d.lane - 1) % 10 + 1,
               p.id, d.quantite, d.quantite, COALESCE(d.capacite, 10), now(), now()
          FROM unnest($2::int[], $3::text[], $4::int[], $5::int[])
                 AS d(lane, sku, quantite, capacite)
          LEFT JOIN produit p ON p.compte_id = $6 AND p.sku = d.sku
        ON CONFLICT (borne_id, lane) DO UPDATE
          SET quantite_borne  = EXCLUDED.quantite_borne,
              releve_borne_le = now(),
              -- LE SAAS DIT QUOI, LA MACHINE DIT COMBIEN.
              --
              -- Ces deux lignes prenaient l'affectation et la capacite annoncees
              -- par la borne. Un planogramme modifie ici revenait donc a
              -- l'ancien des la synchronisation suivante : la machine annonce ce
              -- qu'elle porte ENCORE, on l'ecrivait par-dessus le changement, et
              -- l'empreinte du catalogue repartait a l'ancienne valeur — la
              -- borne recevait alors son propre ancien plan comme s'il etait
              -- neuf. Le changement etait detruit avant d'avoir pu s'appliquer.
              --
              -- La machine ne redefinit plus ce qu'elle vend — ET NE COMBLE
              -- PLUS UN VIDE NON PLUS. Ce qui restait ici prenait, pour un
              -- canal sans produit, celui que la borne annoncait. Or un canal
              -- sans produit, c'est presque toujours un canal qu'on vient de
              -- VIDER dans le planogramme : la machine recoit le nouveau plan
              -- et, dans le meme echange, releve encore l'inventaire bati sur
              -- l'ancien. Le produit qu'on venait de retirer revenait donc au
              -- releve suivant, a zero, « epuise » — et la borne le recevait
              -- a nouveau comme un plan neuf. L'arrivee d'une machine deja
              -- chargee passe par l'INSERT ci-dessus, canal par canal inconnu,
              -- et par l'adoption du catalogue : elle n'a pas besoin de cette
              -- ligne.
              -- NOTRE COMPTEUR N'EST PLUS TOUCHE ICI.
              --
              -- Il vaut le solde d'ouverture pris a l'appairage, augmente des
              -- transferts confirmes et diminue des ventes distribuees : des
              -- EVENEMENTS, tous traites plus bas dans cette meme transaction.
              -- Le prendre du releve rendait toute correction impossible — un
              -- chargement saisi dans le SaaS disparaissait des que la machine
              -- reparlait, et l'exploitant n'avait aucun moyen de dire « non,
              -- j'en ai remis douze ».
              releve_le  = now()`,
        [borne.id,
         propres.map((ca) => ca.lane),
         propres.map((ca) => ca.sku ?? null),
         propres.map((ca) => ca.quantite),
         propres.map((ca) => ca.capacite ?? null),
         borne.compte_id]);
    }

    // 3. Les ventes. Le mouvement n'est cree que si la vente etait nouvelle :
    //    `RETURNING` ne rend rien quand le conflit a joue.
    let retenues = 0;
    const neufs = (r.ventes ?? []).length > 0 && await baseMigree((sql) => c.query(sql));
    for (const v of r.ventes ?? []) {
      if (!v.commande_id || !CONNUS.has(v.statut)) continue;
      const voulu = statutRecu(r.version, v.statut, v.lane);
      const statut = neufs ? voulu : rabattu(voulu);
      const trouve = v.sku
        ? (await c.query<{ id: number; nom: string }>(
            "SELECT id, nom FROM produit WHERE compte_id = $1 AND sku = $2",
            [borne.compte_id, v.sku])).rows[0] ?? null
        : null;
      const produit = trouve?.id ?? null;
      // Le rang de l'article dans la commande, depuis la 5.13. Il fait partie de
      // la cle : sans lui, deux articles servis par la meme spirale n'en font
      // qu'un, et le stock comme le chiffre en perdent un.
      //
      // Tant que la base n'a pas recu la migration, on ecrit comme avant : la
      // colonne n'existe pas et la cle n'a que trois colonnes. Un INSERT qui
      // les nommerait ferait echouer tout le releve.
      const article = Number.isInteger(v.article) ? v.article : null;
      const prix = Math.max(0, Math.round(v.prix_centimes));
      const ins = neufs
        ? await c.query<{ id: number }>(`
            INSERT INTO vente (borne_id, commande_id, article, lane, produit_id, prix_c, statut, faite_le)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (borne_id, commande_id, lane, article) DO NOTHING
            RETURNING id`,
            [borne.id, v.commande_id, article, v.lane ?? null, produit, prix, statut, v.faite_le])
        : await c.query<{ id: number }>(`
            INSERT INTO vente (borne_id, commande_id, lane, produit_id, prix_c, statut, faite_le)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (borne_id, commande_id, lane) DO NOTHING
            RETURNING id`,
            [borne.id, v.commande_id, v.lane ?? null, produit, prix, statut, v.faite_le]);
      if (ins.rowCount === 0) continue;
      retenues++;
      nouvelles.push({ nom: trouve?.nom ?? v.sku ?? null, prix_c: prix, lane: v.lane ?? null, statut });

      // Seule une distribution confirmee sort du stock. Un litige est un
      // probleme d'argent, pas de marchandise : elle est toujours dans la machine.
      if (statut === "distribue" && produit && borne.lieu_id) {
        await c.query(`
          INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, quantite, motif,
                                 lane, par, fait_le, confirme_le, vente_id)
          VALUES ($1,$2,$3,1,'vente',$4,'borne',$5,$5,$6)`,
          [borne.compte_id, produit, borne.lieu_id, v.lane ?? null, v.faite_le, ins.rows[0].id]);

        // Le canal suit la vente. `GREATEST` parce qu'un compteur negatif ne
        // veut rien dire : si la machine a distribue plus que ce que nous
        // pensions qu'elle portait, c'est notre chiffre qui etait faux, et
        // l'ecart avec le sien le dira mieux qu'un nombre en dessous de zero.
        if (v.lane !== null && v.lane !== undefined) {
          const reste = await c.query<{ quantite: number }>(`
            UPDATE canal SET quantite = GREATEST(0, quantite - 1)
             WHERE borne_id = $1 AND lane = $2 RETURNING quantite`, [borne.id, v.lane]);
          // La spire vient de vendre son dernier article : c'est le moment de
          // le dire, pas au prochain inventaire — en precisant ce qu'il en
          // reste sur les autres spires de la machine, qui sert la suivante.
          if (reste.rows[0]?.quantite === 0) {
            const ailleurs = await c.query<{ n: number }>(`
              SELECT COALESCE(SUM(quantite), 0)::int AS n FROM canal
               WHERE borne_id = $1 AND produit_id = $2 AND lane <> $3`, [borne.id, produit, v.lane]);
            videes.push({ lane: v.lane, nom: trouve?.nom ?? null, ailleurs: ailleurs.rows[0]?.n ?? 0 });
          }
        }
      }
    }

    const attente = await c.query<{ n: number }>(`
      SELECT COUNT(*)::int n FROM mouvement
       WHERE vers_lieu_id = $1 AND motif = 'transfert'
         AND confirme_le IS NULL AND annule_le IS NULL`, [borne.lieu_id]);

    return { canaux, refuses, retenues, confirmes, adopte, attente: attente.rows[0].n };
  });

  // Les telephones, apres coup et sans attendre. Une borne sans compte n'a
  // personne a prevenir.
  const distribuees = nouvelles.filter((v) => v.statut === "distribue");
  const incidents = nouvelles.filter((v) => (A_REGARDER as readonly string[]).includes(v.statut));
  if (distribuees.length > 0) evenements.push({ genre: "ventes", ventes: distribuees });
  if (incidents.length > 0) evenements.push({ genre: "incidents", incidents });
  if (videes.length > 0) evenements.push({ genre: "vides", canaux: videes });
  if (borne.compte_id && evenements.length > 0) {
    void signaler(borne.compte_id, { id: borne.id, nom: borne.nom }, evenements)
      .catch((e) => console.error("notifications :", e instanceof Error ? e.message : e));
  }
  // Des ventes distribuees par une vraie machine peuvent debloquer des badges —
  // la dizaine, la centaine, le noctambule — pour toute l'equipe du compte. Une
  // borne de demonstration n'en fait gagner aucun : on ne la compte meme pas.
  if (borne.compte_id && distribuees.length > 0 && !(borne.jeton ?? "").startsWith("demo_")) {
    void evaluerLeCompte(borne.compte_id)
      .catch((e) => console.error("badges :", e instanceof Error ? e.message : e));
  }

  return Response.json({
    ok: true,
    canaux: bilan.canaux,
    canaux_refuses: bilan.refuses,   // adresses hors des dix spires
    catalogue_adopte: bilan.adopte,
    ventes_retenues: bilan.retenues,
    transferts_confirmes: bilan.confirmes,
    transferts_en_attente: bilan.attente,
    prochain_appel_s: bilan.attente > 0 ? RYTHME_VIF : RYTHME_CALME,
  });
}

/**
 * Adopte le catalogue d'une borne dans un compte encore vierge.
 *
 * Le stock deja present dans la machine entre par un mouvement d'INVENTAIRE, pas
 * de reception : on ne connait pas son prix d'achat, et pretendre le contraire
 * fausserait la valeur du stock des le premier jour. C'est un solde d'ouverture,
 * et il se lit comme tel dans le grand livre.
 */
async function adopter(c: PgClient, compte_id: number, borne_id: number, lieu_id: number,
                       cat: CatalogueLocal): Promise<number> {
  const parNom = new Map<string, number>();
  let ordre = 10;
  for (const k of cat.categories ?? []) {
    const nom = String(k.nom ?? "").trim();
    if (!nom) continue;
    const r = await c.query<{ id: number }>(`
      INSERT INTO categorie (compte_id, nom, ordre) VALUES ($1,$2,$3)
      ON CONFLICT (compte_id, nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
      [compte_id, nom, k.ordre ?? ordre]);
    parNom.set(nom, r.rows[0].id);
    ordre += 10;
  }

  const parSku = new Map<string, number>();
  let n = 0;
  for (const p of cat.produits ?? []) {
    const sku = String(p.sku ?? "").trim().toUpperCase();
    const nom = String(p.nom ?? "").trim();
    if (!sku || !nom) continue;
    let cid = p.categorie ? parNom.get(p.categorie) ?? null : null;
    if (p.categorie && !cid) {
      const k = await c.query<{ id: number }>(`
        INSERT INTO categorie (compte_id, nom, ordre) VALUES ($1,$2,$3)
        ON CONFLICT (compte_id, nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
        [compte_id, p.categorie, ordre]);
      cid = k.rows[0].id; parNom.set(p.categorie, cid); ordre += 10;
    }
    const r = await c.query<{ id: number }>(`
      INSERT INTO produit (compte_id, sku, nom, categorie_id, prix_vente_c, age_min, capteur_fiable)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (compte_id, sku) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
      [compte_id, sku, nom, cid, Math.max(0, Math.round(p.prix_centimes ?? 0)),
       p.age_min ?? 0, p.capteur_fiable ?? true]);
    parSku.set(sku, r.rows[0].id);
    n++;
  }

  for (const ca of cat.planogramme ?? []) {
    if (!Number.isInteger(ca.lane)) continue;
    const pid = ca.sku ? parSku.get(String(ca.sku).toUpperCase()) ?? null : null;
    await c.query(`
      INSERT INTO canal (borne_id, lane, rangee, colonne, produit_id, quantite, quantite_borne,
                         capacite, seuil_bas, releve_le, releve_borne_le)
      VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8, now(), now())
      ON CONFLICT (borne_id, lane) DO UPDATE
        SET produit_id = EXCLUDED.produit_id, capacite = EXCLUDED.capacite,
            seuil_bas = EXCLUDED.seuil_bas, quantite = EXCLUDED.quantite,
            quantite_borne = EXCLUDED.quantite_borne,
            releve_le = now(), releve_borne_le = now()`,
      [borne_id, ca.lane, ca.rangee ?? Math.ceil(ca.lane / 10),
       ca.colonne ?? ((ca.lane - 1) % 10) + 1, pid,
       Math.max(0, ca.quantite ?? 0), ca.capacite ?? 10, ca.seuil_bas ?? 2]);

    // Le stock deja en machine devient un solde d'ouverture.
    if (pid && (ca.quantite ?? 0) > 0) {
      await c.query(`
        INSERT INTO mouvement (compte_id, produit_id, de_lieu_id, vers_lieu_id, quantite,
                               motif, lane, note, par, fait_le, confirme_le)
        VALUES ($1,$2,NULL,$3,$4,'inventaire',$5,'solde d’ouverture — stock trouvé dans la machine',
                'borne', now(), now())`,
        [compte_id, pid, lieu_id, ca.quantite, ca.lane]);
    }
  }
  return n;
}
