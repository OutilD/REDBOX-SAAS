"use client";

import { useMemo, useState } from "react";
import { prefixeSku } from "@/lib/sku";

export type Cat = { id: number; nom: string };
export type Borne = { id: number; nom: string };
export type Libre = { id: number; borne_id: number; code: string };
export type Connu = { sku: string; nom: string };

const pareil = (a: string, b: string) =>
  a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");

/**
 * AJOUTER UN PRODUIT.
 *
 * Trois choses que le serveur seul ne pouvait pas faire :
 *
 *  1. RANGEE ET COLONNE NE S'AFFICHENT QUE QUAND ELLES SERVENT. Elles ne valent
 *     que pour « declarer une nouvelle spire » ; presentes en permanence, elles
 *     laissaient croire qu'il fallait les remplir a chaque ajout.
 *  2. LE SKU EST FACULTATIF. Laisse vide, le serveur le fabrique — et on montre
 *     ici lequel, pour qu'on ne decouvre pas la reference apres coup.
 *  3. LES DOUBLONS SE VOIENT AVANT L'ENVOI. Une reference deja prise fait
 *     echouer l'ajout ; autant le dire pendant qu'on tape, plutot qu'apres un
 *     aller-retour et une page rechargee.
 *
 * Sans JavaScript, tout reste envoyable : les champs sont visibles, le SKU vide
 * est fabrique par le serveur, et c'est lui qui refuse le doublon. On ne perd
 * que le confort.
 */
export default function Ajout({ categories, bornes, libres, connus, suites }: {
  categories: Cat[]; bornes: Borne[]; libres: Libre[]; connus: Connu[];
  suites: Record<string, number>;
}) {
  const [cat, poserCat] = useState<string>(categories[0] ? String(categories[0].id) : "");
  const [sku, poserSku] = useState("");
  const [nom, poserNom] = useState("");
  const [place, poserPlace] = useState("");

  const nouvelleSpire = place.startsWith("neuf:");

  // Ce que le serveur choisira si on ne saisit rien. Le rang peut avoir bouge
  // entre-temps ; le serveur avancera alors tout seul, d'ou le « environ ».
  const propose = useMemo(() => {
    const c = categories.find((x) => String(x.id) === cat);
    if (!c) return "";
    const p = prefixeSku(c.nom);
    return `${p}-${String(suites[p] ?? 1).padStart(3, "0")}`;
  }, [cat, categories, suites]);

  const skuPris = sku.trim() !== "" && connus.some((c) => pareil(c.sku, sku));
  const nomPris = nom.trim() !== "" && connus.some((c) => pareil(c.nom, nom));

  return (
    <form method="post" action="/api/catalogue">
      <div className="rangee" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 150 }}>
          <label htmlFor="sku">SKU</label>
          <input id="sku" name="sku" autoCapitalize="characters" className="mono"
                 placeholder={propose || "auto"} value={sku}
                 aria-invalid={skuPris} onChange={(e) => poserSku(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 190 }}>
          <label htmlFor="nom">Nom</label>
          <input id="nom" name="nom" required value={nom}
                 aria-invalid={nomPris} onChange={(e) => poserNom(e.target.value)} />
        </div>
      </div>

      {skuPris ? (
        <p className="dit-mal">La référence <b className="mono">{sku.trim().toUpperCase()}</b> est
        déjà prise. Changez-la, ou laissez le champ vide pour en obtenir une.</p>
      ) : sku.trim() === "" && propose ? (
        <p className="dit-faible">Laissé vide, le SKU sera <b className="mono">{propose}</b> —
        ou le suivant s’il vient d’être pris.</p>
      ) : null}

      {nomPris ? (
        <p className="dit-mal">Un produit s’appelle déjà <b>{nom.trim()}</b>. Ce n’est pas
        interdit, mais deux lignes identiques dans une fiche de réassort se confondent.</p>
      ) : null}

      <div className="rangee" style={{ gap: 12, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="cat">Catégorie</label>
          <select id="cat" name="categorie_id" required value={cat}
                  onChange={(e) => poserCat(e.target.value)}>
            <option value="" disabled>Choisir…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div style={{ width: 120 }}>
          <label htmlFor="prix">Prix (€)</label>
          <input id="prix" name="prix" inputMode="decimal" defaultValue="0,00" />
        </div>
        <div style={{ width: 130 }}>
          <label htmlFor="age">Âge minimum</label>
          <select id="age" name="age_min" defaultValue="18">
            <option value="0">aucun</option><option value="18">18 ans</option>
          </select>
        </div>
      </div>

      {bornes.length > 0 ? (
        <fieldset className="cadre-choix">
          <legend>Où le poser</legend>
          <div className="rangee" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 230 }}>
              <label htmlFor="place">Spire</label>
              <select id="place" name="place" value={place}
                      onChange={(e) => poserPlace(e.target.value)}>
                <option value="">— pas tout de suite —</option>
                {bornes.map((b) => (
                  <optgroup key={b.id} label={b.nom}>
                    {libres.filter((c) => Number(c.borne_id) === Number(b.id)).map((c) => (
                      <option key={c.id} value={`canal:${c.id}`}>canal {c.code} · libre</option>
                    ))}
                    <option value={`neuf:${b.id}`}>＋ déclarer une nouvelle spire…</option>
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Elles n'apparaissent QUE pour une spire neuve : ailleurs, elles
                n'ont aucun effet et ne font que poser une question de plus. */}
            {nouvelleSpire ? (
              <>
                <div style={{ width: 96 }}>
                  <label htmlFor="rangee">Rangée</label>
                  <input id="rangee" name="rangee" type="number" min={1} max={10}
                         required inputMode="numeric" defaultValue={1} />
                </div>
                <div style={{ width: 96 }}>
                  <label htmlFor="colonne">Colonne</label>
                  <input id="colonne" name="colonne" type="number" min={1} max={10}
                         required inputMode="numeric" defaultValue={1} />
                </div>
              </>
            ) : null}
          </div>

          {nouvelleSpire ? (
            <p className="dit-faible">
              Le code de la spire se compose des deux : rangée 5, colonne 1 →
              <b className="mono"> 501</b>. C’est l’adresse envoyée au moteur.
            </p>
          ) : (
            <p className="dit-faible">
              Un produit sans spire part bien sur les bornes, mais aucune ne peut le sortir.
            </p>
          )}
        </fieldset>
      ) : null}

      <div style={{ height: 16 }} />
      <button className="bouton primaire large" disabled={skuPris}>
        Ajouter au catalogue
      </button>
    </form>
  );
}
