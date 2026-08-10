/* ------------------------------------------------------------------ *
 *  LA SCENE DES CIRCUITS
 *  Le seul endroit du projet qui depende de three.js, et le seul qui
 *  soit charge a la demande : `import()` depuis la vue, donc Vite en
 *  fait un morceau separe. Qui ne va jamais dans cet onglet ne
 *  telecharge pas 143 Ko de moteur 3D pour lire le carnet.
 *
 *  Ce module ne connait rien a React : on lui donne un conteneur et des
 *  trajectoires deja calculees, il rend une poignee pour piloter la
 *  scene. C'est ce qui permet de le charger apres coup sans que le reste
 *  de l'application en sache quoi que ce soit.
 * ------------------------------------------------------------------ */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, Vector3, Shape,
  Mesh, Group, Line, Sprite, SpriteMaterial, CanvasTexture,
  BufferGeometry, Float32BufferAttribute, CircleGeometry, ShapeGeometry,
  CylinderGeometry, PlaneGeometry, SphereGeometry, TubeGeometry, CatmullRomCurve3,
  MeshLambertMaterial, MeshBasicMaterial, LineBasicMaterial,
  HemisphereLight, DirectionalLight, DoubleSide, Clock,
} from "three";

import { HAUTEUR_MUR, murDuParc } from "./donnees/balistique.js";
import { TRACES } from "./donnees/stades-traces.js";

/* ------------------------------------------------------------------ *
 *  LE MUR DU PARC
 *  Deux qualites, et l'ecran dit toujours laquelle il montre :
 *   - « trace » : le contour reel, releve sur les SVG de Baseball
 *     Savant. La forme vient de la, la TAILLE est calee sur les trois
 *     distances publiees — moindres carres sur les rayons a −45, 0 et
 *     +45 degres. Un parc dont on a repeint les clotures depuis 2018 se
 *     recale donc tout seul, sans qu'on touche au jeu de donnees.
 *   - « interpole » : la parabole a travers ces trois nombres, pour les
 *     deux parcs que le releve de 2018 ne couvre pas.
 * ------------------------------------------------------------------ */
const paires = (plat) => {
  const out = [];
  for (let i = 0; i < plat.length; i += 2) out.push([plat[i], plat[i + 1]]);
  return out;
};

/* Faute de trace, une empreinte plausible : l'arc interpole du champ,
   prolonge le long des lignes de faute et ferme par un fond de marbre.
   Elle ne sert qu'a poser les tribunes — le mur, lui, reste l'arc. */
function contourDeSecours(arc) {
  const R = 70;                       // rayon du fond derriere le marbre, pieds
  const pt = (aDeg, r) => {
    const a = (aDeg * Math.PI) / 180;
    return [r * Math.sin(a), r * Math.cos(a)];
  };
  const fond = [];
  for (let a = 135; a <= 225; a += 15) fond.push(pt(a, R));
  return [...arc, ...fond];
}

function construireMur(idStade, stade) {
  const t = TRACES[idStade];
  if (t && stade) {
    const boucle = paires(t.b);
    const mur = boucle.slice(0, t.k + 1);
    const rayonA = (pts, aDeg) => {
      const a = (aDeg * Math.PI) / 180;
      let best = Infinity, r = 0;
      for (const [x, y] of pts) {
        const d = Math.abs(Math.atan2(x, y) - a);
        if (d < best) { best = d; r = Math.hypot(x, y); }
      }
      return r;
    };
    const rs = [rayonA(mur, -45), rayonA(mur, 0), rayonA(mur, 45)];
    const pub = [Number(stade.gauche), Number(stade.centre), Number(stade.droite)];
    if (rs.every((x) => x > 1) && pub.every((x) => Number.isFinite(x) && x > 100)) {
      // Echelle par moindres carres : une seule inconnue, trois mesures.
      const k = rs.reduce((s, r, i) => s + r * pub[i], 0) / rs.reduce((s, r) => s + r * r, 0);
      const cadrer = (pts) => pts.map(([x, y]) => [x * k, y * k]);
      return {
        qualite: "trace",
        nom: t.n,
        mur: cadrer(mur),
        contour: cadrer(boucle),
        piste: t.p.length ? cadrer(paires(t.p)) : null,
      };
    }
  }
  const repli = stade ? murDuParc(stade) : null;
  return repli
    ? { qualite: "interpole", mur: repli, contour: contourDeSecours(repli), piste: null }
    : { qualite: "aucun", mur: null, contour: null, piste: null };
}

/* ------------------------------------------------------------------ *
 *  LES TRIBUNES
 *  Elles ne sont RELEVEES NULLE PART. Aucun jeu de donnees public ne
 *  donne le volume bati des trente parcs — GeomMLBStadiums s'arrete au
 *  niveau du terrain. Ce qu'on a de reel, c'est l'EMPREINTE (la boucle
 *  du releve) et la CAPACITE annoncee par la ligue. Le bol se deduit des
 *  deux : a six pieds carres par siege, circulations comprises, une
 *  capacite et un perimetre donnent une profondeur de gradins. La pente
 *  vient ensuite — un peu plus d'un demi-pied de haut par pied de fond,
 *  la rake habituelle.
 *
 *  Donc : l'empreinte est mesuree, le volume est DEDUIT. Un parc de
 *  quarante-cinq mille places aura le bol d'un parc de quarante-cinq
 *  mille places, pas celui de son architecte. L'ecran le dit.
 * ------------------------------------------------------------------ */
const AIRE_PAR_SIEGE = 6;     // pieds carres par siege, circulations comprises
const PENTE = 0.55;           // hauteur gagnee par pied de profondeur
const BASE_TRIBUNE = HAUTEUR_MUR;

/* L'empreinte, revue en etoile autour du centre du parc : un rayon par
   pas d'angle, garde au plus loin quand il coupe le contour plusieurs
   fois. Ce n'est pas de la coquetterie — decaler le contour BRUT le long
   de ses normales le repliait sur lui-meme aux angles rentrants, et le
   pli montait au-dessus du bol en escalier, bien visible a Fenway et a
   Wrigley. Vu du centre, un decalage radial ne peut plus se replier.
   Le mur, lui, garde le trace exact : c'est le bol qu'on redresse. */
function empreinteEnEtoile(pts, pas = 64) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const sortie = [];
  for (let k = 0; k < pas; k++) {
    const a = (2 * Math.PI * k) / pas;
    const dx = Math.cos(a), dy = Math.sin(a);
    let rMax = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const det = dx * (-ey) - dy * (-ex);
      if (Math.abs(det) < 1e-9) continue;
      const ox = p[0] - cx, oy = p[1] - cy;
      const r = (ox * -ey - oy * -ex) / det;      // le long du rayon
      const u = (dx * oy - dy * ox) / det;        // le long de l'arete
      if (r > rMax && u >= 0 && u <= 1) rMax = r;
    }
    if (rMax > 0) sortie.push({ p: [cx + dx * rMax, cy + dy * rMax], n: [dx, dy] });
  }
  return { points: sortie.map((s) => s.p), normales: sortie.map((s) => s.n), centre: [cx, cy] };
}

const maille = (pos, idx, couleur) => {
  const g = new BufferGeometry();
  g.setAttribute("position", pos);
  g.setIndex(idx);
  g.computeVertexNormals();
  return new Mesh(g, new MeshLambertMaterial({ color: couleur, side: DoubleSide }));
};

/* Combien de quartiers on decoupe le bol. Assez pour que la coupe suive la
   camera de pres, pas au point de multiplier les appels de rendu. */
const SECTEURS = 16;
// On ouvre le bol sur un peu plus d'un quart de tour, du cote de la camera.
const COS_COUPE = Math.cos((56 * Math.PI) / 180);

export function tribunes(empreinte, { places, toit }) {
  if (empreinte.length < 8) return null;
  const etoile = empreinteEnEtoile(empreinte);
  const contour = etoile.points, nor = etoile.normales;
  const [cx, cy] = etoile.centre;
  const n = contour.length;
  if (n < 8) return null;

  let perimetre = 0;
  for (let i = 0; i < n; i++) {
    const a = contour[i], b = contour[(i + 1) % n];
    perimetre += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  const brut = Number(places) > 0 ? (Number(places) * AIRE_PAR_SIEGE) / perimetre : 150;
  const profondeur = Math.max(45, Math.min(255, brut));
  const hauteur = profondeur * PENTE;
  // Des gradins d'une dizaine de pieds : au-dela ils se lisent comme des
  // marches d'escalier, en deca la geometrie triple pour rien.
  const rangs = Math.max(4, Math.min(16, Math.round(hauteur / 10)));

  /* Le profil en coupe, en fractions : on monte d'un cran (contremarche)
     puis on recule d'un cran (giron), et ainsi de suite. */
  const profil = [];
  for (let j = 0; j < rangs; j++) {
    profil.push([j / rangs, j / rangs]);
    profil.push([j / rangs, (j + 1) / rangs]);
  }
  profil.push([1, 1]);

  const dehors = contour.map(([x, y], i) => [x + nor[i][0] * profondeur, y + nor[i][1] * profondeur]);

  /* Un seul tableau de sommets pour tout le bol : les rangees du profil,
     puis une derniere rangee au SOL sous le bord exterieur, qui donne son
     pied a la facade. Les quartiers se partagent ce tableau et ne different
     que par leurs triangles — c'est ce qui rend la decoupe gratuite. */
  const brutPos = [];
  for (const [u, v] of profil) {
    for (let i = 0; i < n; i++) {
      const [x, y] = contour[i], [nx, ny] = nor[i];
      brutPos.push(x + nx * u * profondeur, BASE_TRIBUNE + v * hauteur, -(y + ny * u * profondeur));
    }
  }
  const rangSol = profil.length;
  for (const [x, y] of dehors) brutPos.push(x, 0, -y);
  const pos = new Float32BufferAttribute(brutPos, 3);

  // Les sommets de la couronne, quand il y a un toit : deux par arete.
  const hToit = BASE_TRIBUNE + hauteur + 16;
  const couvert = toit === "Dome" || toit === "Retractable";
  let posToit = null;
  if (couvert) {
    const brutT = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = contour[i], [nx, ny] = nor[i];
      const dx = x + nx * profondeur * 0.55, dy = y + ny * profondeur * 0.55;
      brutT.push(dx, hToit, -dy, dehors[i][0], hToit + 6, -dehors[i][1]);
    }
    posToit = new Float32BufferAttribute(brutT, 3);
  }

  const groupe = new Group();
  const quartiers = [];
  for (let s = 0; s < SECTEURS; s++) {
    const i0 = Math.floor((s * n) / SECTEURS), i1 = Math.floor(((s + 1) * n) / SECTEURS);
    if (i1 <= i0) continue;
    /* Deux mailles sur les memes sommets : les contremarches d'un cote, les
       girons de l'autre. Une seule suffirait a la forme, mais les rangs ne
       se detacheraient qu'a la faveur de l'eclairage — ici ils se detachent
       toujours, et le bol se lit comme des gradins et non comme une rampe. */
    const contremarches = [], girons = [], facade = [], couronne = [];
    for (let r = 0; r < profil.length - 1; r++) {
      const cible = profil[r][0] === profil[r + 1][0] ? contremarches : girons;
      for (let i = i0; i < i1; i++) {
        const a = r * n + i, b = r * n + ((i + 1) % n);
        cible.push(a, a + n, b, b, a + n, b + n);
      }
    }
    // La facade : du sol jusqu'au haut du bol. C'est elle qui fait que le
    // parc a un dehors, et pas seulement un dedans.
    for (let i = i0; i < i1; i++) {
      const haut = (profil.length - 1) * n, j = (i + 1) % n;
      facade.push(rangSol * n + i, haut + i, rangSol * n + j, rangSol * n + j, haut + i, haut + j);
      if (couvert) {
        const a = 2 * i, b = 2 * j;
        couronne.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }

    const q = new Group();
    q.add(maille(pos, contremarches, SIEGES));
    q.add(maille(pos, girons, BETON));
    q.add(maille(pos, facade, BETON_SOMBRE));
    if (couvert) {
      const t = maille(posToit, couronne, BETON_SOMBRE);
      t.name = "toit";
      q.add(t);
    }
    // Le lisere du haut : la ligne de toiture, qui donne l'echelle du bol.
    const rebord = [];
    for (let i = i0; i <= i1; i++) rebord.push(V(...dehors[i % n], BASE_TRIBUNE + hauteur + 0.6));
    q.add(new Line(new BufferGeometry().setFromPoints(rebord), new LineBasicMaterial({ color: 0x6f8f7c })));

    /* La direction du quartier, vue du CENTRE DU PARC et non du marbre :
       le marbre est au bord de l'empreinte, un azimut mesure de la ne
       designerait pas le meme quartier que celui ou se trouve la camera. */
    let dx = 0, dy = 0;
    for (let i = i0; i < i1; i++) { dx += dehors[i][0] - cx; dy += dehors[i][1] - cy; }
    const l = Math.hypot(dx, dy) || 1;
    quartiers.push({ groupe: q, dx: dx / l, dz: -dy / l });
    groupe.add(q);
  }

  /* Les pylones d'eclairage, sur le pourtour du champ exterieur. Ils ne
     sont pas au bon endroit parc par parc — mais un stade de nuit sans
     eclairage ne ressemble a rien, et leur hauteur donne l'echelle. Chacun
     part avec son quartier : sinon un mat reste plante devant la coupe.
     Sous un toit, aucun : un stade couvert s'eclaire par sa charpente. */
  for (let j = 0; !couvert && j < 6; j++) {
    const i = Math.min(n - 1, Math.round(((j + 0.5) / 6) * (n / 2)));
    const [x, y] = dehors[i];
    const mat = new Mesh(new CylinderGeometry(1.6, 2.6, 62, 6), new MeshLambertMaterial({ color: BETON_SOMBRE }));
    mat.position.set(x, BASE_TRIBUNE + hauteur + 31, -y);
    const lampes = new Mesh(new PlaneGeometry(34, 12), new MeshBasicMaterial({ color: 0xfff0c4, side: DoubleSide }));
    lampes.position.set(x, BASE_TRIBUNE + hauteur + 62, -y);
    lampes.lookAt(0, BASE_TRIBUNE, 0);
    const q = quartiers[Math.min(quartiers.length - 1, Math.floor((i * SECTEURS) / n))];
    q.groupe.add(mat, lampes);
  }

  return {
    groupe,
    profondeur,
    hauteur,
    rayon: Math.max(...dehors.map(([x, y]) => Math.hypot(x, y))),
    /* LA COUPE. Un bol ferme est fidele et illisible : depuis le marbre, on
       regarde le dos des tribunes et le terrain a disparu. On efface donc
       les quartiers situes DU COTE DE LA CAMERA, comme une maquette qu'on
       ouvrirait pour montrer l'interieur — et la balle reste visible de
       bout en bout, quel que soit l'angle. */
    couper(position) {
      const px = position.x - cx, pz = position.z + cy;
      const l = Math.hypot(px, pz) || 1;
      for (const q of quartiers) {
        q.groupe.visible = (q.dx * px + q.dz * pz) / l < COS_COUPE;
      }
    },
  };
}

/* La palette de l'application, en nombres. Le gazon et la terre battue
   sont ceux du reste du site ; le ciel est le seul ajout, parce qu'un
   fond vert derriere une balle verte ne montre rien. */
const GAZON = 0x2f6b3f, GAZON_CLAIR = 0x3a7d4a, TERRE = 0xb08a5e;
// Le mur est plus sombre que la pelouse : sans cet ecart il disparaissait.
const CRAIE = 0xeff3ea, CIEL = 0x0b241a, MUR = 0x1d4a30;
const OR = 0xf2ce6b;
/* Les tribunes : du beton et des sieges, tenus loin du vert du terrain
   pour qu'on voie tout de suite ou finit le jeu et ou commence le public. */
const BETON = 0x54606a, BETON_SOMBRE = 0x2c353d, SIEGES = 0x39505f;
const DEHORS = 0x101d18;   // le sol au-dela du parc

/* Repere de simulation (x = champ droit, y = champ centre, z = ciel) vers
   celui de three (y en l'air, z vers le spectateur). */
const V = (x, y, z) => new Vector3(x, z, -y);

/* Ruban vertical le long d'une polyligne : le mur. */
function ruban(points, hauteur, couleur) {
  const pos = [], idx = [];
  points.forEach(([x, y], i) => {
    pos.push(x, 0, -y, x, hauteur, -y);
    if (i < points.length - 1) {
      const b = 2 * i;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new Mesh(g, new MeshLambertMaterial({ color: couleur, side: DoubleSide }));
}

/* Une etiquette de distance, peinte sur un canevas puis collee au mur. */
function etiquette(texte, couleur = "#eff3ea") {
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 64;
  const g = cv.getContext("2d");
  g.fillStyle = couleur;
  g.font = "bold 44px ui-monospace, Menlo, monospace";
  g.textAlign = "center";
  g.fillText(texte, 64, 48);
  const sp = new Sprite(new SpriteMaterial({ map: new CanvasTexture(cv), transparent: true }));
  sp.scale.set(26, 13, 1);
  return sp;
}

/* Ruban au sol entre deux polylignes : la piste d'avertissement. Les deux
   traces n'ont pas le meme nombre de points — ils viennent de deux chemins
   SVG distincts — donc on les apparie par l'ANGLE de spray, seule grandeur
   qu'ils partagent. */
function rubanSol(interieur, exterieur, h, couleur) {
  const angleDe = ([x, y]) => Math.atan2(x, y);
  const surLigne = (pts, a) => {
    const P = pts.map((p) => ({ t: angleDe(p), p })).sort((u, v) => u.t - v.t);
    if (a <= P[0].t) return P[0].p;
    for (let i = 0; i < P.length - 1; i++) {
      if (a >= P[i].t && a <= P[i + 1].t) {
        const u = (a - P[i].t) / (P[i + 1].t - P[i].t || 1);
        return [P[i].p[0] + u * (P[i + 1].p[0] - P[i].p[0]), P[i].p[1] + u * (P[i + 1].p[1] - P[i].p[1])];
      }
    }
    return P[P.length - 1].p;
  };
  const pos = [], idx = [];
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (-46 + (92 * i) / N) * (Math.PI / 180);
    const [xi, yi] = surLigne(interieur, a);
    const [xe, ye] = surLigne(exterieur, a);
    pos.push(xi, h, -yi, xe, h, -ye);
    if (i < N) { const b = 2 * i; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new Mesh(g, new MeshLambertMaterial({ color: couleur, side: DoubleSide }));
}

/* ------------------------------------------------------------------ *
 *  MONTAGE
 *  `circuits` : [{ points: [[x,y,z] en pieds], couleur }]
 *  `mur`      : polyligne du parc, en pieds, ou null
 *  Rend une poignee : { choisir, redimensionner, detruire }.
 * ------------------------------------------------------------------ */
export function monterScene(conteneur, { circuits, idStade, stade, animer = true }) {
  const parc = construireMur(idStade, stade);
  const mur = parc.mur;
  const gradins = parc.contour ? tribunes(parc.contour, stade || {}) : null;
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(conteneur.clientWidth, conteneur.clientHeight);
  conteneur.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "pan-y"; // le doigt fait tourner, la page defile encore

  const scene = new Scene();
  scene.background = new Color(CIEL);
  // Le brouillard commence apres la cloture : plus tot, il effacait le mur
  // au moment meme ou la balle le franchit.
  scene.fog = new Fog(CIEL, 1400, 3200);

  const camera = new PerspectiveCamera(45, conteneur.clientWidth / conteneur.clientHeight, 1, 6000);
  /* Le point vise se porte au-dela du monticule quand il y a un parc a
     cadrer : vise sur le marbre, le stade tenait dans la moitie haute de
     l'image et le reste etait du vide. Toute la nuit, il n'y a ni parc ni
     tribunes — seulement la gerbe des trajectoires, qui se cadre de pres. */
  const cible = new Vector3(0, 30, gradins ? -250 : -150);
  /* Vue par defaut : DERRIERE LE MARBRE, la ou personne ne s'assoit mais
     d'ou tout se lit — la balle part vers le fond de l'image, comme on la
     suit des yeux au stade. Un demi-tour (theta = pi) mettrait la camera
     derriere le champ centre, a regarder le terrain a l'envers.
     Sur un ecran etroit on recule, sinon la cloture sort du cadre.

     Les tribunes ne l'ont pas fait reculer : c'est le BOL qui s'ouvre du
     cote de la camera. Reculer jusqu'a passer par-dessus les gradins
     rendait la trajectoire — ce qu'on est venu voir — large d'un pixel. */
  let theta = 0, phi = 1.24;
  const etroit = conteneur.clientWidth < 520;
  let rayon = gradins ? (etroit ? 600 : 540) : (etroit ? 560 : 430);
  const placerCamera = () => {
    phi = Math.max(0.18, Math.min(1.45, phi));
    rayon = Math.max(140, Math.min(2000, rayon));
    camera.position.set(
      cible.x + rayon * Math.sin(phi) * Math.sin(theta),
      cible.y + rayon * Math.cos(phi),
      cible.z + rayon * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(cible);
    gradins?.couper(camera.position);
  };
  placerCamera();

  // La lumiere du bas releve la face interieure du mur, tournee vers le
  // marbre et donc vers la camera : sans elle, le mur sortait en noir.
  scene.add(new HemisphereLight(0xdfe9ef, 0x53806a, 1.15));
  const soleil = new DirectionalLight(0xfff3d6, 0.85);
  soleil.position.set(-300, 500, 200);
  scene.add(soleil);

  // --- le sol autour du parc, la pelouse, l'avant-champ, les lignes ---
  /* Sous les tribunes et au-dela, la ville : un sol sombre. Sans lui, la
     pelouse debordait le stade et le bol semblait pose sur un pre. */
  const dehors = new Mesh(new CircleGeometry(2600, 48), new MeshLambertMaterial({ color: DEHORS }));
  dehors.rotation.x = -Math.PI / 2;
  dehors.position.y = -0.6;
  scene.add(dehors);

  /* La pelouse s'arrete AU CONTOUR DU PARC, pas sur un disque : le gazon
     debordait derriere le marbre, la ou il n'y a que du beton, et le stade
     paraissait pose au milieu d'un pre. */
  let formeGazon = null;
  if (parc.contour) {
    formeGazon = new Shape();
    parc.contour.forEach(([x, y], i) => (i ? formeGazon.lineTo(x, y) : formeGazon.moveTo(x, y)));
    formeGazon.closePath();
  }
  const pelouse = new Mesh(
    formeGazon ? new ShapeGeometry(formeGazon) : new CircleGeometry(600, 64),
    new MeshLambertMaterial({ color: GAZON })
  );
  pelouse.rotation.x = -Math.PI / 2;
  scene.add(pelouse);

  /* L'avant-champ : un eventail de terre battue, pointe au marbre, borde
     par les lignes de faute et ferme par l'arc a 95 pieds du monticule. */
  const MONTICULE = 60.5, ARC = 95;
  const coin = (2 * MONTICULE + Math.sqrt(4 * MONTICULE ** 2 - 8 * (MONTICULE ** 2 - ARC ** 2))) / 4;
  const forme = new Shape();
  forme.moveTo(0, 0);
  forme.lineTo(coin, coin);
  forme.absarc(0, MONTICULE, ARC, Math.atan2(coin - MONTICULE, coin), Math.atan2(coin - MONTICULE, -coin), false);
  forme.closePath();
  const terre = new Mesh(new ShapeGeometry(forme, 32), new MeshLambertMaterial({ color: TERRE }));
  terre.rotation.x = -Math.PI / 2;
  terre.position.y = 0.15;
  scene.add(terre);

  // Le losange d'herbe au milieu de la terre battue.
  const BUTS = [[0, 0], [63.64, 63.64], [0, 127.28], [-63.64, 63.64]];
  const centreInt = [0, 63.64], retrait = 1 - 9 / 63.64;
  const losange = new Shape();
  BUTS.forEach(([x, y], i) => {
    const p = [centreInt[0] + (x - centreInt[0]) * retrait, centreInt[1] + (y - centreInt[1]) * retrait];
    if (i === 0) losange.moveTo(p[0], p[1]); else losange.lineTo(p[0], p[1]);
  });
  losange.closePath();
  const herbe = new Mesh(new ShapeGeometry(losange), new MeshLambertMaterial({ color: GAZON_CLAIR }));
  herbe.rotation.x = -Math.PI / 2;
  herbe.position.y = 0.3;
  scene.add(herbe);

  const monticule = new Mesh(new CylinderGeometry(4.5, 8, 0.9, 24), new MeshLambertMaterial({ color: TERRE }));
  monticule.position.set(0, 0.45, -MONTICULE);
  scene.add(monticule);

  BUTS.slice(1).forEach(([x, y]) => {
    const b = new Mesh(new PlaneGeometry(2.5, 2.5), new MeshBasicMaterial({ color: 0xffffff }));
    b.rotation.z = Math.PI / 4;
    b.rotation.x = -Math.PI / 2;
    b.position.set(x, 0.55, -y);
    scene.add(b);
  });

  [-1, 1].forEach((s) => {
    const d = [s * Math.SQRT1_2, Math.SQRT1_2];
    const g = new BufferGeometry().setFromPoints([V(0, 0, 0.5), V(d[0] * 400, d[1] * 400, 0.5)]);
    scene.add(new Line(g, new LineBasicMaterial({ color: CRAIE })));
  });

  // --- les tribunes, puis le mur du parc ---
  if (gradins) scene.add(gradins.groupe);

  if (mur) {
    if (parc.piste) scene.add(rubanSol(parc.piste, mur, 0.25, TERRE));
    scene.add(ruban(mur, HAUTEUR_MUR, MUR));
    scene.add(new Line(
      new BufferGeometry().setFromPoints(mur.map(([x, y]) => V(x, y, HAUTEUR_MUR + 0.3))),
      new LineBasicMaterial({ color: OR })
    ));
    /* Les trois distances mesurees, posees sur le mur a l'angle ou elles
       sont peintes. Sur un trace reel elles disent que l'echelle est calee
       dessus ; sur une cloture interpolee, elles disent ou s'arrete le su. */
    const marques = stade
      ? [
          [-45, stade.gauche],
          [0, stade.centre],
          [45, stade.droite],
        ].filter(([, d]) => Number.isFinite(Number(d)))
      : [];
    marques.forEach(([angle, d]) => {
      const a = (angle * Math.PI) / 180;
      // Le point du mur le plus proche de cet angle — le trace n'a aucune
      // raison d'avoir un sommet pile a −45 degres.
      let best = Infinity, cible = null;
      for (const [x, y] of mur) {
        const e = Math.abs(Math.atan2(x, y) - a);
        if (e < best) { best = e; cible = [x, y]; }
      }
      const [x, y] = cible;
      /* Au-dessus du mur, et non plaquee dessus : sur un trace reel, la
         cloture passe devant l'etiquette des que la camera tourne un peu. */
      const sp = etiquette(String(Math.round(Number(d))));
      sp.position.copy(V(x, y, HAUTEUR_MUR + 9));
      scene.add(sp);
    });
  }

  // --- les trajectoires ---
  const tracés = circuits.map(({ points, couleur }) => {
    const v = points.map(([x, y, z]) => V(x, y, z));
    const tube = new Mesh(
      new TubeGeometry(new CatmullRomCurve3(v), Math.min(160, v.length * 2), 0.9, 6, false),
      new MeshLambertMaterial({ color: couleur, transparent: true, opacity: 0.92 })
    );
    const ombre = new Line(
      new BufferGeometry().setFromPoints(points.map(([x, y]) => new Vector3(x, 0.6, -y))),
      new LineBasicMaterial({ color: 0x182a1e, transparent: true, opacity: 0.4 })
    );
    const fin = points[points.length - 1];
    const chute = new Mesh(new CircleGeometry(2.6, 16), new MeshBasicMaterial({ color: couleur }));
    chute.rotation.x = -Math.PI / 2;
    chute.position.set(fin[0], 0.7, -fin[1]);
    const grp = new Group();
    grp.add(tube, ombre, chute);
    scene.add(grp);
    return { tube, v };
  });

  const balle = new Mesh(new SphereGeometry(2.6, 16, 12), new MeshLambertMaterial({ color: 0xffffff }));
  balle.visible = false;
  scene.add(balle);

  // --- pilotage a la souris et au doigt ---
  let glisse = false, px = 0, py = 0, pince = 0;
  const surDebut = (e) => { glisse = true; px = e.clientX; py = e.clientY; };
  const surFin = () => { glisse = false; };
  const surBouge = (e) => {
    if (!glisse) return;
    theta -= (e.clientX - px) * 0.005;
    phi -= (e.clientY - py) * 0.005;
    px = e.clientX; py = e.clientY;
    placerCamera();
  };
  const surMolette = (e) => { e.preventDefault(); rayon *= 1 + Math.sign(e.deltaY) * 0.08; placerCamera(); };
  const surPince = (e) => {
    if (e.touches.length !== 2) return;
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (pince > 0) { rayon *= pince / d; placerCamera(); }
    pince = d;
  };
  const surPinceFin = () => { pince = 0; };
  renderer.domElement.addEventListener("pointerdown", surDebut);
  window.addEventListener("pointerup", surFin);
  window.addEventListener("pointermove", surBouge);
  renderer.domElement.addEventListener("wheel", surMolette, { passive: false });
  renderer.domElement.addEventListener("touchmove", surPince, { passive: true });
  renderer.domElement.addEventListener("touchend", surPinceFin);

  // --- boucle ---
  let choisi = -1, t = 0, duree = 0, vivant = true;
  const horloge = new Clock();
  const tourner = () => {
    if (!vivant) return;
    requestAnimationFrame(tourner);
    const dt = horloge.getDelta();
    if (choisi >= 0 && animer && duree > 0) {
      t = (t + dt) % duree;
      const v = tracés[choisi].v;
      balle.position.copy(v[Math.min(v.length - 1, Math.floor((t / duree) * (v.length - 1)))]);
    }
    renderer.render(scene, camera);
  };
  tourner();

  return {
    parc: {
      qualite: parc.qualite,
      nom: parc.nom || null,
      // Ce que la note sous la scene doit pouvoir dire : d'ou sort le bol.
      gradins: gradins ? { places: Number(stade?.places) || null, toit: stade?.toit || null } : null,
    },
    choisir(i, volSecondes) {
      choisi = i;
      tracés.forEach((tr, k) => { tr.tube.material.opacity = i < 0 || k === i ? 0.92 : 0.12; });
      if (i >= 0) {
        t = 0;
        duree = Math.max(0.8, (volSecondes || 4) * 1.6);
        balle.visible = animer;
        // Sans animation, la balle se pose au point de chute : la scene
        // reste lisible pour qui a demande moins de mouvement.
        if (!animer) {
          const v = tracés[i].v;
          balle.position.copy(v[v.length - 1]);
          balle.visible = true;
        }
      } else {
        balle.visible = false;
      }
    },
    redimensionner() {
      const l = conteneur.clientWidth, h = conteneur.clientHeight;
      if (!l || !h) return;
      camera.aspect = l / h;
      camera.updateProjectionMatrix();
      renderer.setSize(l, h);
    },
    detruire() {
      vivant = false;
      renderer.domElement.removeEventListener("pointerdown", surDebut);
      window.removeEventListener("pointerup", surFin);
      window.removeEventListener("pointermove", surBouge);
      renderer.domElement.removeEventListener("wheel", surMolette);
      renderer.domElement.removeEventListener("touchmove", surPince);
      renderer.domElement.removeEventListener("touchend", surPinceFin);
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose?.();
        o.material?.map?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
