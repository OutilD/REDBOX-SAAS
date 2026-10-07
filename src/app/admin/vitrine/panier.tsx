"use client";

import { useEffect, useRef, useState } from "react";

const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

/**
 * LE PANIER MOYEN QUE DONNERA LE REGLAGE : le chiffre d'affaires divise par le
 * nombre de commandes, relu dans le formulaire a chaque frappe. Hors des prix du
 * catalogue, il ne peut pas etre tenu : on le dit avant de generer.
 */
export default function Panier({ min, max }: { min: number; max: number }) {
  const [f, setF] = useState({ ca: 0, ventes: 0 });
  const ici = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const form = ici.current?.closest("form");
    if (!form) return;
    const lire = () => {
      const n = (k: string) => Number(String(new FormData(form).get(k) ?? "").replace(",", ".").replace(/\s/g, "")) || 0;
      setF({ ca: n("ca"), ventes: n("ventes") });
    };
    lire();
    form.addEventListener("input", lire);
    return () => form.removeEventListener("input", lire);
  }, []);

  const panier = f.ventes > 0 ? (f.ca * 100) / f.ventes : 0;
  const hors = panier > 0 && (panier < min || panier > max);
  return (
    <p className="vitrine-aide" ref={ici} aria-live="polite">
      {panier > 0
        ? <>Panier moyen : <b className="num">{eur(panier)}</b>{hors
            ? <> — hors de ce qu’une commande peut faire ({eur(min)} à {eur(max)}) : on s’en approchera sans l’atteindre.</>
            : null}</>
        : <>Laissez vide : un article par commande, le panier moyen suit les prix du catalogue.</>}
    </p>
  );
}
