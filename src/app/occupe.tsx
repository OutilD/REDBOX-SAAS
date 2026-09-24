"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ENTETE_ENVOI } from "@/lib/envoi";

/**
 * LES FORMULAIRES PARTENT SANS RECHARGER LA PAGE.
 *
 * La console s'ecrit en formulaires ordinaires — ils marchent sans
 * JavaScript, et chaque action passe par une route qui repond « va la ».
 * Mais un rechargement complet a chaque clic, avec une base de l'autre cote
 * de l'Atlantique, c'est une seconde d'ecran fige par action, et une page qui
 * revient tout en haut.
 *
 * Un seul ecouteur, pose une fois sur le document, plutot qu'un composant a
 * envelopper autour de chaque formulaire : il y en a une centaine, et celui
 * qu'on oublierait serait justement celui qui frustre. Il envoie le formulaire
 * lui-meme, demande a la route son adresse de retour (voir `versPage`), et y
 * va par le routeur de Next : seul le contenu change, l'ecran ne clignote pas,
 * et la page reste ou elle etait si l'adresse ne bouge pas.
 *
 * On ecoute en phase de remontee, apres React : un formulaire que la page gere
 * elle-meme (la messagerie) a deja dit `preventDefault`, on le laisse.
 *
 * ON NE DESACTIVE PAS LE BOUTON. Un `disabled` pose pendant la soumission fait
 * perdre son `name`/`value` au bouton qui l'a declenchee — et plusieurs de nos
 * formulaires s'en servent (« Supprimer » porte l'identifiant de la ligne). On
 * neutralise donc les clics suivants par le style, ce qui protege du double
 * envoi sans toucher aux donnees envoyees. Le verrou se leve a l'arrivee de la
 * page suivante, et de toute facon au bout de quinze secondes.
 *
 * LES LIENS AUSSI. Un clic sur un lien de la console passe par la meme
 * transition : la page courante reste affichee, avec un fil rouge qui avance
 * en haut de l'ecran, jusqu'a ce que la suivante soit prete. L'ecran d'attente
 * au logo ne sert plus qu'au premier chargement. Le fil n'apparait qu'apres
 * un dixieme de seconde : une page prechargee arrive avant, et il ne
 * clignote pas pour rien.
 */

/** Ce qui doit recharger la page entiere : la session, le theme, le produit — tout ce que la mise en page lit une fois. */
const RECHARGENT = ["/api/session", "/api/inscription", "/api/rejoindre", "/api/theme", "/api/rail", "/api/compte", "/api/demo"];

export default function Occupe() {
  const router = useRouter();
  const [enCours, transition] = useTransition();
  const [fil, montrerFil] = useState(false);
  // L'ancre a rejoindre une fois la nouvelle page la, quand l'adresse ne
  // change pas : le routeur ne defile que s'il navigue vraiment.
  const ancre = useRef<string | null>(null);

  // Le fil, un dixieme de seconde apres le depart ; retire des l'arrivee.
  useEffect(() => {
    if (!enCours) { montrerFil(false); return; }
    const t = window.setTimeout(() => montrerFil(true), 120);
    return () => window.clearTimeout(t);
  }, [enCours]);

  // La page suivante est arrivee : plus rien n'attend, et on va a l'ancre.
  useEffect(() => {
    if (enCours) return;
    document.querySelectorAll(".occupe").forEach(liberer);
    if (ancre.current) {
      const cible = document.getElementById(ancre.current);
      ancre.current = null;
      cible?.scrollIntoView({ block: "start" });
    }
  }, [enCours]);

  useEffect(() => {
    const LEVEE_MS = 15_000;

    const marquer = (el: Element | null) => {
      if (!el || el.classList.contains("occupe")) return;
      el.classList.add("occupe");
      el.setAttribute("aria-busy", "true");
      el.closest("form")?.classList.add("forme-occupee");
      window.setTimeout(() => liberer(el), LEVEE_MS);
    };

    /** Rejoindre l'adresse rendue par la route, sans recharger si l'on peut. */
    const aller = (vers: string) => {
      const u = new URL(vers, location.href);
      if (u.origin !== location.origin) { location.assign(u.href); return; }
      // Une boite de dialogue ouverte le resterait par-dessus la page suivante.
      document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => d.close());
      const meme = u.pathname === location.pathname && u.search === location.search;
      ancre.current = u.hash ? decodeURIComponent(u.hash.slice(1)) : null;
      transition(() => {
        if (meme) router.refresh();
        else router.push(u.pathname + u.search + u.hash, { scroll: !ancre.current && u.pathname !== location.pathname });
      });
    };

    const surEnvoi = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const forme = e.target as HTMLFormElement;
      const sub = e.submitter as HTMLButtonElement | HTMLInputElement | null;
      const bouton = sub ?? forme.querySelector("button[type=submit], button:not([type])");
      const methode = (forme.getAttribute("method") ?? "get").toLowerCase();
      const action = forme.getAttribute("action") ?? "";
      const parNous = methode === "post" && action.startsWith("/api/") && !forme.hasAttribute("data-recharge")
        && !RECHARGENT.some((p) => action === p || action.startsWith(p + "/"));
      marquer(bouton);
      if (!parNous) return;

      e.preventDefault();
      // Le bouton qui a envoye compte parmi les champs, comme pour un envoi
      // natif : « Supprimer » porte l'identifiant de sa ligne.
      let donnees: FormData;
      try { donnees = new FormData(forme, sub ?? undefined); }
      catch {
        donnees = new FormData(forme);
        if (sub?.name) donnees.append(sub.name, sub.value);
      }
      fetch(action, { method: "POST", body: donnees, credentials: "same-origin", headers: { [ENTETE_ENVOI]: "1" } })
        .then(async (r) => {
          if (r.ok && (r.headers.get("content-type") ?? "").includes("application/json")) {
            const j = await r.json().catch(() => null) as { vers?: unknown } | null;
            if (j && typeof j.vers === "string") { aller(j.vers); return; }
          }
          // Pas notre reponse : la route a fait autre chose, on recharge comme avant.
          if (r.redirected) location.assign(r.url); else location.reload();
        })
        .catch(() => {
          // Reseau tombe avant que la route ne reponde : l'envoi natif, qui
          // saura afficher l'erreur du navigateur.
          if (bouton) liberer(bouton);
          forme.submit();
        });
    };

    // UN LIEN DE LA CONSOLE part par la transition. On ecoute en capture,
    // avant le gestionnaire de <Link>, qui s'efface devant un `preventDefault`.
    // On laisse au navigateur ce qui n'est pas une page de la console : autre
    // site, nouvel onglet, telechargement, clic modifie au clavier, simple
    // ancre dans la page, ou un lien qui demande a recharger.
    const surClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-recharge")) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
      if (u.pathname === location.pathname && u.search === location.search && u.hash) return;
      if (RECHARGENT.some((p) => u.pathname === p || u.pathname.startsWith(p + "/"))) return;
      e.preventDefault();
      if (a.matches("a.bouton, a.produit-ligne, a.lieu-ligne")) marquer(a);
      ancre.current = u.hash ? decodeURIComponent(u.hash.slice(1)) : null;
      transition(() => router.push(u.pathname + u.search + u.hash));
    };

    // La page a change : plus rien n'attend.
    const surRetour = () => document.querySelectorAll(".occupe").forEach(liberer);

    document.addEventListener("submit", surEnvoi);
    document.addEventListener("click", surClic, true);
    window.addEventListener("pageshow", surRetour);
    return () => {
      document.removeEventListener("submit", surEnvoi);
      document.removeEventListener("click", surClic, true);
      window.removeEventListener("pageshow", surRetour);
    };
  }, [router, transition]);

  return fil ? <div className="progression" role="progressbar" aria-label="Chargement" aria-busy="true" /> : null;
}

function liberer(el: Element) {
  el.classList.remove("occupe");
  el.removeAttribute("aria-busy");
  el.closest("form")?.classList.remove("forme-occupee");
}
