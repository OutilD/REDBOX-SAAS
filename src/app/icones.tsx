/**
 * Les icones.
 *
 * Dessinees, pas prises dans une police de caracteres. Les glyphes du genre
 * « ◧ ▦ ▮ » ont l'air de caracteres de remplacement parce que c'en sont : ils
 * changent de forme d'un systeme a l'autre, ne s'alignent pas entre eux, et
 * signalent immediatement que personne n'a regarde.
 *
 * Trait de 1,6 px, grille de 20, extremites arrondies. Elles heritent de la
 * couleur du texte : une seule regle CSS les teinte toutes.
 */
type P = { size?: number };

const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 20 20",
  fill: "none", stroke: "currentColor",
  strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** Tableau de bord : trois colonnes de hauteurs differentes. */
export const IcoTableau = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 16.5v-5M8 16.5V6M12.5 16.5v-8M17 16.5V3.5" />
  </svg>
);

/** Ventes : un ticket de caisse. */
export const IcoVentes = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M5 2.5h10v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V2.5z" />
    <path d="M8 7h4M8 10.5h4" />
  </svg>
);

/** Borne : une machine avec sa vitre et son bac de retrait. */
export const IcoBorne = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
    <path d="M7 5.5h3M7 8h3M7 10.5h3" />
    <path d="M6.5 14.5h7" />
  </svg>
);

/** Stock : des cartons empiles. */
export const IcoStock = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="2.5" y="10.5" width="7" height="7" rx="1" />
    <rect x="10.5" y="10.5" width="7" height="7" rx="1" />
    <rect x="6.5" y="2.5" width="7" height="7" rx="1" />
  </svg>
);

/** Reception : une fleche qui entre dans une caisse. */
export const IcoReception = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M10 2.5v8M7 8l3 3 3-3" />
    <path d="M3 12.5v3a2 2 0 002 2h10a2 2 0 002-2v-3" />
  </svg>
);

/** Catalogue : une liste de references. */
export const IcoCatalogue = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M7 5h10M7 10h10M7 15h10" />
    <path d="M3.5 5h.01M3.5 10h.01M3.5 15h.01" strokeWidth={2.2} />
  </svg>
);

/** Categories : une etiquette. */
export const IcoCategories = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M10.2 2.8H16a1.2 1.2 0 011.2 1.2v5.8a1.2 1.2 0 01-.35.85l-6.55 6.55a1.2 1.2 0 01-1.7 0l-5.8-5.8a1.2 1.2 0 010-1.7l6.55-6.55a1.2 1.2 0 01.85-.35z" />
    <path d="M13.6 6.4h.01" strokeWidth={2.4} />
  </svg>
);

/** Equipe : deux personnes. */
export const IcoEquipe = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <circle cx="7.5" cy="6.5" r="2.8" />
    <path d="M2.5 17c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8" />
    <path d="M13.5 4.2a2.8 2.8 0 010 5.4M14.5 12.6c1.8.6 3 2.2 3 4.4" />
  </svg>
);

/** Reglages : une roue. */
export const IcoReglages = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.2v1.8M10 16v1.8M17.8 10H16M4 10H2.2M15.5 4.5l-1.3 1.3M5.8 14.2l-1.3 1.3M15.5 15.5l-1.3-1.3M5.8 5.8L4.5 4.5" />
  </svg>
);

export const IcoSoleil = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="10" cy="10" r="3.6" />
    <path d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4M15.7 15.7l-1.4-1.4M5.7 5.7L4.3 4.3" />
  </svg>
);

export const IcoLune = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M16.5 12.3A7 7 0 017.7 3.5a7 7 0 108.8 8.8z" />
  </svg>
);

/** Theme automatique : le disque a moitie plein. */
export const IcoAuto = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 3v14a7 7 0 000-14z" fill="currentColor" stroke="none" />
  </svg>
);

export const IcoSortir = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12.5 14v2a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 16V4A1.5 1.5 0 015 2.5h6a1.5 1.5 0 011.5 1.5v2" />
    <path d="M8 10h9M14 7l3 3-3 3" />
  </svg>
);

export const IcoChevron = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M7.5 4l6 6-6 6" /></svg>
);

/** Replier / deplier le rail : deux chevrons opposes. */
export const IcoReplier = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
    <path d="M7.5 3.5v13" />
  </svg>
);

/** Etat d'un produit : le triangle d'alerte, pour que la couleur ne soit jamais seule. */
export const IcoAlerte = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M10 3.2L18 16.4H2L10 3.2z" />
    <path d="M10 8v3.4M10 13.8h.01" strokeWidth={2} />
  </svg>
);

/** Reassort : la planchette a pince qu'on emporte en tournee. */
export const IcoReassort = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M7.5 4H6a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 14 4h-1.5" />
    <rect x="7.5" y="2.5" width="5" height="3" rx="1" />
    <path d="M7.8 9.5h4.4M7.8 12.5h2.8" />
  </svg>
);

/** Publicite : un ecran et un rayon — ce qui s'affiche, pas ce qu'on vend. */
export const IcoPub = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="2.5" y="4" width="15" height="10.5" rx="1.5" />
    <path d="M7.5 17.5h5M10 14.5v3" />
    <path d="M6.5 11.2 8.6 7.4l2.1 3.8M7.2 10h2.9" />
    <path d="M13 7.4v3.8" />
  </svg>
);

export const IcoHorloge = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 5.8V10l2.8 1.8" />
  </svg>
);

export const IcoFleche = ({ size = 14 }: P) => (
  <svg {...base(size)}><path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5" /></svg>
);
