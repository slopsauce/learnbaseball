/* ------------------------------------------------------------------ *
 *  LE CALENDRIER DE L'APRES-SAISON
 *  Un fichier .ics pose a cote du site, auquel on s'abonne une fois : le
 *  calendrier se remplit tout seul de fin septembre a fin octobre.
 *
 *  C'EST L'ABONNEMENT QUI FAIT L'INTERET, pas le fichier. Au moment ou on
 *  l'ecrit, en aout, l'API donne bien les cinquante-trois matchs de
 *  l'apres-saison — mais les equipes sont des jetons (« AL Wild Card #1 »,
 *  stade « AL Stadium ») et aucune heure n'est annoncee. Tout cela se
 *  resout d'octobre : les jetons deviennent des franchises, les heures
 *  tombent, et les matchs « si necessaire » d'une serie balayee
 *  DISPARAISSENT du flux. Un fichier telecharge une fois serait faux
 *  trois jours plus tard ; un abonnement, non.
 *
 *  D'ou les deux precautions qui suivent :
 *   - un identifiant STABLE par match (le gamePk), pour que le client
 *     mette a jour l'evenement au lieu d'en empiler un second ;
 *   - un evenement SUR LA JOURNEE tant que l'heure n'est pas annoncee.
 *     L'API remplit alors `gameDate` d'une heure bouchon — 07h33 UTC pour
 *     les cinquante-trois — et un generateur naif poserait toute
 *     l'apres-saison a neuf heures et demie du matin.
 *
 *  Ce script tourne au moment du deploiement et ecrit dans `dist/`. Rien
 *  n'est commis : le depot ne sert pas d'entrepot.
 * ------------------------------------------------------------------ */

/* Les primitives RFC 5545 — echappement, pliage, horodatage — vivent avec
   l'application (la fiche d'un match sait aussi se telecharger en .ics) :
   une seule implementation, ecrite en TextEncoder pour tourner aussi bien
   ici, sous Node, que dans le navigateur. */
import { echapper, plier, horodatage, jourSuivant } from "../src/ical-evenement.js";
export { plier };

const API = "https://statsapi.mlb.com/api/v1";
const TYPES = "F,D,L,W";     // wild card, division, championnat, Serie mondiale
const PRODID = "-//learnbaseball//apres-saison//FR";

/* Les quatre tours, en francais. « wild card » reste tel quel : c'est
   l'usage de la presse francophone, et celui du reste du site. */
const TOUR = {
  F: "Wild card",
  D: "Série de division",
  L: "Série de championnat",
  W: "Série mondiale",
};
const LIGUE = { AL: "AL", NL: "NL" };

/* Le nom court d'une equipe : « Dodgers » plutot que « Los Angeles
   Dodgers », sauf quand c'est un jeton, ou le nom complet est justement
   ce qui renseigne — « AL Wild Card #1 » dit ou on en est du tableau. */
const nomEquipe = (t) => (t?.placeholder ? t.name : t?.teamName || t?.name || "?");

/* La serie a laquelle un match appartient. `seriesDescription` ne suffit
   pas : deux series de division se jouent EN MEME TEMPS dans chaque ligue,
   et seule `description` les distingue, par un « 'A' » ou un « 'B' ».
   Le `trim` n'est pas de la prudence gratuite — la ligue a publie
   « NLDS 'A' Game 4 » avec une espace finale, et sans lui ce match-la
   formait une serie a lui tout seul. */
const cleDeSerie = (g) => (g.description || "").trim().replace(/\s*Game\s*\d+$/i, "");

/* L'etat de la serie AVANT ce match : « Dodgers mènent 2-1 ». C'est le
   renseignement qu'on veut voir dans son telephone la veille, sans ouvrir
   quoi que ce soit.
   Avant, et non pas en tout : compter toute la serie mettait le resultat
   final — « Dodgers mènent 4-3 » — sur la fiche du match 2, et jusque sur
   celle du match 7, qui annoncait ainsi son propre denouement. */
function etatDeSerie(matchs, match) {
  const cle = cleDeSerie(match);
  const gagnes = {};
  for (const g of matchs) {
    if (cleDeSerie(g) !== cle) continue;
    if (!(g.seriesGameNumber < match.seriesGameNumber)) continue;
    if (g.status?.abstractGameState !== "Final") continue;
    const { away, home } = g.teams;
    if (!Number.isFinite(away.score) || !Number.isFinite(home.score)) continue;
    const v = away.score > home.score ? away.team : home.team;
    gagnes[nomEquipe(v)] = (gagnes[nomEquipe(v)] || 0) + 1;
  }
  const rang = Object.entries(gagnes).sort((a, b) => b[1] - a[1]);
  if (!rang.length) return null;
  // Tous les surnoms de la ligue sont des pluriels : « les Dodgers mènent ».
  if (rang.length === 1) return `${rang[0][0]} mènent ${rang[0][1]}-0`;
  const [[n1, v1], [, v2]] = rang;
  return v1 === v2 ? `Série à égalité ${v1}-${v2}` : `${n1} mènent ${v1}-${v2}`;
}

/* ------------------------------------------------------------------ *
 *  DU FLUX AU CALENDRIER
 *  `matchs` : les objets `games` de /schedule, deja aplatis.
 *  `maintenant` : passe en parametre pour que le test soit reproductible.
 * ------------------------------------------------------------------ */
export function construireIcal(matchs, { saison, maintenant = new Date() } = {}) {
  const l = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:MLB — après-saison ${saison}`,
    `X-WR-CALDESC:Les matchs d'après-saison, mis à jour au fil du tableau. Les équipes et les horaires se remplissent quand la ligue les annonce.`,
    // Les deux formes : la normalisee, et celle qu'Apple et Google lisent.
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  for (const g of matchs) {
    const { away, home } = g.teams;
    const tbd = !!g.status?.startTimeTBD;
    const siNecessaire = g.ifNecessary === "Y";
    const tour = TOUR[g.gameType] || "Après-saison";
    // « AL » ou « NL » quand le tour existe dans les deux ligues.
    const ligue = LIGUE[(g.description || "").slice(0, 2)];
    const titre = [
      `${nomEquipe(away.team)} @ ${nomEquipe(home.team)}`,
      `${ligue ? `${ligue} · ` : ""}${tour}${g.seriesGameNumber ? ` — match ${g.seriesGameNumber}` : ""}`,
      siNecessaire ? "(si nécessaire)" : "",
    ].filter(Boolean).join(" · ");

    const detail = [];
    if (g.gamesInSeries) detail.push(`Série au meilleur des ${g.gamesInSeries}.`);
    if (siNecessaire) detail.push("Ce match n'aura lieu que si la série va jusque-là ; sinon il disparaîtra du calendrier.");
    if (tbd) detail.push("L'horaire n'est pas encore annoncé : la journée entière est réservée.");
    const etat = etatDeSerie(matchs, g);
    if (etat) detail.push(etat);
    detail.push("https://slopsauce.github.io/learnbaseball/");

    l.push("BEGIN:VEVENT");
    l.push(`UID:mlb-${g.gamePk}@learnbaseball`);
    l.push(`DTSTAMP:${horodatage(maintenant)}`);
    if (tbd) {
      /* Sur la journee. DTEND est le lendemain : en VALUE=DATE la borne de
         fin est exclusive, et sans elle certains clients etalent
         l'evenement sur deux jours. */
      l.push(`DTSTART;VALUE=DATE:${g.officialDate.replace(/-/g, "")}`);
      l.push(`DTEND;VALUE=DATE:${jourSuivant(g.officialDate).replace(/-/g, "")}`);
    } else {
      // Trois heures et demie : la duree mediane d'un match d'apres-saison.
      const debut = new Date(g.gameDate);
      l.push(`DTSTART:${horodatage(debut)}`);
      l.push(`DTEND:${horodatage(new Date(debut.getTime() + 3.5 * 3600e3))}`);
    }
    l.push(`SUMMARY:${echapper(titre)}`);
    l.push(`DESCRIPTION:${echapper(detail.join("\n"))}`);
    if (g.venue?.name) l.push(`LOCATION:${echapper(g.venue.name)}`);
    l.push(`URL:https://www.mlb.com/gameday/${g.gamePk}`);
    /* Rien n'est confirme tant que l'heure manque ou que le match depend
       d'une serie qui n'ira peut-etre pas jusque-la : les clients grisent
       alors l'evenement, et personne ne pose un jour de conge dessus. */
    l.push(`STATUS:${tbd || siNecessaire ? "TENTATIVE" : "CONFIRMED"}`);
    l.push("END:VEVENT");
  }

  l.push("END:VCALENDAR");
  return l.map(plier).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ *
 *  L'APPEL, quand le script est lance directement
 * ------------------------------------------------------------------ */
export async function recupererApresSaison(saison) {
  const r = await fetch(`${API}/schedule?sportId=1&season=${saison}&gameTypes=${TYPES}&hydrate=team`);
  if (!r.ok) throw new Error(`/schedule a répondu ${r.status}`);
  const d = await r.json();
  return (d.dates || []).flatMap((x) => x.games || []);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFile } = await import("node:fs/promises");
  const sortie = process.argv[2] || "dist/apres-saison.ics";
  /* La saison en cours selon la ligue, et non l'annee du calendrier : en
     novembre et decembre, `seasonId` designe encore la saison qu'on vient
     de finir — celle dont l'apres-saison interesse. */
  const saison = await fetch(`${API}/seasons/current?sportId=1`)
    .then((r) => r.json())
    .then((d) => d.seasons?.[0]?.seasonId)
    .catch(() => null) || String(new Date().getUTCFullYear());

  const matchs = await recupererApresSaison(saison);
  await writeFile(sortie, construireIcal(matchs, { saison }));
  console.log(`${sortie} : ${matchs.length} matchs, saison ${saison}`);
}
