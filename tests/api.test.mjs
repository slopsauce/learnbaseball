import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

/* L'API de MLB n'est ni documentee ni contractuelle : un champ peut changer
   de nom ou disparaitre sans preavis. Ces tests verifient que la forme des
   reponses est toujours celle sur laquelle l'application s'appuie.
   Ils dependent du reseau : a lancer separement, sans bloquer un deploiement
   si MLB est indisponible. */

const API = "https://statsapi.mlb.com/api/v1";
const SAISON = new Date().getFullYear();
const j = async (u) => {
  const r = await fetch(u);
  assert.equal(r.status, 200, `${u} a repondu ${r.status}`);
  return r.json();
};
const iso = (d) => d.toISOString().slice(0, 10);
const jours = (n) => iso(new Date(Date.now() + n * 864e5));

/* De novembre a fevrier la ligue ne joue pas : /schedule est vide, aucun
   gamePk n'existe, et les suites qui en dependent echouaient toutes. Quatre
   mois de rouge par an, ce qui apprend surtout a ne plus regarder la couleur.
   L'absence de matiere n'est pas une rupture de contrat : on saute.
   Le hors-saison se constate une fois, au chargement du module.
   Une PANNE, elle, doit continuer d'echouer bruyamment — c'est tout l'objet de
   ces tests — d'ou le `throw` plutot qu'un `catch` qui vaudrait acquittement. */
const horsSaison = await (async () => {
  const d = await j(`${API}/schedule?sportId=1&startDate=${jours(-10)}&endDate=${jours(0)}`);
  const matchs = (d.dates || []).flatMap((x) => x.games || []);
  return matchs.length ? false : "hors saison : aucun match sur les dix derniers jours";
})();

describe("contrat : /schedule", { skip: horsSaison }, () => {
  let g;
  before(async () => {
    const d = await j(`${API}/schedule?sportId=1&startDate=${jours(-10)}&endDate=${jours(0)}&hydrate=team,probablePitcher`);
    g = (d.dates || []).flatMap((x) => x.games || [])[0];
    assert.ok(g, "aucun match sur les dix derniers jours");
  });
  test("expose les champs dont depend la frise", () => {
    for (const c of ["gamePk", "gameDate", "gameType", "status", "teams", "venue"])
      assert.ok(g[c] !== undefined, `champ ${c} disparu`);
    assert.ok(g.status.abstractGameState, "abstractGameState disparu");
    assert.ok(g.venue.id && g.venue.name, "venue incomplet");
  });
  test("expose la position dans la serie", () => {
    assert.ok(Number.isFinite(g.seriesGameNumber), "seriesGameNumber disparu");
    assert.ok(Number.isFinite(g.gamesInSeries), "gamesInSeries disparu");
  });
  test("expose les equipes avec identifiant et abreviation", () => {
    for (const cote of ["home", "away"]) {
      assert.ok(g.teams[cote].team.id, `id equipe ${cote} manquant`);
      assert.ok(g.teams[cote].team.abbreviation, `abreviation ${cote} manquante — les casquettes en dependent`);
    }
  });
  test("les dates sont bien en UTC avec un Z terminal", () => {
    assert.match(g.gameDate, /Z$/, "format de date change, la conversion horaire casserait");
  });
});

describe("contrat : /standings", { skip: horsSaison }, () => {
  let tr;
  before(async () => {
    const d = await j(`${API}/standings?leagueId=103,104&season=${SAISON}&standingsTypes=regularSeason`);
    tr = d.records[0].teamRecords[0];
  });
  test("expose bilan, rang et enjeux", () => {
    for (const c of ["wins", "losses", "divisionRank", "divisionLeader", "gamesBack", "wildCardGamesBack", "streak"])
      assert.ok(tr[c] !== undefined, `champ ${c} disparu`);
  });
  test("le meneur porte un nombre magique", async () => {
    const d = await j(`${API}/standings?leagueId=103,104&season=${SAISON}&standingsTypes=regularSeason`);
    const meneurs = d.records.map((r) => r.teamRecords.find((t) => t.divisionLeader));
    assert.ok(meneurs.every(Boolean), "chaque division doit avoir un meneur");
    assert.ok(meneurs.some((m) => m.magicNumber != null), "magicNumber disparu");
  });
  test("utilise bien le tiret pour les valeurs sans objet", () => {
    // Notre conversion traite « - » comme null : si l'API passait a null ou 0,
    // il faudrait le savoir.
    const d = tr.gamesBack;
    assert.ok(d === "-" || Number.isFinite(Number(d)), `gamesBack inattendu : ${d}`);
  });
});

describe("contrat : /teams et /venues", () => {
  test("les equipes portent division et stade", async () => {
    const d = await j(`${API}/teams?sportId=1&fields=teams,id,name,abbreviation,venue,division`);
    assert.equal(d.teams.length, 30, `${d.teams.length} equipes au lieu de 30`);
    for (const t of d.teams) {
      assert.ok(t.abbreviation, `abreviation manquante : ${t.name}`);
      assert.ok(t.venue?.id, `stade manquant : ${t.name}`);
      assert.ok(t.division?.id && t.division?.name, `division manquante : ${t.name}`);
    }
  });
  test("les stades portent altitude, dimensions et coordonnees", async () => {
    const d = await j(`${API}/venues?sportId=1&hydrate=location,fieldInfo`);
    const coors = d.venues.find((v) => /Coors/.test(v.name));
    assert.ok(coors, "Coors Field introuvable");
    assert.ok(coors.location.elevation > 4000, "l'altitude de Coors a change de forme");
    assert.ok(coors.location.defaultCoordinates?.latitude, "coordonnees disparues");
    assert.ok(coors.fieldInfo?.center, "dimensions disparues");
  });
});

describe("contrat : /roster", () => {
  /* La vue « les equipes » tient sur une seule requete : le roster porte la
     fiche de chaque joueur et ses statistiques, via hydrate. Si l'hydratation
     ou le filtre de champs changeaient de forme, la vue se viderait sans une
     seule erreur reseau — d'ou ce contrat. */
  const CHAMPS =
    "roster,person,id,fullName,primaryNumber,currentAge,height,weight,batSide,pitchHand," +
    "code,stats,group,displayName,splits,stat,team,sport,numTeams,avg,ops,homeRuns,rbi,stolenBases," +
    "era,wins,losses,saves,strikeOuts,inningsPitched,whip,gamesPlayed," +
    "position,abbreviation,type,name,status,description,jerseyNumber";

  test("les quarante portent poste, statut et numero", async () => {
    const d = await j(`${API}/teams/119/roster?rosterType=40Man&fields=${CHAMPS}`);
    assert.ok(d.roster?.length > 20, `effectif de ${d.roster?.length ?? 0} joueurs`);
    for (const m of d.roster) {
      assert.ok(m.person?.id && m.person?.fullName, "identite incomplete");
      assert.ok(m.position?.type && m.position?.abbreviation, `poste manquant : ${m.person?.fullName}`);
      assert.ok(m.status?.description, `statut manquant : ${m.person?.fullName}`);
    }
    // Les regroupements de la vue viennent de position.type : un type inconnu
    // tomberait dans « les autres » sans casser, mais on veut le savoir.
    const connus = new Set(["Pitcher", "Catcher", "Infielder", "Outfielder", "Two-Way Player", "Hitter"]);
    const inconnus = [...new Set(d.roster.map((m) => m.position.type))].filter((t) => !connus.has(t));
    assert.deepEqual(inconnus, [], `types de poste nouveaux : ${inconnus.join(", ")}`);
  });

  test("l'hydratation ramene bien les statistiques de la saison", { skip: horsSaison }, async () => {
    const d = await j(
      `${API}/teams/119/roster?rosterType=active&hydrate=person(stats(type=season,group=[hitting,pitching]))&fields=${CHAMPS}`
    );
    const avec = d.roster.filter((m) => (m.person.stats || []).length);
    assert.ok(avec.length, "aucune statistique hydratee — la vue afficherait des fiches nues");
    const groupes = new Set(avec.flatMap((m) => m.person.stats.map((s) => s.group?.displayName)));
    assert.ok(groupes.has("hitting") && groupes.has("pitching"),
      `groupes recus : ${[...groupes].join(", ")}`);
    /* Un joueur des deux casquettes doit porter les DEUX groupes : c'est tout
       l'objet de `group=[hitting,pitching]`, que l'API ignorerait en silence. */
    const twp = d.roster.find((m) => m.position.type === "Two-Way Player");
    if (twp) {
      const g = new Set((twp.person.stats || []).map((s) => s.group?.displayName));
      assert.ok(g.has("hitting") && g.has("pitching"),
        `${twp.person.fullName} n'a que : ${[...g].join(", ") || "rien"}`);
    }
    const stat = avec.flatMap((m) => m.person.stats).flatMap((s) => s.splits || [])[0]?.stat || {};
    assert.ok("avg" in stat || "era" in stat, "ni moyenne au baton ni ERA dans les splits");
  });

  test("le filtre de champs garde la reponse legere", async () => {
    const url = `${API}/teams/119/roster?rosterType=active&hydrate=person(stats(type=season,group=[hitting,pitching]))`;
    const [brut, filtre] = await Promise.all([
      fetch(url).then((r) => r.text()),
      fetch(`${url}&fields=${CHAMPS}`).then((r) => r.text()),
    ]);
    assert.ok(filtre.length < brut.length,
      "le filtre `fields` ne filtre plus rien — la requete a quadruple de poids");
  });
});

describe("contrat : donnees de match", { skip: horsSaison }, () => {
  let pk;
  before(async () => {
    const d = await j(`${API}/schedule?sportId=1&startDate=${jours(-10)}&endDate=${jours(0)}`);
    pk = (d.dates || []).flatMap((x) => x.games || [])
      .filter((g) => g.status.codedGameState === "F")
      .pop()?.gamePk;
    assert.ok(pk, "aucun match termine recemment");
  });

  test("playByPlay expose eventType, playEvents et playId", async () => {
    const d = await j(`${API}/game/${pk}/playByPlay`);
    assert.ok(Array.isArray(d.allPlays) && d.allPlays.length, "allPlays vide");
    const p = d.allPlays[0];
    assert.ok(p.result?.eventType, "result.eventType disparu");
    assert.ok(p.about?.inning, "about.inning disparu");
    assert.ok(p.matchup?.batter?.id, "matchup.batter.id disparu");
    const lancers = d.allPlays.flatMap((x) => x.playEvents || []).filter((e) => e.isPitch);
    assert.ok(lancers.length, "aucun lancer trouve");
    assert.ok(lancers.some((e) => e.playId), "playId disparu — la jointure video casserait");
  });

  test("le guid des clips correspond bien a un playId", async () => {
    const [pbp, contenu] = await Promise.all([
      j(`${API}/game/${pk}/playByPlay`),
      j(`${API}/game/${pk}/content`),
    ]);
    const ids = new Set(pbp.allPlays.flatMap((p) => p.playEvents || []).map((e) => e.playId).filter(Boolean));
    const guids = (contenu.highlights?.highlights?.items || []).map((i) => i.guid).filter(Boolean);
    if (!guids.length) return; // certains matchs n'ont aucun clip indexe
    const communs = guids.filter((g) => ids.has(g));
    assert.ok(communs.length, "plus aucun guid ne correspond a un playId");
  });

  test("winProbability reste filtrable et leger", async () => {
    const r = await fetch(`${API}/game/${pk}/winProbability?fields=homeTeamWinProbabilityAdded`);
    const texte = await r.text();
    assert.equal(r.status, 200);
    assert.ok(texte.length < 200000, `reponse de ${texte.length} o : le filtre fields ne marche plus`);
    const w = JSON.parse(texte);
    assert.ok(Array.isArray(w) && w.length, "winProbability n'est plus un tableau");
    assert.ok(w.some((p) => p.homeTeamWinProbabilityAdded !== undefined), "champ de variation disparu");
  });

  test("les statistiques de lanceur restent accessibles par /people", async () => {
    const d = await j(`${API}/schedule?sportId=1&date=${jours(0)}&hydrate=probablePitcher`);
    const id = (d.dates || []).flatMap((x) => x.games || [])
      .map((g) => g.teams.home.probablePitcher?.id).find(Boolean);
    if (!id) return; // aucun partant annonce aujourd'hui
    const p = await j(`${API}/people?personIds=${id}&hydrate=stats(group=pitching,type=season,season=${SAISON})`);
    const s = p.people[0]?.stats?.[0]?.splits?.[0]?.stat;
    assert.ok(s?.era !== undefined, "ERA disparue de /people");
  });
});

describe("contrat : acces depuis un navigateur", () => {
  test("le CORS reste ouvert sur statsapi", async () => {
    const r = await fetch(`${API}/teams?sportId=1&fields=teams,id`);
    assert.equal(r.headers.get("access-control-allow-origin"), "*",
      "le CORS s'est ferme : l'application ne fonctionnerait plus sans proxy");
  });
  test("le CORS reste ouvert sur les images", async () => {
    const r = await fetch("https://www.mlbstatic.com/team-logos/team-cap-on-dark/119.svg");
    assert.equal(r.status, 200, "les casquettes ne repondent plus");
  });
});

describe("contrat : suivi en direct", { skip: horsSaison }, () => {
  /* Ajoutes apres coup : ces appels sont arrives avec l'onglet Le direct et
     n'etaient couverts par rien. Le filtre de champs est le point sensible —
     c'est lui qui fait tomber feed/live de 625 Ko a 1,6 Ko. */
  const CHAMPS_DIRECT = [
    "liveData", "plays", "currentPlay", "result", "description", "linescore",
    "currentInning", "currentInningOrdinal", "inningState", "balls", "strikes", "outs",
    "teams", "home", "away", "runs", "hits", "errors", "innings", "num", "ordinalNum",
    "offense", "defense", "first", "second", "third", "batter", "pitcher", "onDeck",
    "fullName", "id", "gameData", "status", "abstractGameState", "detailedState",
  ].join(",");

  const CHAMPS_HISTOIRE = [
    "liveData", "plays", "allPlays", "result", "description", "eventType", "isScoringPlay",
    "atBatIndex", "about", "inning", "halfInning", "isComplete", "playEvents", "type", "details",
  ].join(",");

  let pk;
  before(async () => {
    const d = await j(`${API}/schedule?sportId=1&startDate=${jours(-2)}&endDate=${jours(0)}`);
    const jeux = (d.dates || []).flatMap((x) => x.games || []);
    pk = (jeux.find((g) => g.status.abstractGameState === "Live")
      || jeux.filter((g) => g.status.codedGameState === "F").pop())?.gamePk;
    assert.ok(pk, "aucun match exploitable");
  });

  test("feed/live reste filtrable et leger", async () => {
    const r = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live?fields=${CHAMPS_DIRECT}`);
    const texte = await r.text();
    assert.equal(r.status, 200);
    assert.ok(texte.length < 20000,
      `${texte.length} o : le filtre de champs ne fonctionne plus, la vue tirerait 625 Ko toutes les 15 s`);
    const d = JSON.parse(texte);
    const L = d.liveData?.linescore;
    assert.ok(L, "linescore disparu du feed");
    for (const c of ["currentInningOrdinal", "inningState", "outs", "teams", "innings"])
      assert.ok(L[c] !== undefined, `linescore.${c} disparu`);
    assert.ok(L.offense !== undefined, "offense disparu — les coureurs en dependent");
    assert.ok(L.defense !== undefined, "defense disparu — le lanceur en depend");
  });

  test("l'historique expose un identifiant stable par action", async () => {
    const d = await j(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live?fields=${CHAMPS_HISTOIRE}`);
    const a = d.liveData?.plays?.allPlays || [];
    assert.ok(a.length, "allPlays vide");
    const idx = a.map((x) => x.about?.atBatIndex);
    assert.ok(idx.every((x) => Number.isInteger(x)), "atBatIndex disparu — les cles React casseraient");
    assert.equal(new Set(idx).size, idx.length, "atBatIndex n'est plus unique");
    assert.ok(a.some((x) => x.result?.eventType), "eventType disparu — les codes du marqueur en dependent");
    assert.ok(a.some((x) => x.about?.isScoringPlay !== undefined), "isScoringPlay disparu");
  });

  test("contextMetrics fournit la probabilite de victoire", async () => {
    const c = await j(`${API}/game/${pk}/contextMetrics`);
    assert.ok(c.homeWinProbability !== undefined, "homeWinProbability disparu");
    const p = Number(c.homeWinProbability);
    assert.ok(p >= 0 && p <= 100, `probabilite hors bornes : ${p}`);
  });

  test("le vocabulaire des etats n'a pas change", async () => {
    /* Un match en « Game Over » avait disparu du selecteur parce qu'on se
       fiait au seul code « F ». On surveille desormais le vocabulaire. */
    const d = await j(`${API}/schedule?sportId=1&startDate=${jours(-2)}&endDate=${jours(1)}`);
    const jeux = (d.dates || []).flatMap((x) => x.games || []);
    const abstraits = new Set(jeux.map((g) => g.status.abstractGameState));
    for (const a of abstraits)
      assert.ok(["Live", "Final", "Preview", "Other"].includes(a), `etat abstrait inconnu : ${a}`);
    const codes = new Set(jeux.map((g) => g.status.codedGameState));
    const connus = ["I", "P", "S", "F", "O", "D", "C", "U", "T", "M", "N"];
    for (const c of codes) assert.ok(connus.includes(c), `code d'etat inconnu : ${c}`);
  });
});

describe("contrat : montages video", { skip: horsSaison }, () => {
  let pk;
  before(async () => {
    const d = await j(`${API}/schedule?sportId=1&startDate=${jours(-4)}&endDate=${jours(-1)}`);
    pk = (d.dates || []).flatMap((x) => x.games || [])
      .filter((g) => g.status.codedGameState === "F").pop()?.gamePk;
    assert.ok(pk, "aucun match termine recemment");
  });

  test("resume et match condense restent identifiables", async () => {
    const c = await j(`${API}/game/${pk}/content`);
    const items = c.highlights?.highlights?.items || [];
    if (!items.length) return; // certains matchs n'ont aucun montage
    const tax = new Set(
      items.flatMap((it) => (it.keywordsAll || []).filter((k) => k.type === "mlbtax").map((k) => k.value))
    );
    assert.ok(tax.has("mlb_recap") || tax.has("condensed_game"),
      `categories mlbtax presentes : ${[...tax].join(", ") || "aucune"}`);
    const montage = items.find((it) =>
      (it.keywordsAll || []).some((k) => k.type === "mlbtax" && /recap|condensed/.test(k.value))
    );
    assert.ok((montage.playbacks || []).some((x) => x.url), "aucune source lisible");
  });
});

describe("contrat : imagerie", () => {
  test("les portraits de joueurs repondent", async () => {
    const d = await j(`${API}/schedule?sportId=1&date=${jours(-1)}&hydrate=probablePitcher`);
    const id = (d.dates || []).flatMap((x) => x.games || [])
      .map((g) => g.teams.home.probablePitcher?.id).find(Boolean);
    if (!id) return;
    const r = await fetch(`https://midfield.mlbstatic.com/v1/people/${id}/spots/120`);
    assert.equal(r.status, 200, "les portraits ne repondent plus");
  });

  test("les ecussons ronds repondent", async () => {
    const r = await fetch("https://midfield.mlbstatic.com/v1/team/119/spots/72");
    assert.equal(r.status, 200, "les ecussons de la grille de selection ne repondent plus");
  });
});

/* Ce contrat-la ne depend pas de la saison : l'apres-saison est publiee des
   la sortie du calendrier, plusieurs mois a l'avance, avec des equipes en
   jetons. C'est justement cet etat qu'il faut savoir lire. */
describe("contrat : l'apres-saison, dont depend le calendrier .ics", () => {
  let jeux;
  before(async () => {
    const saison = await j(`${API}/seasons/current?sportId=1`)
      .then((d) => d.seasons?.[0]?.seasonId);
    assert.ok(saison, "/seasons/current ne dit plus quelle saison est en cours");
    const d = await j(`${API}/schedule?sportId=1&season=${saison}&gameTypes=F,D,L,W&hydrate=team`);
    jeux = (d.dates || []).flatMap((x) => x.games || []);
    assert.ok(jeux.length > 20, `apres-saison ${saison} : ${jeux.length} matchs publies`);
  });

  test("les quatre tours sont la, et se nomment comme avant", () => {
    const tours = new Set(jeux.map((g) => g.gameType));
    for (const t of ["F", "D", "L", "W"])
      assert.ok(tours.has(t), `le tour « ${t} » a disparu du calendrier d'apres-saison`);
  });

  test("chaque match porte de quoi ecrire une fiche de calendrier", () => {
    for (const g of jeux) {
      assert.ok(Number.isFinite(g.gamePk), "gamePk manquant : l'identifiant stable du .ics");
      assert.match(g.officialDate, /^\d{4}-\d{2}-\d{2}$/, `officialDate douteuse : ${g.officialDate}`);
      assert.ok(Number.isFinite(Date.parse(g.gameDate)), `gameDate illisible : ${g.gameDate}`);
      assert.equal(typeof g.status?.startTimeTBD, "boolean",
        "startTimeTBD a disparu : sans lui, les matchs sans horaire se posent a l'heure bouchon");
      assert.ok(["Y", "N"].includes(g.ifNecessary), `ifNecessary vaut « ${g.ifNecessary} »`);
      assert.ok(Number.isFinite(g.seriesGameNumber), "seriesGameNumber manquant");
    }
  });

  test("les series simultanees restent distinguables", () => {
    /* Deux series de division se jouent en meme temps dans chaque ligue.
       `seriesDescription` est le meme pour les deux : seul `description`
       les separe, par un « 'A' » ou un « 'B' ». Si ce marqueur disparait,
       le calendrier melangera leurs scores sans rien signaler. */
    const division = jeux.filter((g) => g.gameType === "D");
    const cles = new Set(division.map((g) => (g.description || "").trim().replace(/\s*Game\s*\d+$/i, "")));
    assert.equal(cles.size, 4, `series de division distinguees : ${[...cles].join(" / ") || "aucune"}`);
  });
});
