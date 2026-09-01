"use client";

import { useState } from "react";
import { IcoAuto, IcoLune, IcoReplier, IcoSoleil } from "./icones";

/**
 * LES DEUX BASCULES DE L'EN-TETE : le theme et le repli du menu.
 *
 * Elles passaient par un formulaire, une route et une redirection — donc un
 * rechargement complet de la page pour changer une couleur ou une largeur.
 * C'etait indefendable : ces deux reglages ne touchent QUE deux attributs sur
 * `<html>`, `data-theme` et `data-rail`, dont toute la feuille de style depend.
 *
 * On les change donc sur place. PAS DE RESEAU DU TOUT, meme en arriere-plan :
 * ces biscuits ne sont pas `HttpOnly`, le navigateur peut les ecrire lui-meme.
 * Le serveur les relira au prochain rendu — il n'a pas besoin de l'apprendre
 * maintenant. Le changement est instantane, et rien ne clignote.
 *
 * Le repli sans JavaScript garde les anciens formulaires : ils marchaient, ils
 * rechargeaient, mais ils marchaient.
 */

const UN_AN = 365 * 24 * 3600;

/** Ecrit un biscuit lisible par le serveur au prochain rendu. */
function poserBiscuit(nom: string, valeur: string | null) {
  document.cookie = valeur === null
    ? `${nom}=; Path=/; SameSite=Lax; Max-Age=0`
    : `${nom}=${valeur}; Path=/; SameSite=Lax; Max-Age=${UN_AN}`;
}

const SUITE: Record<string, string> = { auto: "dark", dark: "light", light: "auto" };
const NOM: Record<string, string> = {
  auto: "Thème du système", dark: "Thème sombre", light: "Thème clair",
};

export function BasculeTheme({ depart, retour }: { depart: string; retour: string }) {
  const [theme, poser] = useState(depart);
  const prochain = SUITE[theme] ?? "dark";

  return (
    <>
      <button type="button" className="bouton icone avec-script"
              title={NOM[theme]} aria-label={`${NOM[theme]} — passer à ${NOM[prochain]}`}
              onClick={() => {
                const r = document.documentElement;
                if (prochain === "auto") r.removeAttribute("data-theme");
                else r.setAttribute("data-theme", prochain);
                poserBiscuit("rbx_theme", prochain === "auto" ? null : prochain);
                poser(prochain);
              }}>
        {theme === "dark" ? <IcoLune /> : theme === "light" ? <IcoSoleil /> : <IcoAuto />}
      </button>

      <noscript>
        <form method="post" action="/api/theme">
          <input type="hidden" name="actuel" value={depart} />
          <input type="hidden" name="retour" value={retour} />
          <button className="bouton icone" title={NOM[depart]}>
            {depart === "dark" ? <IcoLune /> : depart === "light" ? <IcoSoleil /> : <IcoAuto />}
          </button>
        </form>
      </noscript>
    </>
  );
}

export function BasculeRail({ depart, retour }: { depart: string; retour: string }) {
  const [rail, poser] = useState(depart);
  const ferme = rail === "ferme";
  const mot = ferme ? "Déplier le menu" : "Replier le menu";

  return (
    <>
      <button type="button" className="bouton icone rail-bascule avec-script"
              title={mot} aria-label={mot} aria-expanded={!ferme}
              onClick={() => {
                const suivant = ferme ? "" : "ferme";
                const r = document.documentElement;
                if (suivant) r.setAttribute("data-rail", suivant);
                else r.removeAttribute("data-rail");
                poserBiscuit("rbx_rail", suivant || null);
                poser(suivant);
              }}>
        <IcoReplier />
      </button>

      <noscript>
        <form method="post" action="/api/rail">
          <input type="hidden" name="actuel" value={depart} />
          <input type="hidden" name="retour" value={retour} />
          <button className="bouton icone rail-bascule"
                  title={depart === "ferme" ? "Déplier le menu" : "Replier le menu"}>
            <IcoReplier />
          </button>
        </form>
      </noscript>
    </>
  );
}
