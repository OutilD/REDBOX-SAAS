"use client";

import { BISCUIT_PSEUDO_REPORTE } from "@/lib/pseudo";

/**
 * « PLUS TARD » sur le bandeau qui demande un pseudo. Il revenait sur chaque
 * page tant qu'on n'avait pas choisi : un mois de repit, retenu dans un
 * biscuit que l'en-tete lit avant de le montrer. Le bandeau s'efface tout de
 * suite, sans attendre la page suivante.
 */
export default function PlusTard() {
  return (
    <button type="button" className="bouton petit discret"
            onClick={(e) => {
              document.cookie = `${BISCUIT_PSEUDO_REPORTE}=1; Path=/; Max-Age=${30 * 86400}; SameSite=Lax`;
              e.currentTarget.closest(".demo-bandeau")?.remove();
            }}>
      Plus tard
    </button>
  );
}
