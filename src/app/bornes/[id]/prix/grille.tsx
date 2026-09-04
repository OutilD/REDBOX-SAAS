"use client";

import { useState } from "react";
import { Picto } from "../../../vignette";
import { centimes, ecartPourcent, enSaisie } from "@/lib/prix";

export type Ligne = {
  id: number; sku: string; nom: string;
  /** Le prix du catalogue : ce que vend tout le parc, sauf decision contraire. */
  catalogue_c: number;
  /** Ce que cette borne applique aujourd'hui. */
  prix_c: number;
  /** Vrai si ce prix vient d'une exception posee sur cette borne. */
  propre: boolean;
  categorie_id: number | null; categorie: string; ordre: number;
  image: number | null; icone: string | null;
  /** Combien de spires de CETTE borne portent ce produit. Zero = pas en vente ici. */
  canaux: number;
  /** Masque sur cette borne — par lui-meme ou par sa categorie. */
  masque: boolean;
  par: string | null;
};

const euros = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

/**
 * LES PRIX D'UNE BORNE.
 *
 * Un champ vide veut dire « suis le catalogue ». C'est le coeur du reglage, et
 * c'est pour cela que les champs ne sont pas preremplis : une page ouverte sur
 * onze montants identiques au catalogue ne dit pas ce qui a ete decide ici, et
 * un prix general modifie demain ne se propagerait plus. Le prix general reste
 * lisible dans le champ, en filigrane — il dit ce qui s'appliquera si on
 * n'ecrit rien.
 *
 * L'ECART EST DONNE EN POURCENTAGE, a cote du montant. « 5,50 » face a « 5,00 »
 * demande une soustraction qu'on ne fait pas onze fois ; « +10 % » se lit. C'est
 * la seule facon de voir, en parcourant la liste, qu'un chiffre a derape.
 *
 * L'apercu de droite montre l'etal de CETTE borne, aux prix qu'on est en train
 * de taper. C'est lui qui dit si le rayon tient debout — pas la liste.
 *
 * Sans JavaScript, tout fonctionne encore : les champs partent avec le
 * formulaire, seuls l'ecart en direct, l'apercu et le bouton « aligner » d'une
 * ligne manquent. On vide alors le champ a la main, ce qui revient au meme.
 */
export default function GrillePrix({
  lignes, cats,
}: { lignes: Ligne[]; cats: { id: number; nom: string; ordre: number }[] }) {
  // LA SAISIE EST GARDEE EN TEXTE, pas en centimes. Un montant qu'on retape
  // passe par des etats incomplets — « 4, », « 4,5 » — qu'un nombre ne sait pas
  // representer : le convertir a chaque frappe replacerait le curseur et
  // effacerait la virgule sous les doigts.
  const [saisies, saisir] = useState<Record<number, string>>(() =>
    Object.fromEntries(lignes.map((p) => [p.id, p.propre ? enSaisie(p.prix_c) : ""])));

  const [vu, regarder] = useState<number | null>(cats[0] ? Number(cats[0].id) : null);

  /** Le prix qu'appliquera la borne si on enregistre maintenant. */
  const applique = (p: Ligne): number => {
    const t = saisies[p.id] ?? "";
    if (t.trim() === "") return p.catalogue_c;
    return centimes(t) ?? p.catalogue_c;
  };

  /** Une saisie presente mais illisible — on la signale plutot que de la deviner. */
  const fautif = (p: Ligne): boolean => {
    const t = saisies[p.id] ?? "";
    return t.trim() !== "" && centimes(t) === null;
  };

  const propres = lignes.filter((p) => applique(p) !== p.catalogue_c);
  const enVente = lignes.filter((p) => p.canaux > 0 && !p.masque);

  const rayons = [...cats].sort((a, z) => a.ordre - z.ordre)
    .map((c) => ({ cat: c, liste: enVente.filter((p) => Number(p.categorie_id) === Number(c.id)) }));
  const rayonVu = rayons.find(({ cat }) => Number(cat.id) === Number(vu)) ?? rayons[0];

  const ligne = (p: Ligne) => {
    const prix = applique(p);
    const ecart = prix - p.catalogue_c;
    const pct = ecartPourcent(prix, p.catalogue_c);
    const mauvais = fautif(p);

    return (
      <div className={`prix-ligne${p.canaux === 0 || p.masque ? " dort" : ""}`} key={p.id}>
        <span className="prix-vign" aria-hidden>
          {p.image !== null
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/image/${p.image}`} alt="" />
            : p.icone ? <Picto cle={p.icone} taille={22} />
                      : <span className="rien">·</span>}
        </span>

        <div className="quoi">
          <div className="nom">{p.nom}</div>
          <div className="meta">
            <span className="mono">{p.sku}</span>
            {p.masque ? " · masqué ici"
              : p.canaux === 0 ? " · sur aucun canal ici"
              : ` · ${p.canaux} ${p.canaux > 1 ? "canaux" : "canal"}`}
            {p.propre && p.par ? ` · posé par ${p.par}` : ""}
          </div>
        </div>

        {/* LE PRIX GENERAL RESTE SOUS LES YEUX. Decider d'un tarif sans voir
            celui d'ou l'on part, c'est taper un chiffre au hasard. */}
        <div className="general">
          <span className="etiq">catalogue</span>
          <span className="montant">{euros(p.catalogue_c)}</span>
        </div>

        <div className={`prix-champ${mauvais ? " faux" : ""}`}>
          <input name={`prix_${p.id}`} inputMode="decimal" className="num"
                 aria-label={`Prix de ${p.nom} sur cette borne — vide pour suivre le catalogue`}
                 aria-invalid={mauvais || undefined}
                 placeholder={enSaisie(p.catalogue_c)}
                 value={saisies[p.id] ?? ""}
                 onChange={(ev) => saisir((s) => ({ ...s, [p.id]: ev.target.value }))} />
          <span aria-hidden>€</span>
        </div>

        {/* L'ETAT DE LA LIGNE, EN UN COUP D'OEIL — et de quoi revenir en
            arriere sans avoir a se souvenir du prix general. */}
        <div className="verdict">
          {mauvais ? (
            <span className="prix-ecart faux">montant illisible</span>
          ) : ecart === 0 ? (
            <span className="prix-ecart suit">suit le catalogue</span>
          ) : (
            <>
              <span className={`prix-ecart ${ecart > 0 ? "haut" : "bas"}`}>
                {ecart > 0 ? "+" : "−"}
                {pct === null ? euros(Math.abs(ecart)) : `${Math.abs(pct)} %`}
              </span>
              <button type="button" className="prix-aligner"
                      title={`Revenir au prix du catalogue pour ${p.nom}`}
                      onClick={() => saisir((s) => ({ ...s, [p.id]: "" }))}>
                aligner
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const groupes = [...cats].sort((a, z) => a.ordre - z.ordre)
    .map((c) => ({ cat: c, liste: lignes.filter((p) => Number(p.categorie_id) === Number(c.id)) }))
    .filter(({ liste }) => liste.length > 0);
  const sansRayon = lignes.filter((p) =>
    !cats.some((c) => Number(c.id) === Number(p.categorie_id)));

  return (
    <>
      <div className="colonne-ranger">
        {groupes.map(({ cat, liste }) => (
          <div className="rayon" key={cat.id}>
            <div className="fiche-cat">
              {cat.nom}
              <span>
                {liste.filter((p) => applique(p) !== p.catalogue_c).length} prix propre
                {liste.filter((p) => applique(p) !== p.catalogue_c).length > 1 ? "s" : ""} sur {liste.length}
              </span>
            </div>
            <div className="prix-liste">{liste.map(ligne)}</div>
          </div>
        ))}

        {sansRayon.length > 0 ? (
          <div className="rayon">
            <div className="fiche-cat">Sans catégorie<span>{sansRayon.length}</span></div>
            <div className="prix-liste">{sansRayon.map(ligne)}</div>
          </div>
        ) : null}

        <div className="pied-ranger">
          <button className="bouton primaire">Enregistrer les prix</button>
          {/*
            LE GESTE QUI REPARE. On a essaye un tarif sur douze produits et on
            veut repartir du catalogue : sans ce bouton, il faudrait vider douze
            champs a la main — et on n'oserait plus essayer.

            Il part dans le MEME formulaire que « Enregistrer », donc avec les
            memes champs ; c'est son `action=aligner` que la route lit en
            premier, et elle ignore alors tout le reste. Deux formulaires
            imbriques auraient ete le seul autre moyen, et le HTML l'interdit.
          */}
          {propres.length > 0 ? (
            <button className="bouton" name="action" value="aligner">
              Tout aligner sur le catalogue
            </button>
          ) : null}
          <span className="faible">
            {propres.length === 0
              ? "Cette borne suit le catalogue sur tous ses produits."
              : `${propres.length} prix propre${propres.length > 1 ? "s" : ""} à cette borne.`}
            {" "}La machine l’appliquera dès qu’elle répond — quelques secondes.
          </span>
        </div>
      </div>

      {/* L'APERCU : l'etal de CETTE borne, aux prix qu'on est en train de taper.
          Meme rendu que le catalogue general — c'est le meme ecran, vu depuis
          une machine plutot que depuis le compte. */}
      <aside className="apercu-borne">
        <div className="titre-apercu">Sur l’écran de cette borne</div>

        <div className="onglets-rayon">
          {rayons.map(({ cat, liste }) => (
            <button type="button" key={cat.id}
                    className={`onglet${Number(vu) === Number(cat.id) ? " actif" : ""}`
                               + `${liste.length === 0 ? " creux" : ""}`}
                    onClick={() => regarder(cat.id)}>
              {cat.nom}<span>{liste.length}</span>
            </button>
          ))}
        </div>

        <div className="ecran-borne catalogue">
          <div className="tete-cat">
            <span className="retour">‹</span>
            <span className="titre">{rayonVu?.cat.nom ?? "—"}</span>
            <span className="pousse" />
            <span className="marque">R3</span>
            <span className="panier">Panier 0</span>
          </div>
          <div className="invite">touchez un produit pour le détail</div>

          {(rayonVu?.liste ?? []).length > 0 ? (
            <div className="grille-produits">
              {rayonVu!.liste.map((p) => (
                <div className="carte-produit" key={p.id}>
                  <span className="cp-nom">{p.nom}</span>
                  <span className="cp-pied">
                    <span className={`cp-prix${applique(p) !== p.catalogue_c ? " a-part" : ""}`}>
                      {euros(applique(p))}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="t-rien">
              Ce rayon n’apparaîtra pas sur cette borne : aucun produit affiché n’y occupe de canal.
            </p>
          )}

          <div className="pied-cat">
            <span><b>0 article</b><br />0,00 €</span>
            <span className="cta">Voir le panier ›</span>
          </div>
        </div>

        <p className="faible" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Un prix propre à cette borne apparaît en rouge. Les produits masqués ici,
          ou qui n’occupent aucun canal, ne sont pas montrés.
        </p>
      </aside>
    </>
  );
}
