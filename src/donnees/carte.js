/* ------------------------------------------------------------------ *
 *  FOND DE CARTE ET PROJECTION
 *  Le contour vient du Bureau du recensement americain (domaine public),
 *  decode, projete et simplifie une fois pour toutes : l'application
 *  n'embarque qu'un trace fige de 1 Ko, sans bibliotheque cartographique
 *  ni tuiles a telecharger.
 *
 *  Le trace passe par un filtre anti-aiguilles : sur les cotes tres
 *  decoupees — delta du Mississippi, baie de Chesapeake — Douglas-Peucker
 *  conserve les points extremes en jetant les intermediaires, ce qui
 *  produit des pointes en zigzag. On retire iterativement les sommets dont
 *  l'angle est tres aigu et la saillie notable.
 * ------------------------------------------------------------------ */

export const CONTOUR_US = "M809.2 480.1L853.8 568.3L851.3 607.7L836.1 610.8L810.4 582.8L809.5 571.4L806.1 577.7L793.2 559.7L799.0 550.1L792.7 547.9L789.9 552.3L789.8 527.0L766.9 506.3L753.2 502.9L738.5 517.0L710.4 501.2L675.5 507.8L672.5 505.8L648.0 506.3L637.4 516.0L650.7 515.9L641.6 525.0L656.6 534.7L650.7 535.0L638.7 532.5L617.5 540.1L596.4 522.5L540.9 531.5L531.4 527.5L526.9 541.6L483.3 578.0L480.0 583.8L479.2 620.0L442.2 605.8L433.9 577.5L396.1 522.9L376.7 519.2L352.7 537.3L331.2 521.0L324.7 497.0L296.4 465.9L260.8 461.2L259.4 472.0L201.1 463.6L131.2 422.4L134.1 417.4L85.7 411.7L82.5 391.1L66.3 369.7L29.5 347.4L32.9 334.0L13.3 276.3L15.2 262.0L15.2 261.0L7.8 254.2L1.3 228.1L0.0 190.0L13.1 168.5L14.8 133.4L47.9 57.7L46.9 56.6L55.1 42.0L51.6 5.3L80.5 19.7L87.7 26.0L86.2 0.0L326.4 49.0L494.4 59.9L522.8 60.0L525.9 51.1L531.1 66.0L544.9 71.1L615.1 79.9L594.0 106.5L593.2 115.3L602.1 115.5L640.7 90.8L639.0 103.3L662.1 114.0L688.5 103.3L691.7 109.7L706.4 106.8L705.4 115.5L684.6 119.9L667.4 133.6L668.0 126.6L660.1 128.6L662.1 141.7L650.5 192.7L664.3 230.8L680.8 211.2L672.9 170.9L678.9 149.1L686.5 141.2L688.0 152.2L696.5 135.6L693.9 127.0L722.7 135.3L726.5 157.5L734.5 162.9L739.9 167.5L746.2 197.1L732.8 220.4L751.2 226.5L805.2 188.9L803.5 171.8L850.8 155.9L846.2 140.3L864.6 116.9L931.1 94.4L942.8 35.3L968.2 37.6L977.7 69.7L997.2 85.5L981.5 104.8L975.4 101.7L976.3 112.1L966.9 104.5L968.6 115.3L948.3 137.5L947.2 163.9L960.8 173.8L965.6 165.5L969.4 176.4L953.7 184.1L946.7 185.0L944.7 187.5L909.8 205.2L907.9 211.2L903.8 214.8L908.1 236.9L898.7 259.6L898.1 272.9L889.3 286.4L871.8 267.8L875.5 249.3L866.1 258.7L876.8 286.9L858.0 282.2L856.8 282.4L879.2 290.1L878.2 297.3L879.6 298.2L882.3 311.5L888.5 312.2L896.5 331.7L888.1 327.8L882.2 336.3L880.7 338.4L891.9 334.6L893.9 342.3L896.9 334.4L900.1 342.0L893.8 350.7L887.9 353.7L892.5 358.9L817.1 439.7L809.2 480.1Z";
export const CARTE_L = 1000, CARTE_H = 620;

/* Projection conique equivalente d'Albers, parametres usuels pour les
   Etats-Unis. L'ordonnee est inversee : en SVG, y croit vers le bas. */
const AL = (() => {
  const r = (d) => (d * Math.PI) / 180;
  const p1 = r(29.5), p2 = r(45.5), lat0 = r(37.5), lon0 = r(-96);
  const n = (Math.sin(p1) + Math.sin(p2)) / 2;
  const C = Math.cos(p1) ** 2 + 2 * n * Math.sin(p1);
  return { r, n, C, lon0, r0: Math.sqrt(C - 2 * n * Math.sin(lat0)) / n,
           mx: -0.368551, my: -0.244743, k: 1381.8587 };
})();

export function projeter(lon, lat) {
  if (lat == null || lon == null) return null;
  const la = AL.r(lat), lo = AL.r(lon);
  const rr = Math.sqrt(AL.C - 2 * AL.n * Math.sin(la)) / AL.n;
  const th = AL.n * (lo - AL.lon0);
  const x = rr * Math.sin(th);
  const y = -(AL.r0 - rr * Math.cos(th));
  return { x: (x - AL.mx) * AL.k, y: (y - AL.my) * AL.k };
}
