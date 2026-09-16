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

/** Recherche : un cercle et sa queue. */
export const IcoLoupe = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="9" r="5.4" />
    <path d="M13.3 13.3 17 17" />
  </svg>
);

/** Coche : ce qui est deja choisi. */
export const IcoCoche = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M4.5 10.4 8 14l7.5-8" /></svg>
);

/** Tableau de bord : trois colonnes de hauteurs differentes. */
export const IcoTableau = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 16.5v-5M8 16.5V6M12.5 16.5v-8M17 16.5V3.5" />
  </svg>
);

/** Analytiques : une courbe qui monte, sur son axe. */
export const IcoAnalyses = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M3 3.5v13.5h14" />
    <path d="M6 12.5l3.5-3.5 2.5 2.5 5-5" />
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

/** Carte : une epingle posee sur le sol. */
export const IcoCarte = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M10 17.5s-5-4.6-5-8.5a5 5 0 0 1 10 0c0 3.9-5 8.5-5 8.5Z" />
    <circle cx="10" cy="9" r="1.8" />
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

/** Menu : quatre tuiles, le plan de toute la console. */
export const IcoMenu = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="5.8" height="5.8" rx="1.4" />
    <rect x="11.2" y="3" width="5.8" height="5.8" rx="1.4" />
    <rect x="3" y="11.2" width="5.8" height="5.8" rx="1.4" />
    <rect x="11.2" y="11.2" width="5.8" height="5.8" rx="1.4" />
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

/** Assistance : une combine. Le seul objet qui veut dire « appelez ». */
export const IcoSav = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M6.6 3.2 8.3 6.4a1 1 0 0 1-.22 1.2l-1.1 1a10 10 0 0 0 3.9 3.9l1-1.1a1 1 0 0 1 1.2-.22l3.2 1.7a1 1 0 0 1 .5 1.05l-.35 1.9a1.4 1.4 0 0 1-1.5 1.15C8.6 16.5 3.5 11.4 3 5.05A1.4 1.4 0 0 1 4.15 3.55l1.9-.35a1 1 0 0 1 1.05.5z" />
  </svg>
);

/** Messages : une bulle qui parle. */
export const IcoBulle = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M10 3.5c-3.9 0-7 2.6-7 5.8 0 1.6.8 3.1 2.1 4.1L4.3 16.5l3.6-1.6c.7.2 1.4.3 2.1.3 3.9 0 7-2.6 7-5.9s-3.1-5.8-7-5.8z" />
  </svg>
);

/** Communaute : deux personnes, l'une devant l'autre. */
export const IcoCommunaute = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <circle cx="7.5" cy="7" r="2.8" />
    <path d="M2.5 16.5c0-3 2.2-5 5-5s5 2 5 5" />
    <circle cx="14" cy="7.5" r="2.2" />
    <path d="M13.2 11.6c2.5.2 4.3 2.1 4.3 4.9" />
  </svg>
);

/** Notifications : une cloche, et son battant. */
export const IcoCloche = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M10 3a4.6 4.6 0 0 0-4.6 4.6v2.6L4 13.4h12l-1.4-3.2V7.6A4.6 4.6 0 0 0 10 3z" />
    <path d="M8.3 15.6a1.8 1.8 0 0 0 3.4 0" />
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

/**
 * La pente d'un chiffre.
 *
 * Elle accompagne toujours un pourcentage colore : le vert et le rouge ne
 * portent jamais seuls le sens, sans quoi une hausse et une baisse se lisent
 * pareil pour huit pour cent des hommes.
 */
export const IcoPente = ({ size = 11, bas = false }: P & { bas?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
       strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
       style={bas ? { transform: "scaleY(-1)" } : undefined}>
    <path d="M10 16.5v-13M10 3.5 4.5 9M10 3.5 15.5 9" />
  </svg>
);

/* ---------------------------------------------------------------- academie */

/** Academie : le mortier du diplome. */
export const IcoAcademie = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M10 3.5 2.5 7.2 10 11l7.5-3.8L10 3.5Z" />
    <path d="M5.5 8.9v3.8c0 1.2 2 2.3 4.5 2.3s4.5-1.1 4.5-2.3V8.9" />
    <path d="M17.5 7.2v4.6" />
  </svg>
);

/** Cadenas : reserve aux redboxers. */
export const IcoCadenas = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="4.5" y="9" width="11" height="8.5" rx="1.6" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    <path d="M10 12.4v2" />
  </svg>
);

/** Lecture : un triangle dans son cercle. */
export const IcoLecture = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M8.5 7.3v5.4l4.3-2.7-4.3-2.7Z" />
  </svg>
);

/** Document : une page au coin replie. */
export const IcoDocument = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M5.5 2.5h6L15 6v11.5H5.5z" />
    <path d="M11.5 2.5V6H15" />
    <path d="M8 10h4.5M8 13h4.5" />
  </svg>
);

/** Telecharger : la fleche qui tombe dans le bac. */
export const IcoTelecharger = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M10 3v9.5M6 8.8l4 4 4-4" />
    <path d="M3.5 14.5v2h13v-2" />
  </svg>
);

/** Astuce : l'ampoule. */
export const IcoAstuce = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M7.3 14.3c0-1.9-2.3-3-2.3-5.7a5 5 0 0 1 10 0c0 2.7-2.3 3.8-2.3 5.7z" />
    <path d="M8 16.8h4M8.8 18.6h2.4" />
  </svg>
);

/** Certificat : le sceau et ses rubans. */
export const IcoCertificat = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <circle cx="10" cy="8" r="4.8" />
    <path d="M7.2 11.8 6 17.5l4-2 4 2-1.2-5.7" />
    <path d="m8 8 1.4 1.4 2.6-2.8" />
  </svg>
);

/** Contrat : la page et sa signature. */
export const IcoContrat = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M5 2.5h7l3 3v12H5z" />
    <path d="M7.5 7h5M7.5 9.8h5" />
    <path d="M7.5 14.3c.8-1 1.4-1 1.8 0s1 .9 1.6 0 1.1-.6 1.6.2" />
  </svg>
);

/** Pitch : le porte-voix. */
export const IcoPitch = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M3 8.2v3.6h2.5l6.5 3.7V4.5L5.5 8.2H3Z" />
    <path d="M14.5 7.5a3.5 3.5 0 0 1 0 5" />
    <path d="M6.2 12v3.8" />
  </svg>
);

/** Oeil : voir comme un autre. */
export const IcoOeil = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10Z" />
    <circle cx="10" cy="10" r="2.5" />
  </svg>
);

/** Texte : des lignes, la derniere plus courte. */
export const IcoTexte = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M4 5h12M4 8.5h12M4 12h12M4 15.5h7" /></svg>
);

/** Image : un paysage dans son cadre. */
export const IcoImage = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
    <circle cx="7" cy="8.3" r="1.4" />
    <path d="m3 14.5 4.2-4 3 2.8 2.3-2 4.5 4" />
  </svg>
);

/** Fiche technique : la regle graduee. */
export const IcoFiche = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="2.5" y="6" width="15" height="8" rx="1" />
    <path d="M5.5 6v2.5M8.5 6v3.5M11.5 6v2.5M14.5 6v3.5" />
  </svg>
);

/** Script : les guillemets de ce qu'on dit. */
export const IcoScript = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z" />
    <path d="M7 8.3h6M7 10.8h4" />
  </svg>
);

/** Monter, descendre : l'ordre d'une liste. */
export const IcoHaut = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M10 16V4M5.5 8.5 10 4l4.5 4.5" /></svg>
);
export const IcoBas = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M10 4v12M5.5 11.5 10 16l4.5-4.5" /></svg>
);

/** Corbeille. */
export const IcoCorbeille = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 5.5h13M8 5.5v-2h4v2M5.5 5.5l.8 11h7.4l.8-11" />
  </svg>
);

/** Chevron vers la gauche : revenir d'un cran. */
export const IcoPrecedent = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M12.5 4l-6 6 6 6" /></svg>
);

/** Le sommaire d'une formation : une liste a puces. */
export const IcoSommaire = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M7.5 5h9M7.5 10h9M7.5 15h9" />
    <circle cx="3.8" cy="5" r=".9" /><circle cx="3.8" cy="10" r=".9" /><circle cx="3.8" cy="15" r=".9" />
  </svg>
);

/** Plein ecran : quatre coins. */
export const IcoPleinEcran = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" />
  </svg>
);

/** Recentrer : une mire. */
export const IcoCible = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="10" cy="10" r="5.5" /><circle cx="10" cy="10" r="1.6" />
    <path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18" />
  </svg>
);

/** Les calques d'une carte : plan ou satellite. */
export const IcoCalques = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="m10 3 7 3.8-7 3.8-7-3.8L10 3Z" />
    <path d="m3 10.2 7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" />
  </svg>
);

/** Imprimer. */
export const IcoImprimer = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M5.5 7.5v-4h9v4M5.5 14h-2v-6.5h13V14h-2" />
    <rect x="5.5" y="11.5" width="9" height="5" rx=".5" />
  </svg>
);

/** Une epingle : l'adresse d'une machine. */
export const IcoEpingle = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M10 17.5s5.5-5.1 5.5-9.5a5.5 5.5 0 1 0-11 0c0 4.4 5.5 9.5 5.5 9.5Z" />
    <circle cx="10" cy="8" r="2" />
  </svg>
);

/** La vue en liste d'un tableau. */
export const IcoListe = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3.5" width="14" height="13" rx="2" />
    <path d="M3 8h14M3 12.3h14" />
  </svg>
);

/** La vue en colonnes : le kanban. */
export const IcoColonnes = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="2.5" y="3.5" width="4" height="13" rx="1" />
    <rect x="8" y="3.5" width="4" height="9" rx="1" />
    <rect x="13.5" y="3.5" width="4" height="11" rx="1" />
  </svg>
);

/** Un trophee : la formation terminee. */
export const IcoTrophee = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M6 3.5h8v4.2a4 4 0 0 1-8 0V3.5Z" />
    <path d="M6 5H3.5v1.2A2.8 2.8 0 0 0 6.3 9M14 5h2.5v1.2A2.8 2.8 0 0 1 13.7 9M10 11.7v2.8M6.8 17h6.4M7.8 17l.6-2.5h3.2l.6 2.5" />
  </svg>
);
