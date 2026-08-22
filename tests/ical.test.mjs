import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { construireIcal, plier } from "../outils/ical.mjs";
import { icalDUnMatch } from "../src/ical-evenement.js";

/* Un match d'apres-saison, reduit aux champs dont le generateur depend.
   Les valeurs par defaut sont celles du flux tel qu'il est AUJOURD'HUI —
   equipes en jetons, horaire non annonce — parce que c'est l'etat dans
   lequel un abonne decouvre le calendrier. */
const match = (o = {}) => ({
  gamePk: 849851,
  gameType: "F",
  gameDate: "2026-09-29T07:33:00Z",
  officialDate: "2026-09-29",
  description: "AL Wild Card 'B' Game 1",
  seriesGameNumber: 1,
  gamesInSeries: 3,
  ifNecessary: "N",
  status: { startTimeTBD: true, abstractGameState: "Preview" },
  venue: { name: "AL Stadium" },
  teams: {
    away: { team: { name: "AL Wild Card #2", placeholder: true } },
    home: { team: { name: "AL Wild Card #1", placeholder: true } },
  },
  ...o,
});

/* Le meme, mais resolu : equipes reelles, horaire annonce, score. */
const joue = (o = {}) =>
  match({
    gameDate: "2025-10-25T00:08:00Z",
    officialDate: "2025-10-24",
    status: { startTimeTBD: false, abstractGameState: "Final" },
    venue: { name: "Dodger Stadium" },
    teams: {
      away: { team: { teamName: "Blue Jays" }, score: 2 },
      home: { team: { teamName: "Dodgers" }, score: 5 },
    },
    ...o,
  });

const evenements = (ics) => ics.split("BEGIN:VEVENT").slice(1).map((e) => e.split("END:VEVENT")[0]);
const champ = (ev, nom) => {
  // Deplie d'abord : une valeur longue est coupee et reprend par une espace.
  const plat = ev.replace(/\r\n /g, "");
  return new RegExp(`^${nom}(?:;[^:]*)?:(.*)$`, "m").exec(plat)?.[1]?.trim() ?? null;
};

describe("le calendrier de l'après-saison", () => {

  test("la charpente du fichier est celle qu'attend un client", () => {
    const ics = construireIcal([match(), joue({ gamePk: 813024 })], { saison: 2026 });
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
    assert.equal(evenements(ics).length, 2);
    // Les lignes se terminent par CRLF, jamais par un LF seul : la RFC 5545
    // l'exige, et les clients les plus stricts refusent le fichier sinon.
    assert.equal(ics.split("\n").every((l) => l === "" || l.endsWith("\r")), true);
    // Sans intervalle de rafraichissement, un abonnement se recharge au bon
    // vouloir du client — parfois une fois par jour, ce qui est trop lent
    // quand un horaire tombe la veille au soir.
    assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT12H/);
  });

  test("un horaire non annoncé réserve la journée, et pas 7h33 du matin", () => {
    /* Le piege du flux : tant que la ligue n'a pas annonce l'heure,
       `gameDate` porte un bouchon — 07h33 UTC pour les cinquante-trois
       matchs de 2026 — et `startTimeTBD` est le seul champ qui le dise. */
    const [ev] = evenements(construireIcal([match()], { saison: 2026 }));
    assert.match(ev, /DTSTART;VALUE=DATE:20260929/);
    // Borne de fin EXCLUSIVE : au 29, l'evenement s'etalerait sur deux jours.
    assert.match(ev, /DTEND;VALUE=DATE:20260930/);
    assert.equal(champ(ev, "STATUS"), "TENTATIVE");
    assert.match(champ(ev, "DESCRIPTION"), /horaire n'est pas encore annoncé/);
  });

  test("un horaire annoncé donne un événement à l'heure, confirmé", () => {
    const [ev] = evenements(construireIcal([joue()], { saison: 2025 }));
    assert.equal(champ(ev, "DTSTART"), "20251025T000800Z");
    assert.equal(champ(ev, "DTEND"), "20251025T033800Z");
    assert.equal(champ(ev, "STATUS"), "CONFIRMED");
  });

  test("l'identifiant est celui du match, et ne bouge pas", () => {
    /* Tout l'interet de l'abonnement tient a ce fil : quand les jetons
       deviennent des equipes et que l'heure tombe, le client doit METTRE A
       JOUR l'evenement. Un identifiant derive du titre ou de la date en
       empilerait un second a chaque changement. */
    const jeton = construireIcal([match()], { saison: 2026 });
    const resolu = construireIcal(
      [match({ status: { startTimeTBD: false }, gameDate: "2026-09-29T20:08:00Z",
               teams: { away: { team: { teamName: "Guardians" } }, home: { team: { teamName: "Tigers" } } } })],
      { saison: 2026 }
    );
    assert.equal(champ(evenements(jeton)[0], "UID"), "mlb-849851@learnbaseball");
    assert.equal(champ(evenements(resolu)[0], "UID"), "mlb-849851@learnbaseball");
    assert.match(champ(evenements(resolu)[0], "SUMMARY"), /Guardians @ Tigers/);
  });

  test("un match « si nécessaire » est annoncé comme tel, et reste conditionnel", () => {
    const [ev] = evenements(construireIcal([match({ ifNecessary: "Y", seriesGameNumber: 3 })], { saison: 2026 }));
    assert.match(champ(ev, "SUMMARY"), /si nécessaire/);
    assert.match(champ(ev, "DESCRIPTION"), /disparaîtra du calendrier/);
    assert.equal(champ(ev, "STATUS"), "TENTATIVE");
  });

  test("l'état de la série ne compte que les matchs déjà joués AVANT celui-là", () => {
    /* Le defaut trouve sur les donnees reelles de 2025 : en comptant toute
       la serie, le match 2 annoncait « Dodgers mènent 4-3 » — le resultat
       final — et le match 7 annoncait son propre denouement. */
    const serie = [1, 2, 3].map((n) =>
      joue({
        gamePk: 900000 + n,
        description: `World Series Game ${n}`,
        seriesGameNumber: n,
        gamesInSeries: 7,
        teams: {
          away: { team: { teamName: "Blue Jays" }, score: n === 2 ? 5 : 1 },
          home: { team: { teamName: "Dodgers" }, score: n === 2 ? 2 : 4 },
        },
      })
    );
    const [e1, e2, e3] = evenements(construireIcal(serie, { saison: 2025 }));
    assert.doesNotMatch(champ(e1, "DESCRIPTION"), /mènent|égalité/);
    assert.match(champ(e2, "DESCRIPTION"), /Dodgers mènent 1-0/);
    assert.match(champ(e3, "DESCRIPTION"), /Série à égalité 1-1/);
  });

  test("les deux séries de division d'une même ligue ne sont pas confondues", () => {
    /* Elles se jouent en meme temps et portent le meme `seriesDescription` :
       seul le « 'A' » ou « 'B' » de `description` les separe. Et la ligue a
       publie « NLDS 'A' Game 4 » avec une espace finale — sans `trim`, ce
       match formait une serie a lui tout seul, sans etat. */
    const jeux = [
      joue({ gamePk: 1, description: "NLDS 'A' Game 1", seriesGameNumber: 1,
             teams: { away: { team: { teamName: "Cubs" }, score: 3 }, home: { team: { teamName: "Brewers" }, score: 9 } } }),
      joue({ gamePk: 2, description: "NLDS 'B' Game 1", seriesGameNumber: 1,
             teams: { away: { team: { teamName: "Dodgers" }, score: 5 }, home: { team: { teamName: "Phillies" }, score: 3 } } }),
      joue({ gamePk: 3, description: "NLDS 'A' Game 2 ", seriesGameNumber: 2,
             teams: { away: { team: { teamName: "Cubs" }, score: 3 }, home: { team: { teamName: "Brewers" }, score: 7 } } }),
    ];
    const [, , e3] = evenements(construireIcal(jeux, { saison: 2025 }));
    // Le match 2 de la serie 'A' ne connait que la victoire des Brewers,
    // jamais celle des Dodgers dans la serie 'B'.
    assert.match(champ(e3, "DESCRIPTION"), /Brewers mènent 1-0/);
    assert.doesNotMatch(champ(e3, "DESCRIPTION"), /Dodgers/);
  });

  test("les caractères réservés sont échappés", () => {
    const [ev] = evenements(construireIcal(
      [joue({ venue: { name: "Truist Park, Atlanta; Géorgie" } })], { saison: 2025 }
    ));
    // La virgule et le point-virgule separent des valeurs dans une propriete :
    // non echappes, ils coupent le lieu en trois.
    assert.match(ev.replace(/\r\n /g, ""), /LOCATION:Truist Park\\, Atlanta\\; Géorgie/);
  });

  test("les lignes longues sont pliées à 75 octets, sans casser un accent", () => {
    /* Le piege classique du generateur maison : plier a 75 CARACTERES. Un
       « é » en pese deux, et couper au milieu de sa sequence UTF-8 produit
       un fichier que les clients refusent. */
    const long = "DESCRIPTION:" + "é".repeat(200);
    const plie = plier(long);
    for (const l of plie.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75, `ligne de ${Buffer.byteLength(l, "utf8")} octets`);
    // Deplie, on retrouve exactement la ligne de depart.
    assert.equal(plie.replace(/\r\n /g, ""), long);
    // Une ligne courte n'est pas touchee.
    assert.equal(plier("VERSION:2.0"), "VERSION:2.0");
  });

  test("un flux vide reste un calendrier valide", () => {
    // De novembre a septembre, l'apres-saison a venir n'est parfois pas encore
    // publiee : mieux vaut un calendrier vide qu'un fichier tronque.
    const ics = construireIcal([], { saison: 2027 });
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /END:VCALENDAR/);
    assert.equal(evenements(ics).length, 0);
  });
});

/* ------------------------------------------------------------------ *
 *  L'EVENEMENT D'UN SEUL MATCH, telecharge depuis la fiche du programme.
 *  L'entree n'est pas le flux /schedule mais le match tel que le
 *  programme le porte deja — d'ou un jeu de champs different.
 * ------------------------------------------------------------------ */
const duProgramme = (o = {}) => ({
  id: 776413,
  debut: "2026-08-23T00:10:00Z",
  date: "2026-08-22",
  tbd: false,
  ext: "Los Angeles Dodgers",
  dom: "San Diego Padres",
  stade: "Petco Park",
  ville: "San Diego",
  matchSerie: 2,
  totalSerie: 3,
  lanceurExt: "Yoshinobu Yamamoto",
  lanceurDom: "Dylan Cease",
  ...o,
});

describe("l'événement d'un match, depuis sa fiche", () => {

  test("un événement complet, à l'heure, prêt pour un client", () => {
    const ics = icalDUnMatch(duProgramme(), { maintenant: new Date("2026-08-22T10:00:00Z") });
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
    assert.equal(ics.split("\n").every((l) => l === "" || l.endsWith("\r")), true);
    const [ev] = evenements(ics);
    assert.equal(champ(ev, "DTSTART"), "20260823T001000Z");
    // Trois heures : la duree d'un match de saison reguliere, avec marge.
    assert.equal(champ(ev, "DTEND"), "20260823T031000Z");
    assert.match(champ(ev, "SUMMARY"), /Los Angeles Dodgers @ San Diego Padres/);
    assert.match(champ(ev, "LOCATION"), /Petco Park\\, San Diego/);
    assert.match(champ(ev, "DESCRIPTION"), /Match 2 sur 3/);
    assert.match(champ(ev, "DESCRIPTION"), /Yamamoto/);
    assert.equal(champ(ev, "STATUS"), "CONFIRMED");
    // Le meme identifiant stable que l'abonnement : retelecharger le meme
    // match met l'evenement a jour au lieu d'en empiler un second.
    assert.equal(champ(ev, "UID"), "mlb-776413@learnbaseball");
  });

  test("un horaire non annoncé réserve la journée officielle, en tentative", () => {
    /* Le meme piege que l'abonnement : `gameDate` porte une heure bouchon
       tant que la ligue n'a rien annonce, et seul `tbd` le dit. */
    const [ev] = evenements(icalDUnMatch(duProgramme({ tbd: true })));
    assert.match(ev, /DTSTART;VALUE=DATE:20260822/);
    // Borne de fin EXCLUSIVE : au 22, l'evenement s'etalerait sur deux jours.
    assert.match(ev, /DTEND;VALUE=DATE:20260823/);
    assert.equal(champ(ev, "STATUS"), "TENTATIVE");
    assert.match(champ(ev, "DESCRIPTION"), /horaire n'est pas encore annoncé/);
  });

  test("les champs facultatifs manquants ne laissent pas de trou", () => {
    // En debut de fenetre, ni serie ni lanceurs annonces ; parfois pas de ville.
    const [ev] = evenements(icalDUnMatch(duProgramme({
      matchSerie: null, totalSerie: null, lanceurExt: null, lanceurDom: null, ville: null,
    })));
    assert.doesNotMatch(champ(ev, "DESCRIPTION"), /Match|Lanceurs/);
    assert.equal(champ(ev, "LOCATION"), "Petco Park");
    assert.match(champ(ev, "DESCRIPTION"), /mlb\.com\/gameday\/776413/);
  });
});
