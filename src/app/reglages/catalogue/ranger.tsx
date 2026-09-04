"use client";

import Link from "next/link";
import { useState } from "react";
import Vignette from "../../vignette";
import { DESC_MAX, MENTION_MAX, mentionDAge } from "@/lib/fiche";

export type Prod = {
  id: number; sku: string; nom: string; prix_vente_c: number;
  categorie_id: number | null; actif: boolean; ordre: number;
  canaux: number; bouge: number;      // bouge = mouvements de stock enregistres
  image: number | null; icone: string | null;
  age_min: number; description: string | null; mention: string | null;
  fiche_visible: boolean;
};
export type Cat = { id: number; nom: string; ordre: number };

const euros = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

/**
 * RANGER LE CATALOGUE.
 *
 * Le meme geste que pour les categories, d'un cran plus fin : on attrape un
 * produit et on le pose. Le deposer dans un AUTRE rayon l'y range — l'ordre et
 * le classement se decident du meme mouvement, parce que c'est ainsi qu'on y
 * pense : « celui-la, je le mets en tete des batteries ».
 *
 * L'apercu de droite montre le rayon tel que le client le verra. Il se met a
 * jour pendant qu'on tape et qu'on deplace : c'est lui qui dit si le rangement
 * tient debout, pas la liste.
 *
 * Sans JavaScript la liste s'affiche, les noms et les prix restent editables ;
 * seul le glisser-deposer manque. C'est un confort, pas la seule porte.
 */
export default function RangerProduits({ initiaux, cats }: { initiaux: Prod[]; cats: Cat[] }) {
  const [prods, poser] = useState(initiaux);
  const [pris, prendre] = useState<number | null>(null);
  const [cible, viser] = useState<string | null>(null);
  const [aConfirmer, confirmer] = useState<number | null>(null);
  // La fiche ouverte, s'il y en a une. Une seule a la fois : c'est un texte
  // qu'on ecrit, pas une case qu'on coche, et deux champs longs ouverts cote a
  // cote font perdre la ligne qu'on etait en train de lire.
  const [fiche, ouvrirFiche] = useState<number | null>(null);
  // Le rayon montre dans l'apercu. Par defaut le premier — c'est celui que le
  // client voit en haut de son ecran d'accueil.
  const [vu, regarder] = useState<number | null>(cats[0] ? Number(cats[0].id) : null);

  const rayons = [...cats].sort((a, z) => a.ordre - z.ordre)
    .map((c) => ({ cat: c, liste: prods.filter((p) => Number(p.categorie_id) === Number(c.id)) }));
  const orphelins = prods.filter((p) => !cats.some((c) => Number(c.id) === Number(p.categorie_id)));

  const rayonVu = rayons.find(({ cat }) => Number(cat.id) === Number(vu)) ?? rayons[0];
  const montres = (rayonVu?.liste ?? []).filter((p) => p.actif && p.canaux > 0);

  /**
   * L'APERCU SUIT LA MAIN.
   *
   * On deplace un produit dans les batteries pendant que l'apercu montre les
   * vapes : on ne voit rien de ce qu'on vient de faire, et on doit aller cliquer
   * l'onglet pour verifier. Le panneau se porte donc sur le rayon touche, quel
   * que soit le geste — deplacer, renommer, changer un prix, suspendre.
   *
   * Un `null` (produit sans categorie) ne deplace rien : ce rayon-la n'a pas
   * d'onglet, on laisserait l'apercu vide sans raison.
   */
  const regarderRayon = (cat: number | null) => {
    if (cat !== null && cats.some((c) => Number(c.id) === Number(cat))) regarder(Number(cat));
  };

  const modifier = (id: number, champ: Partial<Prod>) => {
    poser((l) => l.map((p) => (p.id === id ? { ...p, ...champ } : p)));
    const p = prods.find((x) => x.id === id);
    if (p) regarderRayon(p.categorie_id);
  };

  /** Depose le produit `id` dans le rayon `cat`, juste avant `avantId`. */
  const deposer = (id: number, cat: number | null, avantId: number | null) => {
    regarderRayon(cat);
    poser((l) => {
      const bouge = l.find((p) => p.id === id);
      if (!bouge) return l;
      const reste = l.filter((p) => p.id !== id);
      const place = { ...bouge, categorie_id: cat };
      const i = avantId === null ? reste.length : reste.findIndex((p) => p.id === avantId);
      if (i < 0) return [...reste, place];
      return [...reste.slice(0, i), place, ...reste.slice(i)];
    });
  };

  const rendu = (p: Prod, i: number, cat: number | null) => (
    <div key={p.id}
         className={`rangeable produit${pris === p.id ? " pris" : ""}`
                    + `${cible === `${cat}:${p.id}` && pris !== null && pris !== p.id ? " cible" : ""}`
                    + `${p.actif ? "" : " suspendu"}`}
         draggable
         onDragStart={() => prendre(p.id)}
         onDragEnd={() => { prendre(null); viser(null); }}
         onDragOver={(e) => { e.preventDefault(); viser(`${cat}:${p.id}`); }}
         onDrop={(e) => {
           e.preventDefault(); e.stopPropagation();
           if (pris !== null) deposer(pris, cat, p.id);
           prendre(null); viser(null);
         }}>
      <span className="poignee" aria-hidden>⠿</span>
      <span className="rang">{i + 1}</span>
      <Vignette id={p.id} nom={p.nom} image={p.image} icone={p.icone} />
      <div className="corps">
        <input className="nom-modifiable" value={p.nom} name={`pnom_${p.id}`} required
               aria-label={`Nom de ${p.nom}`} draggable={false}
               onChange={(ev) => modifier(p.id, { nom: ev.target.value })}
               onDragStart={(ev) => { ev.preventDefault(); ev.stopPropagation(); }} />
        <div className="meta">
          <span className="mono">{p.sku}</span>
          {p.canaux > 0 ? ` · ${p.canaux} ${p.canaux > 1 ? "canaux" : "canal"}` : " · sur aucun canal"}
          {p.actif ? "" : " · suspendu"}
        </div>
      </div>

      {/* Le prix reste editable la ou il se lit, et l'apercu le repercute
          aussitot : c'est le chiffre qu'on vient le plus souvent corriger. */}
      <div className="prix-champ">
        <input name={`prix_${p.id}`} inputMode="decimal" className="num"
               aria-label={`Prix de ${p.nom}`} draggable={false}
               value={(p.prix_vente_c / 100).toFixed(2).replace(".", ",")}
               onChange={(ev) => {
                 const n = Math.round(parseFloat(ev.target.value.replace(",", ".")) * 100);
                 modifier(p.id, { prix_vente_c: Number.isFinite(n) && n >= 0 ? n : 0 });
               }}
               onDragStart={(ev) => { ev.preventDefault(); ev.stopPropagation(); }} />
        <span>€</span>
      </div>

      {/* Les deux gestes qui suivent presque toujours la lecture d'une ligne de
          catalogue : en recevoir, ou en envoyer sur les bornes. Autant ne pas
          obliger a repasser par le menu et a rechercher le meme produit. */}
      <Link href={`/reception?p=${p.id}`} className="bouton petit discret"
            draggable={false} title={`Recevoir du stock de ${p.nom}`}>
        Recevoir
      </Link>
      <Link href={`/reassort?p=${p.id}`} className="bouton petit discret"
            draggable={false} title={`Réassort des bornes qui portent ${p.nom}`}>
        Réassort
      </Link>

      {/* La fiche : ce que la borne montrera quand le client touchera le « i ».
          Repliee par defaut — deux textes longs sur chaque ligne rendraient la
          liste illisible, et on ne les ecrit qu'une fois.

          LE BOUTON DIT CE QUE FAIT LA BORNE, pas ce qu'on a ecrit. Une fiche
          retiree se lit depuis la liste : sans ca, on relit dix lignes et on
          ouvre dix panneaux pour retrouver le produit qu'on avait ferme. */}
      <button type="button" className="bouton petit discret"
              onClick={() => ouvrirFiche(fiche === p.id ? null : p.id)}
              aria-expanded={fiche === p.id}
              title={p.fiche_visible
                ? `Fiche de ${p.nom} — description et mention légale`
                : `Fiche de ${p.nom} — le « i » ne s’affiche pas sur les bornes`}>
        Fiche{p.fiche_visible ? (p.description || p.mention ? " ·" : "") : " · i masqué"}
      </button>

      <button type="button" className="bouton petit"
              onClick={() => modifier(p.id, { actif: !p.actif })}
              aria-pressed={!p.actif}>
        {p.actif ? "Suspendre" : "Reprendre"}
      </button>
      <input type="hidden" name={`pactif_${p.id}`} value={p.actif ? "1" : "0"} />

      {p.bouge === 0 ? (
        <button className="bouton petit discret oter" name="supprimer" value={p.id}
                aria-label={`Supprimer ${p.nom}`}>✕</button>
      ) : (
        <button type="button" className="bouton petit discret oter"
                aria-label={`Supprimer ${p.nom}`}
                onClick={() => confirmer(aConfirmer === p.id ? null : p.id)}>✕</button>
      )}

      <input type="hidden" name={`pord_${p.id}`} value={(i + 1) * 10} />
      <input type="hidden" name={`cat_${p.id}`} value={cat ?? ""} />

      {/*
        Le panneau est TOUJOURS dans la page, seulement masque : un champ retire
        du document ne part pas avec le formulaire, et fermer la fiche aurait
        efface ce qu'on venait d'y ecrire.
      */}
      <div className="fiche-produit" hidden={fiche !== p.id}>
        {/*
          LE « I » SE RETIRE ICI, au-dessus des deux textes qu'il ouvre — c'est
          la seule place ou la question se pose vraiment : on vient d'ecrire la
          fiche, ou de constater qu'il n'y a rien a ecrire.

          La case ne porte pas de `name` : decochee, elle n'enverrait rien, et
          « rien » est indiscernable d'un produit absent du formulaire — la route
          ne met a jour que les champs qu'elle recoit, et le « i » ne pourrait
          alors plus jamais s'eteindre. C'est le champ cache qui porte la valeur,
          comme pour « Suspendre ».
        */}
        <label className="coche coche-fiche">
          <input type="checkbox" checked={p.fiche_visible}
                 onChange={(ev) => modifier(p.id, { fiche_visible: ev.target.checked })} />
          <span>Bouton « i » sur la borne</span>
        </label>
        <input type="hidden" name={`pfiche_${p.id}`} value={p.fiche_visible ? "1" : "0"} />
        <p className="faible" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
          {p.fiche_visible
            ? "Le client peut ouvrir cette fiche depuis l’étal."
            : "Le « i » disparaît de la carte : ce produit ne s’ouvre plus. Les textes ci-dessous sont conservés."}
        </p>

        <label htmlFor={`desc_${p.id}`}>Description — ce qui aide à choisir</label>
        <textarea id={`desc_${p.id}`} name={`desc_${p.id}`} rows={2} maxLength={DESC_MAX}
                  draggable={false} placeholder="600 bouffées · 2 % de nicotine · goût menthe glaciale"
                  value={p.description ?? ""}
                  onChange={(ev) => modifier(p.id, { description: ev.target.value })}
                  onDragStart={(ev) => { ev.preventDefault(); ev.stopPropagation(); }} />

        <label htmlFor={`ment_${p.id}`}>Mention légale — affichée sous la description</label>
        <textarea id={`ment_${p.id}`} name={`ment_${p.id}`} rows={3} maxLength={MENTION_MAX}
                  draggable={false}
                  placeholder="Le libellé exact est de votre responsabilité — il dépend du produit et de la réglementation."
                  value={p.mention ?? ""}
                  onChange={(ev) => modifier(p.id, { mention: ev.target.value })}
                  onDragStart={(ev) => { ev.preventDefault(); ev.stopPropagation(); }} />

        {mentionDAge(p.age_min) ? (
          <p className="faible" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
            La borne ajoute d’office : « {mentionDAge(p.age_min)} »
          </p>
        ) : null}
      </div>

      {aConfirmer === p.id ? (
        <div className="confirme-oter">
          <div>
            <b>« {p.nom} » ne peut pas être supprimé.</b> Il porte {p.bouge} mouvement
            {p.bouge > 1 ? "s" : ""} de stock — réceptions, transferts, ventes. L’effacer
            trouerait le grand livre, qui est la seule vérité de votre stock.
            {" "}<b>Suspendez-le</b> : il disparaît des bornes, garde son historique,
            et revient d’un clic.
          </div>
          <div className="actions">
            <button type="button" className="bouton petit" onClick={() => confirmer(null)}>
              Fermer
            </button>
            <button type="button" className="bouton petit primaire"
                    onClick={() => { modifier(p.id, { actif: false }); confirmer(null); }}>
              Suspendre
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="colonne-ranger">
        {rayons.map(({ cat, liste }) => (
          <div className="rayon" key={cat.id}
               onDragOver={(e) => { e.preventDefault(); viser(`${cat.id}:fin`); }}
               onDrop={(e) => {
                 e.preventDefault();
                 if (pris !== null) deposer(pris, cat.id, null);
                 prendre(null); viser(null);
               }}>
            <div className="fiche-cat">
              {cat.nom}<span>{liste.filter((p) => p.actif).length} affiché
              {liste.filter((p) => p.actif).length > 1 ? "s" : ""} sur {liste.length}</span>
            </div>
            <div className={`ranger${cible === `${cat.id}:fin` && pris !== null ? " vise" : ""}`}>
              {liste.length === 0
                ? <p className="rayon-vide">Déposez un produit ici pour le ranger dans ce rayon.</p>
                : liste.map((p, i) => rendu(p, i, cat.id))}
            </div>
          </div>
        ))}

        {orphelins.length > 0 ? (
          <div className="rayon"
               onDragOver={(e) => { e.preventDefault(); viser("null:fin"); }}
               onDrop={(e) => {
                 e.preventDefault();
                 if (pris !== null) deposer(pris, null, null);
                 prendre(null); viser(null);
               }}>
            <div className="fiche-cat">Sans catégorie<span>{orphelins.length}</span></div>
            <div className="ranger">{orphelins.map((p, i) => rendu(p, i, null))}</div>
          </div>
        ) : null}

        <div className="pied-ranger">
          <button className="bouton primaire">Enregistrer le catalogue</button>
          <span className="faible">Les bornes l’appliqueront à leur prochaine synchronisation.</span>
        </div>
      </div>

      {/* L'APERCU.

          Non plus toutes les categories empilees — elles debordaient et se
          coupaient — mais L'ECRAN REEL de la borne, un rayon a la fois. On
          change de rayon comme le client le ferait, et on voit ce qu'il verra :
          la grille a deux colonnes, les noms tels qu'ils tiendront, les prix. */}
      <aside className="apercu-borne">
        <div className="titre-apercu">Sur l’écran de la borne</div>

        <div className="onglets-rayon">
          {rayons.map(({ cat, liste }) => {
            const montrables = liste.filter((p) => p.actif && p.canaux > 0).length;
            return (
              <button type="button" key={cat.id}
                      className={`onglet${Number(vu) === Number(cat.id) ? " actif" : ""}`
                                 + `${montrables === 0 ? " creux" : ""}`}
                      onClick={() => regarder(cat.id)}>
                {cat.nom}<span>{montrables}</span>
              </button>
            );
          })}
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

          {montres.length > 0 ? (
            <div className="grille-produits">
              {montres.map((p) => (
                <div className="carte-produit" key={p.id}>
                  <span className="cp-nom">{p.nom}</span>
                  <span className="cp-pied">
                    <span className="cp-prix">{euros(p.prix_vente_c)}</span>
                    {/* Le « i » de la vraie carte. Il n'est pas decoratif : c'est
                        ici qu'on verifie d'un coup d'oeil quelles cartes du rayon
                        l'ont encore, sans rouvrir sept panneaux. */}
                    {p.fiche_visible ? <i className="cp-info" aria-hidden>i</i> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="t-rien">
              Ce rayon n’apparaîtra pas : aucun produit actif n’occupe de canal.
            </p>
          )}

          <div className="pied-cat">
            <span><b>0 article</b><br />0,00 €</span>
            <span className="cta">Voir le panier ›</span>
          </div>
        </div>

        <p className="faible" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Un produit suspendu, ou qui n’occupe aucun canal, n’apparaît pas.
        </p>
      </aside>
    </>
  );
}
