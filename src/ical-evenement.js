/* ------------------------------------------------------------------ *
 *  UN MATCH DANS L'AGENDA
 *  La fiche d'un match propose de le telecharger en .ics : un seul
 *  evenement, fabrique dans le navigateur au moment du clic. C'est le
 *  complement du calendrier d'apres-saison (outils/ical.mjs), qui lui
 *  est un ABONNEMENT : ici le match est choisi, son affiche connue, et
 *  un fichier telecharge une fois suffit.
 *
 *  Les primitives RFC 5545 vivent dans ce fichier et sont importees par
 *  le generateur d'abonnement : une seule implementation de
 *  l'echappement et du pliage, testee une fois. Elles s'ecrivent avec
 *  TextEncoder plutot que Buffer, qui n'existe pas dans le navigateur.
 * ------------------------------------------------------------------ */

/* Echappement RFC 5545 : la virgule et le point-virgule separent des
   valeurs, la barre oblique inverse echappe, et un retour a la ligne
   s'ecrit `\n` en toutes lettres. */
export const echapper = (s) =>
  String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/* Pliage a 75 OCTETS, pas 75 caracteres. Un « é » en pese deux, et couper
   au milieu d'une sequence UTF-8 produit un fichier que les clients
   refusent — c'est la faute la plus courante des generateurs maison. */
const enc = new TextEncoder();
const dec = new TextDecoder();
export function plier(ligne) {
  const octets = enc.encode(ligne);
  if (octets.length <= 75) return ligne;
  const morceaux = [];
  let debut = 0, limite = 75;
  while (debut < octets.length) {
    let fin = Math.min(debut + limite, octets.length);
    // Reculer jusqu'au debut d'un caractere : 10xxxxxx est une continuation.
    while (fin < octets.length && (octets[fin] & 0xc0) === 0x80) fin--;
    morceaux.push((debut ? " " : "") + dec.decode(octets.subarray(debut, fin)));
    debut = fin;
    limite = 74;   // les lignes suivantes commencent par une espace
  }
  return morceaux.join("\r\n");
}

export const horodatage = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export const jourSuivant = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------------ *
 *  DU MATCH DE LA FICHE A L'EVENEMENT
 *  `m` est le match tel que le programme le porte deja : `id` (gamePk),
 *  `debut` (instant UTC), `date` (journee officielle americaine), `tbd`,
 *  `ext`/`dom` (noms affichables), `stade`, `ville`, la serie et les
 *  lanceurs annonces. `maintenant` est passe pour des tests reproductibles.
 *
 *  Les memes precautions que l'abonnement :
 *   - identifiant STABLE (le gamePk) — retelecharger le meme match met
 *     l'evenement a jour au lieu d'en empiler un second ;
 *   - evenement SUR LA JOURNEE quand l'heure n'est pas annoncee, plutot
 *     que l'heure bouchon dont l'API remplit `gameDate`.
 * ------------------------------------------------------------------ */
export function icalDUnMatch(m, { maintenant = new Date() } = {}) {
  const detail = [];
  if (m.matchSerie && m.totalSerie) detail.push(`Match ${m.matchSerie} sur ${m.totalSerie} de la série.`);
  if (m.lanceurExt || m.lanceurDom)
    detail.push(`Lanceurs annoncés : ${m.lanceurExt || "?"} / ${m.lanceurDom || "?"}.`);
  if (m.tbd) detail.push("L'horaire n'est pas encore annoncé : la journée entière est réservée.");
  detail.push(`https://www.mlb.com/gameday/${m.id}`);

  const l = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//learnbaseball//match//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:mlb-${m.id}@learnbaseball`,
    `DTSTAMP:${horodatage(maintenant)}`,
  ];
  if (m.tbd) {
    /* Sur la journee. DTEND est le lendemain : en VALUE=DATE la borne de
       fin est exclusive, et sans elle certains clients etalent
       l'evenement sur deux jours. */
    l.push(`DTSTART;VALUE=DATE:${m.date.replace(/-/g, "")}`);
    l.push(`DTEND;VALUE=DATE:${jourSuivant(m.date).replace(/-/g, "")}`);
  } else {
    /* Trois heures : depuis l'horloge des lancers (2023), un match de
       saison reguliere dure 2h40 en moyenne — on garde de la marge. */
    const debut = new Date(m.debut);
    l.push(`DTSTART:${horodatage(debut)}`);
    l.push(`DTEND:${horodatage(new Date(debut.getTime() + 3 * 3600e3))}`);
  }
  l.push(`SUMMARY:${echapper(`${m.ext} @ ${m.dom}`)}`);
  l.push(`DESCRIPTION:${echapper(detail.join("\n"))}`);
  if (m.stade) l.push(`LOCATION:${echapper(m.ville ? `${m.stade}, ${m.ville}` : m.stade)}`);
  l.push(`URL:https://www.mlb.com/gameday/${m.id}`);
  // Sans heure, rien n'est confirme : les clients grisent l'evenement.
  l.push(`STATUS:${m.tbd ? "TENTATIVE" : "CONFIRMED"}`);
  l.push("END:VEVENT", "END:VCALENDAR");
  return l.map(plier).join("\r\n") + "\r\n";
}
