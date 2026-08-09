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

import { HAUTEUR_MUR } from "./donnees/balistique.js";

/* La palette de l'application, en nombres. Le gazon et la terre battue
   sont ceux du reste du site ; le ciel est le seul ajout, parce qu'un
   fond vert derriere une balle verte ne montre rien. */
const GAZON = 0x2f6b3f, GAZON_CLAIR = 0x3a7d4a, TERRE = 0xb08a5e;
// Le mur est plus sombre que la pelouse : sans cet ecart il disparaissait.
const CRAIE = 0xeff3ea, CIEL = 0x0b241a, MUR = 0x1d4a30;
const OR = 0xf2ce6b;

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

/* ------------------------------------------------------------------ *
 *  MONTAGE
 *  `circuits` : [{ points: [[x,y,z] en pieds], couleur }]
 *  `mur`      : polyligne du parc, en pieds, ou null
 *  Rend une poignee : { choisir, redimensionner, detruire }.
 * ------------------------------------------------------------------ */
export function monterScene(conteneur, { circuits, mur, marques = [], animer = true }) {
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
  scene.fog = new Fog(CIEL, 1100, 2600);

  const camera = new PerspectiveCamera(45, conteneur.clientWidth / conteneur.clientHeight, 1, 4000);
  const cible = new Vector3(0, 20, -150);
  /* Vue par defaut : DERRIERE LE MARBRE, la ou personne ne s'assoit mais
     d'ou tout se lit — la balle part vers le fond de l'image, comme on la
     suit des yeux au stade. Un demi-tour (theta = pi) mettrait la camera
     derriere le champ centre, a regarder le terrain a l'envers.
     Sur un ecran etroit on recule, sinon la cloture sort du cadre. */
  let theta = 0, phi = 1.24;
  let rayon = conteneur.clientWidth < 520 ? 620 : 470;
  const placerCamera = () => {
    phi = Math.max(0.18, Math.min(1.45, phi));
    rayon = Math.max(140, Math.min(1600, rayon));
    camera.position.set(
      cible.x + rayon * Math.sin(phi) * Math.sin(theta),
      cible.y + rayon * Math.cos(phi),
      cible.z + rayon * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(cible);
  };
  placerCamera();

  // La lumiere du bas releve la face interieure du mur, tournee vers le
  // marbre et donc vers la camera : sans elle, le mur sortait en noir.
  scene.add(new HemisphereLight(0xdfe9ef, 0x53806a, 1.15));
  const soleil = new DirectionalLight(0xfff3d6, 0.85);
  soleil.position.set(-300, 500, 200);
  scene.add(soleil);

  // --- la pelouse, l'avant-champ, les lignes de faute ---
  const pelouse = new Mesh(new CircleGeometry(600, 64), new MeshLambertMaterial({ color: GAZON }));
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

  // --- le mur du parc ---
  if (mur) {
    scene.add(ruban(mur, HAUTEUR_MUR, MUR));
    scene.add(new Line(
      new BufferGeometry().setFromPoints(mur.map(([x, y]) => V(x, y, HAUTEUR_MUR + 0.3))),
      new LineBasicMaterial({ color: OR })
    ));
    /* Les trois distances mesurees, la ou elles sont peintes. Elles disent
       aussi, en creux, que le reste du mur est interpole. */
    marques.forEach(({ angle, texte }) => {
      const t = (angle * Math.PI) / 180;
      const i = Math.round(((angle + 45) / 90) * (mur.length - 1));
      const [x, y] = mur[Math.max(0, Math.min(mur.length - 1, i))];
      const r = Math.hypot(x, y);
      const sp = etiquette(texte);
      sp.position.copy(V(x * (1 - 9 / r), y * (1 - 9 / r), HAUTEUR_MUR * 0.65));
      sp.userData.angle = t;
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
