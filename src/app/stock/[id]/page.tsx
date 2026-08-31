import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Entete, NavBasse } from "../../chrome";
import { Repli } from "../../repli";
import { IcoBorne, IcoFleche, IcoReception, IcoStock } from "../../icones";
import { q, q1, euros, depuis, leJour } from "@/db";
import { peutCharger, utilisateur } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Fiche = {
  id: number; sku: string; nom: string; categorie: string;
  prix_vente_c: number; age_min: number; prix_achat_c: number | null;
  reserve: number; bornes: number; en_route: number; vendus_30: number;
};
type Emplacement = {
  lieu_id: number; borne_id: number | null; nom: string; genre: string;
  quantite: number; canaux: string | null;
};
type Mouvement = {
  id: number; motif: string; quantite: number; sens: number;
  de: string | null; vers: string | null; lane: number | null;
  reference: string | null; par: string | null; fait_le: Date; confirme_le: Date | null;
};

/**
 * La fiche d'un produit.
 *
 * Elle repond a la question que la liste ne peut pas porter : « ou est
 * exactement mon stock, et d'ou vient ce chiffre ? » — l'emplacement precis, et
 * le grand livre qui l'explique ligne par ligne.
 */
export default async function Produit({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateur();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);

  const p = await q1<Fiche>(`
    SELECT p.id, p.sku, p.nom, COALESCE(cat.nom, 'sans catégorie') AS categorie,
           p.prix_vente_c, p.age_min,
           (SELECT a.prix_achat_c FROM v_prix_achat a WHERE a.produit_id = p.id) AS prix_achat_c,
           COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
                      WHERE s.produit_id = p.id AND l.genre = 'reserve'), 0) AS reserve,
           COALESCE((SELECT SUM(s.quantite)::int FROM v_stock s JOIN lieu l ON l.id = s.lieu_id
                      WHERE s.produit_id = p.id AND l.genre = 'borne'), 0)   AS bornes,
           COALESCE((SELECT SUM(r.quantite)::int FROM v_en_route r
                      WHERE r.produit_id = p.id), 0)                          AS en_route,
           COALESCE((SELECT COUNT(*)::int FROM vente v JOIN borne b ON b.id = v.borne_id
                      WHERE v.produit_id = p.id AND b.compte_id = p.compte_id
                        AND v.statut = 'distribue'
                        AND v.faite_le >= now() - interval '30 days'), 0)     AS vendus_30
      FROM produit p LEFT JOIN categorie cat ON cat.id = p.categorie_id
     WHERE p.id = $1 AND p.compte_id = $2`, [id, u.compte_id]);
  if (!p) notFound();

  // Ou se trouve la marchandise, lieu par lieu — avec les canaux quand c'est une
  // borne : « 12 en machine » ne dit pas dans quel tiroir aller les chercher.
  const emplacements = await q<Emplacement>(`
    SELECT s.lieu_id, b.id AS borne_id, l.nom, l.genre, s.quantite::int,
           -- La notation de la machine : rangee puis colonne sur deux chiffres,
           -- comme sur l'etiquette du plateau et dans CSM.
           (SELECT string_agg(c.rangee || lpad(c.colonne::text, 2, '0')
                              || ' (' || c.quantite || ')', ', ' ORDER BY c.lane)
              FROM canal c WHERE c.borne_id = b.id AND c.produit_id = $1) AS canaux
      FROM v_stock s
      JOIN lieu l ON l.id = s.lieu_id
      LEFT JOIN borne b ON b.lieu_id = l.id
     WHERE s.produit_id = $1 AND l.compte_id = $2 AND s.quantite <> 0
     ORDER BY (l.genre = 'reserve') DESC, s.quantite DESC`, [id, u.compte_id]);

  const mouvements = await q<Mouvement>(`
    SELECT m.id, m.motif, m.quantite, m.lane, m.reference, m.par, m.fait_le, m.confirme_le,
           ld.nom AS de, lv.nom AS vers,
           CASE WHEN m.vers_lieu_id IS NOT NULL AND m.de_lieu_id IS NULL THEN 1
                WHEN m.de_lieu_id IS NOT NULL AND m.vers_lieu_id IS NULL THEN -1
                ELSE 0 END AS sens
      FROM mouvement m
      LEFT JOIN lieu ld ON ld.id = m.de_lieu_id
      LEFT JOIN lieu lv ON lv.id = m.vers_lieu_id
     WHERE m.produit_id = $1 AND m.compte_id = $2 AND m.annule_le IS NULL
     ORDER BY m.fait_le DESC LIMIT 30`, [id, u.compte_id]);

  const total = p.reserve + p.bornes + p.en_route;
  const parJour = p.vendus_30 / 30;
  const autonomie = parJour > 0 ? Math.floor(total / parJour) : null;
  const commander = parJour > 0
    ? Math.max(0, Math.ceil((Math.ceil(parJour * 30) - total) / 10) * 10) : 0;

  return (
    <>
      <Entete page="stock" />
      <main className="ecran">
        <div className="rangee" style={{ marginBottom: 4 }}>
          <Link href="/stock" className="bouton petit">‹</Link>
          <div className="pousse">
            <h1 style={{ margin: 0 }}>{p.nom}</h1>
            <p className="sous" style={{ margin: "2px 0 0" }}>
              {p.categorie} · <span className="mono">{p.sku}</span>
              {p.age_min > 0 ? ` · réservé aux ${p.age_min} ans et plus` : ""}
            </p>
          </div>
        </div>

        <div className="bandeau" style={{ marginTop: 16 }}>
          <div><div className="stat">
            <span className="valeur num" style={p.reserve === 0 ? { color: "var(--rouge-vif)" } : undefined}>
              {p.reserve}</span>
            <span className="libelle">chez moi</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{p.bornes}</span>
            <span className="libelle">en bornes</span></div></div>
          <div><div className={`stat ${p.en_route ? "attention" : ""}`}>
            <span className="valeur num">{p.en_route}</span>
            <span className="libelle">en route</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{p.vendus_30}</span>
            <span className="libelle">vendus sur 30 jours</span></div></div>
          <div><div className="stat">
            <span className="valeur num">{autonomie ?? "—"}</span>
            <span className="libelle">
              {autonomie !== null ? "jours d’autonomie" : "aucune vente récente"}</span></div></div>
          <div><div className="stat">
            <span className="valeur num petite">
              {euros((p.prix_achat_c ?? 0) * total)}</span>
            <span className="libelle">immobilisé à l’achat</span></div></div>
        </div>

        {peutCharger(u) ? (
          <div className="actions-cle">
            <Link href={`/reception?p=${p.id}${commander ? `&q=${commander}` : ""}`} className="forte">
              <span className="rond"><IcoReception /></span>
              <span>
                <span className="titre">Racheter</span>
                <span className="quoi">
                  {commander > 0
                    ? `~${commander} pour tenir trente jours`
                    : "Enregistrer une réception"}
                </span>
              </span>
              <span className="fleche"><IcoFleche /></span>
            </Link>
            <Link href="/bornes">
              <span className="rond"><IcoBorne /></span>
              <span>
                <span className="titre">Charger une borne</span>
                <span className="quoi">Passer du stock en machine</span>
              </span>
              <span className="fleche"><IcoFleche /></span>
            </Link>
          </div>
        ) : null}

        <p className="note-lecture">
          <b>En route</b> désigne ce qui a quitté votre réserve sans que la machine l’ait
          encore inscrit sur ses compteurs.
        </p>

        <h2>Où il se trouve</h2>
        {emplacements.length === 0 ? (
          <Repli icone={<IcoStock />} titre="Nulle part"
                 texte="Aucune unité de ce produit, ni en réserve ni en machine."
                 action={{ nom: "Enregistrer une réception", vers: `/reception?p=${p.id}` }} />
        ) : (
          <div className="ou-est">
            {emplacements.map((e) => {
              const enReserve = e.genre === "reserve";
              const contenu = (
                <>
                  <span className="pastille-lieu">
                    {enReserve ? <IcoStock size={17} /> : <IcoBorne size={17} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="nom-lieu">{enReserve ? "Ma réserve" : e.nom}</div>
                    <div className="detail-lieu">
                      {enReserve ? "chez vous, prêt à partir"
                                 : e.canaux ? `canaux ${e.canaux}` : "aucun canal affecté"}
                    </div>
                  </div>
                  <span className="n num">{e.quantite}</span>
                </>
              );
              return enReserve ? (
                <div className="lieu-ligne reserve" key={e.lieu_id}>{contenu}</div>
              ) : (
                <Link className="lieu-ligne" key={e.lieu_id} href={`/bornes/${e.borne_id}`}>
                  {contenu}
                </Link>
              );
            })}
          </div>
        )}

        <h2>Ce qui l’a fait bouger</h2>
        <div className="carte plate mouvements">
          <div className="lignes">
            {mouvements.map((m) => {
              // Un transfert ne fait ni entrer ni sortir : il DEPLACE. Lui coller
              // un « + » ou un « − » ferait croire que le stock a change alors
              // qu'on possede toujours autant.
              const signe = m.sens > 0 ? "plus" : m.sens < 0 ? "moins" : "neutre";
              return (
                <div className="ligne" key={m.id}>
                  <span className={`motif ${m.motif}`}>{m.motif}</span>
                  <div className="corps">
                    <div className="nom" style={{ fontWeight: 550, fontSize: 14 }}>
                      {m.motif === "transfert" ? `${m.de} → ${m.vers}`
                        : m.motif === "reception" ? `entrée en ${m.vers}`
                        : m.motif === "vente" ? `vendu · ${m.de}`
                        : `${m.de ?? "—"} → ${m.vers ?? "—"}`}
                      {m.lane ? <span className="faible"> · canal {m.lane}</span> : null}
                    </div>
                    <div className="meta">
                      {leJour(m.fait_le)} · {depuis(m.fait_le)}
                      {m.reference ? ` · ${m.reference}` : ""}
                      {m.par && m.par !== "borne" ? ` · ${m.par}` : ""}
                      {m.motif === "transfert" && !m.confirme_le
                        ? " · en attente de la machine" : ""}
                    </div>
                  </div>
                  <div className={`fin delta ${signe}`}>
                    {m.sens > 0 ? "+" : m.sens < 0 ? "−" : ""}{m.quantite}
                  </div>
                </div>
              );
            })}
            {mouvements.length === 0 ? (
              <Repli titre="Aucun mouvement"
                     texte="Ce produit n’est jamais entré ni sorti." dedans />
            ) : null}
          </div>
          <p className="faible" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Chaque chiffre de cette page est la somme de ces lignes — rien n’est stocké
            à part, donc rien ne peut diverger sans qu’une ligne l’explique.
          </p>
        </div>
      </main>
      <NavBasse page="stock" />
    </>
  );
}
