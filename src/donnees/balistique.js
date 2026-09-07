/* ------------------------------------------------------------------ *
 *  BALISTIQUE D'UN CIRCUIT
 *  L'API ne donne pas la trajectoire d'une balle : elle donne trois
 *  nombres mesures a l'impact — vitesse de sortie, angle d'envol, et la
 *  distance ou la balle est retombee — plus le point de chute en
 *  coordonnees de feuille de match. La courbe entre les deux, il faut
 *  la calculer.
 *
 *  Le modele est celui d'Alan Nathan : integration pas a pas de la
 *  trainee et de l'effet Magnus. La trainee freine, le Magnus porte —
 *  c'est lui qui fait qu'une balle frappee a 30 degres retombe a 120
 *  metres au lieu des 100 que donnerait la parabole du lycee.
 *
 *  CE QU'ON MESURE ET CE QU'ON DEVINE. Vitesse, angle et distance sont
 *  mesures. La ROTATION, elle, n'est pas publiee : on la cherche par
 *  dichotomie, en prenant celle qui fait retomber la balle a la distance
 *  annoncee. La trajectoire passe donc par les trois points connus, mais
 *  son apex et son temps de vol restent des estimations — et le vent,
 *  que personne ne publie non plus, se retrouve absorbe dans la rotation.
 *  D'ou le drapeau `sature` : au-dela de 4 500 tr/min, plus aucune
 *  rotation plausible n'explique la distance, et c'est le signe qu'un
 *  vent arriere a pousse la balle.
 * ------------------------------------------------------------------ */

/* Unites SI a l'interieur, pieds a l'exterieur : le baseball se compte en
   pieds, la physique en metres. La frontiere est ici, pas ailleurs. */
const RHO = 1.194;              // masse volumique de l'air, kg/m3 (20 °C)
const MASSE = 0.14529;          // masse d'une balle, kg (5,125 oz)
const RAYON = 0.03683;          // rayon, m (2,9 pouces de circonference)
const G = 9.80665;
const CD = 0.33;                // coefficient de trainee, quasi constant sur la plage utile
const K = (RHO * Math.PI * RAYON * RAYON) / (2 * MASSE);
const PI_PAR_M = 1 / 0.3048;
const MPH_PAR_MS = 0.44704;

export const HAUTEUR_IMPACT = 0.9144; // 3 pieds : hauteur moyenne du contact

/* Portance en fonction du taux de rotation. `S` est le rapport entre la
   vitesse de surface due a la rotation et la vitesse d'avance ; la forme
   de la courbe vient des mesures en soufflerie de Nathan. */
function coefficientPortance(rotationTrMin, vitesse) {
  if (vitesse < 1e-6 || rotationTrMin < 1) return 0;
  const S = (RAYON * ((rotationTrMin * 2 * Math.PI) / 60)) / vitesse;
  return 1 / (2.32 + 0.4 / S);
}

/* Repere de simulation, en metres : x vers le champ droit, y vers le champ
   centre, z vers le ciel. Le marbre est a l'origine.

   `rotationTrMin` est le retro (axe horizontal, perpendiculaire au depart :
   il porte). `lateraleTrMin` est la rotation LATERALE, autour de l'axe
   perpendiculaire a la vitesse dans son plan vertical — a peu pres la
   verticale, inclinee de l'angle d'envol, comme Nathan la definit. Positive,
   elle fait derriver la balle vers le champ droit ; negative, vers le champ
   gauche. A zero, le vol reste dans un plan vertical : vu d'en haut, une
   droite. */
export function simuler(vitesseMph, angleDeg, sprayDeg, rotationTrMin, dt = 0.005, lateraleTrMin = 0) {
  const v0 = vitesseMph * MPH_PAR_MS;
  const a = (angleDeg * Math.PI) / 180;
  const s = (sprayDeg * Math.PI) / 180;

  let v = [v0 * Math.cos(a) * Math.sin(s), v0 * Math.cos(a) * Math.cos(s), v0 * Math.sin(a)];
  let p = [0, 0, HAUTEUR_IMPACT];

  /* Le vecteur rotation, somme de deux axes : le retro (horizontal, perpendi-
     culaire au deplacement, Magnus vers le haut — le cas de tous les
     circuits) et la laterale. L'axe de celle-ci est la « verticale » vue de
     la balle : perpendiculaire a la vitesse, dans son plan vertical. Son
     Magnus est horizontal au depart, perpendiculaire a la course — c'est
     lui qui courbe le vol vu d'en haut. Le signe : n × v pointe vers le
     champ gauche, d'ou le moins pour que positif aille a droite. */
  const n = [-Math.sin(a) * Math.sin(s), -Math.sin(a) * Math.cos(s), Math.cos(a)];
  const w = [
    rotationTrMin * Math.cos(s) - lateraleTrMin * n[0],
    -rotationTrMin * Math.sin(s) - lateraleTrMin * n[1],
    -lateraleTrMin * n[2],
  ];
  const rotationTotale = Math.hypot(w[0], w[1], w[2]);

  const acceleration = (vit) => {
    const norme = Math.hypot(vit[0], vit[1], vit[2]);
    const acc = [-K * CD * norme * vit[0], -K * CD * norme * vit[1], -G - K * CD * norme * vit[2]];
    if (rotationTotale > 1) {
      /* La portance depend de la rotation TOTALE : ajouter de la laterale a
         un retro donne n'ajoute pas de portance verticale, elle en retire
         meme un peu — la balle qui crochete porte moins loin, c'est mesure. */
      const CL = coefficientPortance(rotationTotale, norme);
      const u = [w[0] / rotationTotale, w[1] / rotationTotale, w[2] / rotationTotale];
      // produit vectoriel rotation x vitesse : la direction de la portance
      const c = [
        u[1] * vit[2] - u[2] * vit[1],
        u[2] * vit[0] - u[0] * vit[2],
        u[0] * vit[1] - u[1] * vit[0],
      ];
      const f = K * CL * norme;
      acc[0] += f * c[0];
      acc[1] += f * c[1];
      acc[2] += f * c[2];
    }
    return acc;
  };

  /* Runge-Kutta d'ordre 4. Euler suffirait a l'oeil, mais accumule assez
     d'erreur sur six secondes de vol pour fausser la distance de plusieurs
     metres — or c'est justement la distance qu'on ajuste ensuite. */
  const points = [[...p]];
  const avance = (u, d, k) => [u[0] + k * d[0], u[1] + k * d[1], u[2] + k * d[2]];
  // Garde-fou : une balle qui ne retombe pas est un bug, pas un circuit.
  const MAX_PAS = 4000;
  while (p[2] > 0 && points.length < MAX_PAS) {
    const k1v = acceleration(v), k1p = v;
    const k2v = acceleration(avance(v, k1v, dt / 2)), k2p = avance(v, k1v, dt / 2);
    const k3v = acceleration(avance(v, k2v, dt / 2)), k3p = avance(v, k2v, dt / 2);
    const k4v = acceleration(avance(v, k3v, dt)), k4p = avance(v, k3v, dt);
    for (let i = 0; i < 3; i++) {
      p[i] += (dt / 6) * (k1p[i] + 2 * k2p[i] + 2 * k3p[i] + k4p[i]);
      v[i] += (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
    }
    points.push([...p]);
  }

  const fin = points[points.length - 1];
  return {
    points,                                                   // metres
    distance: Math.hypot(fin[0], fin[1]) * PI_PAR_M,          // pieds
    apex: Math.max(...points.map((q) => q[2])) * PI_PAR_M,    // pieds
    vol: (points.length - 1) * dt,                            // secondes
    // La vitesse au moment de retomber : `v` est le vecteur vitesse a la
    // derniere iteration, donc rien a estimer.
    vitesseFinale: Math.hypot(v[0], v[1], v[2]) / MPH_PAR_MS, // mph
    // L'azimut du point de chute, en degres : la ou la balle est VRAIMENT
    // tombee, qui differe du `sprayDeg` de depart des que la laterale agit.
    azimutChute: (Math.atan2(fin[0], fin[1]) * 180) / Math.PI,
  };
}

/* ------------------------------------------------------------------ *
 *  L'ENERGIE
 *  Une demi-masse fois le carre de la vitesse, rien de plus. Mais c'est
 *  le chiffre qui rend la difference entre 95 et 110 mph palpable : elle
 *  n'est pas de 16 %, elle est de 45 %, parce que l'energie va comme le
 *  CARRE de la vitesse. Un frappeur qui gagne cinq milles a l'heure ne
 *  gagne pas cinq pour cent.
 *
 *  L'autre lecture est en vol : la balle repart avec cent soixante
 *  joules et se pose avec cinquante. L'air en prend les deux tiers — et
 *  c'est aussi pour cela qu'une balle frappee a Denver, ou l'air est
 *  plus fin, va plus loin.
 * ------------------------------------------------------------------ */
export const energie = (vitesseMph) =>
  0.5 * MASSE * (vitesseMph * MPH_PAR_MS) ** 2;   // joules

export const ROTATION_MAX = 4500;

/* La rotation qui fait retomber la balle a la distance annoncee. Monotone :
   plus de retro, plus de portance, plus de distance — la dichotomie converge
   donc sans surprise. Trente-six passes suffisent a la precision du pied.
   La laterale, si on en donne, est tenue fixe : c'est le retro qu'on cherche. */
export function ajusterRotation(vitesseMph, angleDeg, sprayDeg, distancePi, lateraleTrMin = 0) {
  let bas = 0, haut = ROTATION_MAX;
  for (let i = 0; i < 36; i++) {
    const milieu = (bas + haut) / 2;
    if (simuler(vitesseMph, angleDeg, sprayDeg, milieu, 0.005, lateraleTrMin).distance < distancePi) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

/* ------------------------------------------------------------------ *
 *  LE CROCHET, ESTIME
 *  A la television, un circuit ne file pas droit : tire vers la ligne,
 *  il « crochete » ; pousse a l'oppose, il « slice ». C'est la rotation
 *  laterale, que le contact bat-balle impose des que la batte n'est pas
 *  perpendiculaire au lancer. Or l'API ne publie NI la rotation, NI la
 *  direction de depart : un seul azimut, celui du point de chute. Une
 *  courbe vue d'en haut demande deux contraintes, on n'en a qu'une.
 *
 *  Ce qu'on fait donc : on prend la rotation laterale TYPIQUE pour cet
 *  angle de spray, telle que Nathan l'a lue dans les mesures Statcast
 *  (« Why Does a Fly Ball Carry Better to Centerfield? », 2020) — et on
 *  recale la direction de depart pour que la balle retombe quand meme au
 *  point mesure. La courbe passe toujours par les faits ; sa courbure,
 *  elle, est une moyenne statistique, pas une mesure de CETTE balle.
 *  C'est pour cela que le crochet est une option, et qu'elle se dit
 *  « estimee ».
 *
 *  Ce que disent les donnees (Nathan, fig. 2 et « Spinning Out of
 *  Control », 2016) :
 *   - la laterale croit lineairement avec le spray, compte depuis le cote
 *     tire (negatif) vers l'oppose (positif) ;
 *   - elle s'annule non pas plein centre, mais a −10° environ, du cote
 *     tire : la batte est inclinee au contact, barillet plus bas que le
 *     manche, et cette inclinaison a elle seule donne du slice ;
 *   - consequence : une balle frappee plein centre slice de 6 a 7° vers
 *     l'oppose en moyenne, et pour un meme ecart a la ligne, l'oppose
 *     slice plus que le cote tire ne crochete.
 *  La pente ci-dessous est calee pour reproduire ces 6-7° plein centre sur
 *  un circuit ordinaire (100 mph, 27°) ; elle donne alors, a 30° a l'oppose,
 *  les 2 000 tr/min et quelques qu'on lit sur la figure de Nathan.
 * ------------------------------------------------------------------ */
export const SPRAY_SANS_LATERALE = -10;     // degres, cote tire
export const LATERALE_PAR_DEGRE = 60;       // tr/min par degre de spray
export const LATERALE_MAX = 3000;           // tr/min, au-dela plus rien de mesure

/* La rotation laterale typique d'une balle retombee a `sprayDeg` (positif
   vers le champ droit), pour un frappeur gaucher ou droitier. Le signe suit
   la convention de `simuler` : positif fait derriver vers le champ droit.
   Sans main connue, pas de crochet : `null`, et la vue le dit. */
export function lateraleTypique(sprayDeg, gaucher) {
  if (!Number.isFinite(sprayDeg) || typeof gaucher !== "boolean") return null;
  // Le spray « ajuste » de Nathan : negatif du cote tire, quelle que soit la main.
  const ajuste = gaucher ? -sprayDeg : sprayDeg;
  const grandeur = LATERALE_PAR_DEGRE * (ajuste - SPRAY_SANS_LATERALE);
  const bornee = Math.max(-LATERALE_MAX, Math.min(LATERALE_MAX, grandeur));
  /* Positif (slice) pousse vers le champ oppose : a droite pour un droitier,
     a gauche pour un gaucher. Negatif (crochet) pousse vers le cote tire. */
  return gaucher ? -bornee : bornee;
}

/* La reconstruction complete d'un circuit : retro ajuste sur la distance,
   direction de depart recalee sur le point de chute. Sans laterale, c'est
   l'ancien calcul ; avec, la balle part d'un cote de son point de chute et
   y revient en courbant.

   Le recalage ne coute rien : la physique ne connait pas le nord. Traînee,
   gravite et Magnus (defini par rapport a la vitesse) sont indifferents a
   l'azimut de depart, donc la trajectoire simulee plein centre est, a une
   rotation autour de la verticale pres, LA trajectoire. On la simule une
   fois, on lit ou elle tombe, on la tourne pour que ce soit au bon endroit. */
export function reconstruire(vitesseMph, angleDeg, sprayDeg, distancePi, lateraleTrMin = 0) {
  const laterale = Number.isFinite(lateraleTrMin) ? lateraleTrMin : 0;
  const rotation = ajusterRotation(vitesseMph, angleDeg, 0, distancePi, laterale);
  const vol = simuler(vitesseMph, angleDeg, 0, rotation, 0.005, laterale);
  // La derive : de combien la balle a tourne, en degres, entre son depart et sa chute.
  const derive = vol.azimutChute;
  const depart = sprayDeg - derive;
  const t = (depart * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
  const points = vol.points.map(([x, y, z]) => [x * c + y * sn, -x * sn + y * c, z]);
  return {
    ...vol,
    points,
    rotation,
    laterale,
    depart,                                          // azimut de depart, degres
    derive,                                          // degres, positif vers le champ droit
    // L'ecart lateral au sol entre la ligne de depart et le point de chute, en pieds.
    derivePi: Math.abs(distancePi * Math.sin((derive * Math.PI) / 180)),
    azimutChute: sprayDeg,
  };
}

/* ------------------------------------------------------------------ *
 *  DU POINT DE CHUTE A L'ANGLE DE SPRAY
 *  La feuille de match repere le point de chute dans un carre de 250
 *  unites dont le marbre occupe (125.42, 198.27) — un heritage des
 *  tablettes de marqueurs, ou l'axe des ordonnees descend vers le haut
 *  du terrain. D'ou le y inverse.
 *  0 degre vise le champ centre, positif vers le champ droit.
 * ------------------------------------------------------------------ */
const MARBRE_X = 125.42, MARBRE_Y = 198.27;

export function sprayDepuisCoords(coordX, coordY) {
  if (!Number.isFinite(coordX) || !Number.isFinite(coordY)) return null;
  /* (0, 0) est le coin de la feuille, pas un point du terrain : aucune balle
     n'y tombe, et l'API s'en sert quand la position n'a pas ete relevee.
     Sans ce refus, l'absence de mesure se dessinait comme un circuit
     parfaitement plausible vers le champ gauche. */
  if (coordX === 0 && coordY === 0) return null;
  const a = (Math.atan2(coordX - MARBRE_X, MARBRE_Y - coordY) * 180) / Math.PI;
  // Hors des lignes de faute, la mesure n'a pas de sens : on la refuse
  // plutot que de dessiner une balle partie dans les tribunes laterales.
  return Math.abs(a) <= 50 ? a : null;
}

/* ------------------------------------------------------------------ *
 *  LE MUR, RECONSTRUIT
 *  Aucune API publique ne donne le contour des trente parcs. On n'a que
 *  les trois distances peintes sur les murs — ligne gauche, centre,
 *  ligne droite — que l'application affiche deja dans « les terrains ».
 *  La parabole qui passe par ces trois points est EXACTE la ou on la
 *  connait, et une interpolation partout ailleurs.
 *
 *  Trois nombres ne suffisent pas a decrire un parc : compare aux allees
 *  reellement mesurees, l'ecart va de −20 pieds (Wrigley, dont le mur est
 *  presque droit entre le poteau et l'allee) a +17 (le Yankee Stadium et
 *  son porche court). Un arc de cercle a travers les memes points ne fait
 *  pas mieux, l'erreur change seulement de sens. On garde donc la forme
 *  la plus simple, on marque a l'ecran les trois distances mesurees — le
 *  reste du mur se lit comme ce qu'il est.
 *
 *  Ce que la vue montre de sur ne depend d'ailleurs pas de ce trace : le
 *  point de chute et la trajectoire, eux, sont mesures.
 * ------------------------------------------------------------------ */
/* Le pas divise 45 : sans cela, l'echantillonnage sautait par-dessus le
   champ centre — le seul point du mur dont on connaisse la distance
   exacte — et la marque « 400 » se posait a cote. */
export function murDuParc({ gauche, centre, droite }, pas = 3) {
  const L = Number(gauche), C = Number(centre), R = Number(droite);
  if (![L, C, R].every((x) => Number.isFinite(x) && x > 100)) return null;
  // r(θ) = C + pente·θ + courbure·θ², cale sur (−45, L), (0, C), (+45, R)
  const pente = (R - L) / 90;
  const courbure = (L + R - 2 * C) / (2 * 45 * 45);
  const points = [];
  for (let a = -45; a <= 45 + 1e-9; a += pas) {
    const r = C + pente * a + courbure * a * a;
    const t = (a * Math.PI) / 180;
    points.push([r * Math.sin(t), r * Math.cos(t)]); // pieds, repere de simulation
  }
  return points;
}

/* Hauteur retenue pour le mur, en pieds. La ligue ne la publie pas parc par
   parc ; huit pieds est la valeur la plus courante. Elle ne sert qu'a donner
   une echelle verticale — aucune conclusion ne repose dessus. */
export const HAUTEUR_MUR = 8;
