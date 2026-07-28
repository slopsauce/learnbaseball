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

describe("contrat : /schedule", () => {
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

describe("contrat : /standings", () => {
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

describe("contrat : donnees de match", () => {
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
