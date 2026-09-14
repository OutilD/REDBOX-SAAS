import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * LA PIECE, EN VRAIE 3D.
 *
 * Une piece frappee : une tranche striee, un listel en relief qui cercle chaque
 * face, un champ legerement creuse. Le metal est physique (PBR) — il reflete un
 * studio photo (`RoomEnvironment`) et une lumiere clef — si bien que le relief
 * se lit par la lumiere qui glisse dessus quand la piece tourne, comme une
 * recompense d'Apple Watch.
 *
 * L'AVERS porte l'objet du badge EN RELIEF ET EN COULEUR. Le relief est
 * calcule depuis l'image de l'objet : sa silhouette floutee donne le bombe, sa
 * luminance les details ; la carte de normales qui en sort fait tomber la
 * lumiere dessus. Les couleurs de l'objet teintent le metal, comme un
 * anodisage. Autour, un guilloche — cercles et rayons fins — accroche les
 * reflets.
 *
 * LE REVERS EST GRAVE : la distinction en arc, le nom au centre, la date, les
 * points, en Cinzel — une capitale d'inscription romaine, celle des medailles.
 * Les lettres sont des sillons : plus sombres, plus mates, en creux.
 *
 * Tout est calcule en tableaux de flottants plutot qu'avec `ctx.filter` :
 * Safari ne sait flouter un canvas que depuis peu, et un iPhone doit voir la
 * meme piece qu'un Mac.
 */

export type RangPiece = "commun" | "rare" | "epique" | "legendaire" | "mythique";

export type OptionsPiece = {
  /** L'objet du badge, `/badges/<forme>.png`. */
  image: string;
  rang: RangPiece;
  obtenu: boolean;
  nom: string;
  /** La distinction gravee en arc : « Légendaire ». */
  distinction: string;
  /** Deja mise en forme : « 14 septembre 2026 ». */
  date: string | null;
  points: number;
};

type Metal = { couleur: string; rugosite: number; vernis: number; irise: number };

/** Le metal de chaque palier, et le graphite de ce qu'on n'a pas encore. */
const METAUX: Record<RangPiece | "eteint", Metal> = {
  commun:     { couleur: "#d5dae2", rugosite: 0.3,  vernis: 0.3, irise: 0 },
  rare:       { couleur: "#4f8bff", rugosite: 0.24, vernis: 0.6, irise: 0 },
  epique:     { couleur: "#a36eff", rugosite: 0.24, vernis: 0.6, irise: 0 },
  legendaire: { couleur: "#f6c65a", rugosite: 0.18, vernis: 0.5, irise: 0 },
  mythique:   { couleur: "#e8323b", rugosite: 0.16, vernis: 0.8, irise: 1 },
  eteint:     { couleur: "#5b5c64", rugosite: 0.5,  vernis: 0.1, irise: 0 },
};

const R = 1;
const EPAISSEUR = 0.15;
const R_CHAMP = 0.82;
const Z_CHAMP = EPAISSEUR / 2 - 0.006;

// ------------------------------------------------------------------ outils

const POLICE = "Cinzel RedBox";
let police: Promise<void> | null = null;

function chargerPolice(): Promise<void> {
  if (!police) {
    police = (async () => {
      try {
        const f = new FontFace(POLICE, "url(/fonts/cinzel.woff2)", { weight: "400 900" });
        await f.load();
        document.fonts.add(f);
      } catch {
        // Sans elle, on grave avec la serif du systeme : la piece reste lisible.
      }
    })();
  }
  return police;
}

const images = new Map<string, Promise<HTMLImageElement>>();
function chargerImage(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((ok, ko) => {
      const i = new Image();
      i.decoding = "async";
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = src;
    });
    images.set(src, p);
  }
  return p;
}

function toile(n: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  return c;
}

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Un flou gaussien approche : trois passes de boite, horizontale puis verticale. */
function flou(src: Float32Array, n: number, rayon: number): Float32Array {
  const r = Math.max(1, Math.round(rayon));
  const a = src.slice();
  const b = new Float32Array(src.length);
  const norme = 1 / (2 * r + 1);
  const passe = (e: Float32Array, s: Float32Array, horizontal: boolean) => {
    for (let l = 0; l < n; l++) {
      const lire = horizontal ? (i: number) => e[l * n + i] : (i: number) => e[i * n + l];
      let somme = 0;
      for (let k = -r; k <= r; k++) somme += lire(Math.min(n - 1, Math.max(0, k)));
      for (let i = 0; i < n; i++) {
        s[horizontal ? l * n + i : i * n + l] = somme * norme;
        somme += lire(Math.min(n - 1, i + r + 1)) - lire(Math.max(0, i - r));
      }
    }
  };
  for (let p = 0; p < 3; p++) { passe(a, b, true); passe(b, a, false); }
  return a;
}

/** La carte de normales d'un champ de hauteurs, convention OpenGL (+Y en haut). */
function normales(h: Float32Array, n: number, force: number): HTMLCanvasElement {
  const c = toile(n);
  const x = c.getContext("2d")!;
  const img = x.createImageData(n, n);
  const d = img.data;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gauche = h[j * n + Math.max(0, i - 1)];
      const droite = h[j * n + Math.min(n - 1, i + 1)];
      const dessus = h[Math.max(0, j - 1) * n + i];
      const dessous = h[Math.min(n - 1, j + 1) * n + i];
      const nx = (gauche - droite) * force;
      const ny = (dessous - dessus) * force;
      const l = Math.hypot(nx, ny, 1);
      const k = (j * n + i) * 4;
      d[k] = (nx / l * 0.5 + 0.5) * 255;
      d[k + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[k + 2] = (1 / l * 0.5 + 0.5) * 255;
      d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** Le guilloche : cercles concentriques et rayons fins, en hauteur. */
function guilloche(i: number, j: number, n: number, rayons = true): number {
  const dx = i - n / 2, dy = j - n / 2;
  const d = Math.hypot(dx, dy) / n;
  const cercles = 0.5 + 0.5 * Math.cos(d * 150);
  const soleil = rayons ? 0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 48) : 0.5;
  return 0.006 * cercles + 0.002 * soleil;
}

// ------------------------------------------------------------------ l'avers

function avers(img: HTMLImageElement, o: OptionsPiece, n: number) {
  const metal = METAUX[o.obtenu ? o.rang : "eteint"];
  const [mr, mg, mb] = rgb(metal.couleur);

  // L'objet, centre, a 72 % du champ.
  const c = toile(n);
  const x = c.getContext("2d", { willReadFrequently: true })!;
  const cote = n * 0.72, off = (n - cote) / 2;
  x.drawImage(img, off, off, cote, cote);
  const px = x.getImageData(0, 0, n, n).data;

  const A = new Float32Array(n * n), L = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    A[i] = px[i * 4 + 3] / 255;
    L[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
  }
  const bombe = flou(A, n, n * 0.03);
  const bord = flou(A, n, n * 0.006);
  const ombre = flou(A, n, n * 0.05);

  const H = new Float32Array(n * n);
  const albedo = x.createImageData(n, n), rug = x.createImageData(n, n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, a = A[k];
      H[k] = guilloche(i, j, n) * (1 - a) + 0.62 * bombe[k] + 0.1 * bord[k] + 0.1 * L[k] * a;

      const t = o.obtenu ? a * 0.86 : 0;
      const p = k * 4;
      // Un creux d'ombre au pied du relief, et le relief un peu plus clair en haut.
      const ao = 1 - 0.32 * Math.max(0, ombre[k] - a);
      const eclat = 0.88 + 0.12 * bombe[k];
      let r = (mr * (1 - t) + px[p] * t) * ao * eclat;
      let g = (mg * (1 - t) + px[p + 1] * t) * ao * eclat;
      let b = (mb * (1 - t) + px[p + 2] * t) * ao * eclat;
      if (!o.obtenu) { const gris = (r * 0.3 + g * 0.59 + b * 0.11) * 0.9; r = g = b = gris; }
      albedo.data[p] = r; albedo.data[p + 1] = g; albedo.data[p + 2] = b; albedo.data[p + 3] = 255;

      // Le champ satine, le relief poli : c'est le contraste qui fait premium.
      const rough = 0.36 * (1 - a) + 0.16 * a;
      rug.data[p] = rug.data[p + 1] = rug.data[p + 2] = Math.min(255, rough * 255); rug.data[p + 3] = 255;
    }
  }
  return { albedo: versToile(albedo, n), rugosite: versToile(rug, n), normales: normales(H, n, n * 0.034) };
}

// ------------------------------------------------------------------ le revers

function texteEnArc(x: CanvasRenderingContext2D, texte: string, cx: number, cy: number,
                    rayon: number, taille: number, espace: number, enHaut: boolean) {
  x.font = `700 ${taille}px "${POLICE}", "Times New Roman", serif`;
  const lettres = [...texte];
  const largeurs = lettres.map((l) => x.measureText(l).width + espace);
  const total = largeurs.reduce((s, w) => s + w, 0) - espace;
  let angle = enHaut ? -Math.PI / 2 - total / rayon / 2 : Math.PI / 2 + total / rayon / 2;
  x.textAlign = "center";
  x.textBaseline = "middle";
  lettres.forEach((l, i) => {
    const pas = largeurs[i] / rayon;
    const a = enHaut ? angle + (largeurs[i] - espace) / rayon / 2 : angle - (largeurs[i] - espace) / rayon / 2;
    x.save();
    x.translate(cx + Math.cos(a) * rayon, cy + Math.sin(a) * rayon);
    x.rotate(enHaut ? a + Math.PI / 2 : a - Math.PI / 2);
    x.fillText(l, 0, 0);
    x.restore();
    angle += enHaut ? pas : -pas;
  });
}

function losange(x: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  x.beginPath();
  x.moveTo(cx, cy - t); x.lineTo(cx + t, cy); x.lineTo(cx, cy + t); x.lineTo(cx - t, cy);
  x.closePath(); x.fill();
}

function revers(o: OptionsPiece, n: number) {
  const metal = METAUX[o.obtenu ? o.rang : "eteint"];
  const [mr, mg, mb] = rgb(metal.couleur);
  const c = toile(n);
  const x = c.getContext("2d", { willReadFrequently: true })!;
  const m = n / 2;
  x.fillStyle = "#000"; x.fillRect(0, 0, n, n);
  x.fillStyle = "#fff"; x.strokeStyle = "#fff";

  // Deux filets : l'un sous le listel, l'autre qui borne l'inscription.
  x.lineWidth = n * 0.004;
  x.beginPath(); x.arc(m, m, n * 0.47, 0, Math.PI * 2); x.stroke();
  x.lineWidth = n * 0.003;
  x.beginPath(); x.arc(m, m, n * 0.325, 0, Math.PI * 2); x.stroke();

  texteEnArc(x, o.distinction.toUpperCase(), m, m, n * 0.395, n * 0.068, n * 0.016, true);
  texteEnArc(x, o.points > 0 ? `REDBOX · ${o.points} POINTS` : "REDBOX · L’ÉQUIPE", m, m, n * 0.4, n * 0.05, n * 0.013, false);
  losange(x, m - n * 0.4, m, n * 0.012);
  losange(x, m + n * 0.4, m, n * 0.012);

  // Le nom : il tient dans le cercle interieur, quitte a passer sur deux lignes.
  const nom = o.nom.toUpperCase();
  const largeurMax = n * 0.54;
  let taille = n * 0.1;
  x.textAlign = "center"; x.textBaseline = "middle";
  const mesure = (t: string, s: number) => { x.font = `700 ${s}px "${POLICE}", "Times New Roman", serif`; return x.measureText(t).width; };
  let lignes = [nom];
  while (mesure(nom, taille) > largeurMax && taille > n * 0.066) taille -= n * 0.002;
  if (mesure(nom, taille) > largeurMax && nom.includes(" ")) {
    const mots = nom.split(" ");
    let mieux = 1, ecart = Infinity;
    for (let i = 1; i < mots.length; i++) {
      const d = Math.abs(mesure(mots.slice(0, i).join(" "), taille) - mesure(mots.slice(i).join(" "), taille));
      if (d < ecart) { ecart = d; mieux = i; }
    }
    lignes = [mots.slice(0, mieux).join(" "), mots.slice(mieux).join(" ")];
    taille = n * 0.082;
    while (Math.max(...lignes.map((l) => mesure(l, taille))) > largeurMax && taille > n * 0.056) taille -= n * 0.002;
  }
  x.font = `700 ${taille}px "${POLICE}", "Times New Roman", serif`;
  const hautNom = m - n * 0.035 - (lignes.length - 1) * taille * 0.55;
  lignes.forEach((l, i) => x.fillText(l, m, hautNom + i * taille * 1.1));

  // Le filet a losange, puis la date.
  const yFilet = hautNom + (lignes.length - 1) * taille * 1.1 + taille * 0.85;
  x.lineWidth = n * 0.003;
  x.beginPath(); x.moveTo(m - n * 0.15, yFilet); x.lineTo(m - n * 0.025, yFilet); x.stroke();
  x.beginPath(); x.moveTo(m + n * 0.025, yFilet); x.lineTo(m + n * 0.15, yFilet); x.stroke();
  losange(x, m, yFilet, n * 0.011);
  // La date tient dans le cercle interieur : elle retrecit plutot que de deborder.
  const date = o.date ? o.date.toUpperCase() : "À CONQUÉRIR";
  let tDate = n * 0.048;
  while (mesure(date, tDate) > n * 0.44 && tDate > n * 0.03) tDate -= n * 0.001;
  x.font = `600 ${tDate}px "${POLICE}", "Times New Roman", serif`;
  x.fillText(date, m, yFilet + n * 0.07);

  const px = x.getImageData(0, 0, n, n).data;
  const T = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) T[i] = px[i * 4] / 255;
  const sillon = flou(T, n, n * 0.0016);

  const H = new Float32Array(n * n);
  const albedo = x.createImageData(n, n), rug = x.createImageData(n, n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, t = sillon[k], p = k * 4;
      H[k] = -0.6 * t;
      const f = 1 - 0.62 * t;
      let r = mr * f, g = mg * f, b = mb * f;
      if (!o.obtenu) { const gris = (r * 0.3 + g * 0.59 + b * 0.11) * 0.9; r = g = b = gris; }
      albedo.data[p] = r; albedo.data[p + 1] = g; albedo.data[p + 2] = b; albedo.data[p + 3] = 255;
      const rough = 0.2 + 0.5 * t;
      rug.data[p] = rug.data[p + 1] = rug.data[p + 2] = rough * 255; rug.data[p + 3] = 255;
    }
  }
  return { albedo: versToile(albedo, n), rugosite: versToile(rug, n), normales: normales(H, n, n * 0.075) };
}

function versToile(img: ImageData, n: number): HTMLCanvasElement {
  const c = toile(n);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ le volume

function texture(c: HTMLCanvasElement, couleur: boolean, anisotropie: number) {
  const t = new THREE.CanvasTexture(c);
  if (couleur) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie;
  t.needsUpdate = true;
  return t;
}

/** La tranche : un cylindre ouvert, strie de deux cents cannelures. */
function tranche(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(R, R, EPAISSEUR - 0.02, 720, 1, true);
  geo.rotateX(Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i);
    const k = 1 - 0.008 * (0.5 + 0.5 * Math.cos(Math.atan2(vy, vx) * 200));
    pos.setXY(i, vx * k, vy * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Le listel : l'anneau en relief entre le champ et la tranche. */
function listel(sens: 1 | -1): THREE.BufferGeometry {
  const h = EPAISSEUR / 2;
  const profil = [
    [R_CHAMP - 0.004, Z_CHAMP], [R_CHAMP + 0.02, Z_CHAMP + 0.028], [0.955, Z_CHAMP + 0.034],
    [0.99, h + 0.004], [R, h - 0.01],
  ].map(([r, z]) => new THREE.Vector2(r, z * sens));
  const geo = new THREE.LatheGeometry(profil, 256);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function materiauMetal(metal: Metal, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: extra.map ? 0xffffff : metal.couleur,
    metalness: 1, roughness: metal.rugosite,
    clearcoat: metal.vernis, clearcoatRoughness: 0.18,
    iridescence: metal.irise, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 640],
    envMapIntensity: 1.15,
    ...extra,
  });
}

export async function fabriquerPiece(o: OptionsPiece, n: number, anisotropie = 8): Promise<THREE.Group> {
  const [img] = await Promise.all([chargerImage(o.image), chargerPolice()]);
  const metal = METAUX[o.obtenu ? o.rang : "eteint"];
  const face = avers(img, o, n);
  const dos = revers(o, n);

  const groupe = new THREE.Group();
  const bord = materiauMetal(metal, { side: THREE.DoubleSide });
  groupe.add(new THREE.Mesh(tranche(), materiauMetal(metal, { roughness: metal.rugosite + 0.08 })));
  groupe.add(new THREE.Mesh(listel(1), bord));
  groupe.add(new THREE.Mesh(listel(-1), bord));

  const champ = (t: typeof face, arriere: boolean) => {
    const geo = new THREE.CircleGeometry(R_CHAMP, 192);
    if (arriere) geo.rotateY(Math.PI);
    geo.translate(0, 0, arriere ? -Z_CHAMP : Z_CHAMP);
    return new THREE.Mesh(geo, materiauMetal(metal, {
      map: texture(t.albedo, true, anisotropie),
      normalMap: texture(t.normales, false, anisotropie),
      roughnessMap: texture(t.rugosite, false, anisotropie),
      roughness: 1,
      // L'irisation reste au listel et a la tranche : sur le champ, melee aux
      // couleurs de l'objet, elle les verdissait.
      iridescence: 0,
      normalScale: new THREE.Vector2(1, 1),
    }));
  };
  groupe.add(champ(face, false));
  groupe.add(champ(dos, true));
  return groupe;
}

export function liberer(objet: THREE.Object3D) {
  objet.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const p = mat as THREE.MeshPhysicalMaterial;
      p.map?.dispose(); p.normalMap?.dispose(); p.roughnessMap?.dispose();
      mat.dispose();
    }
  });
}

/**
 * LE PLATEAU : un rendu, un studio, une camera, et un pivot ou poser la piece.
 * La meme scene sert la piece vivante et la fabrique d'apercus.
 */
export class ScenePiece {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  readonly pivot = new THREE.Group();
  private studio: THREE.Texture;
  private piece: THREE.Group | null = null;

  constructor(canvas: HTMLCanvasElement, garderImage = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: garderImage });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.studio;

    this.camera.position.set(0, 0, 5.2);
    const cle = new THREE.DirectionalLight(0xffffff, 2.4);
    cle.position.set(-2.5, 3, 4);
    const contre = new THREE.DirectionalLight(0xffffff, 1.1);
    contre.position.set(3, -1.5, -3);
    this.scene.add(cle, contre, this.pivot);
  }

  get anisotropie() { return this.renderer.capabilities.getMaxAnisotropy(); }

  async poser(o: OptionsPiece, qualite: number) {
    const g = await fabriquerPiece(o, qualite, Math.min(8, this.anisotropie));
    if (this.piece) { this.pivot.remove(this.piece); liberer(this.piece); }
    this.piece = g;
    this.pivot.add(g);
  }

  dimensionner(largeur: number, hauteur: number, dpr: number) {
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(largeur, hauteur, false);
    this.camera.aspect = largeur / Math.max(1, hauteur);
    this.camera.updateProjectionMatrix();
  }

  orienter(x: number, y: number) { this.pivot.rotation.set(x, y, 0); }

  rendre() { this.renderer.render(this.scene, this.camera); }

  detruire() {
    if (this.piece) liberer(this.piece);
    this.studio.dispose();
    this.renderer.dispose();
    // Rendre le contexte tout de suite : le navigateur n'en tolere qu'une quinzaine.
    this.renderer.forceContextLoss();
  }
}
