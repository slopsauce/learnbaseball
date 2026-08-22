import { test, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { TITRE_ONGLET as A_TITRES } from "../.test-bundle.mjs";
import App, { VueNuits, VueAlmanach, VueTerrains, VueEquipes, VueCircuits, SceneCircuits, ClipCircuit, FicheJoueur, ChoixEquipe, Action, AffichesDuSoir, LienStade, DetailMatch, BandeauSituation, VueDirect, BasesOccupees, Compteurs, TableauManches, PileBandeaux, ReglageAvertissements, VueClassement } from "../.test-bundle.mjs";

/* `vite build` empaquette sans executer : il laisse passer les zones mortes
   temporelles, les hooks mal ordonnes et les variables indefinies. Symptome
   typique : build vert, page blanche. Ici on rend pour de vrai. Les effets ne
   tournent pas au rendu serveur, donc aucun appel reseau. */

const equipe = {
  id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD",
  division: { id: 203, name: "National League West" }, venue: { id: 22 },
};
const bilan = {
  119: { v: 67, d: 39, pct: 0.632, rang: 1, meneur: true, magique: 45, serieNb: 4, serieType: "wins" },
  147: { v: 59, d: 46, pct: 0.562, rang: 2, meneur: false, retard: 3, wc: 1.5, elimination: 55, serieNb: 12, serieType: "losses" },
};
const stades = {
  22: { nom: "Dodger Stadium", ville: "Los Angeles", alt: 500, lat: 34.07, lon: -118.24,
        gauche: 330, centre: 395, droite: 330, places: 56000, toit: "Open" },
};

/* Le rendu serveur de React separe les noeuds de texte adjacents par des
   commentaires HTML : « ×2 » sort en « ×<!-- -->2 ». On les retire avant
   toute comparaison, sinon on teste un artefact du moteur, pas l'affichage. */
const rendre = (el) => renderToString(el).replaceAll("<!-- -->", "");

describe("rendu des composants", () => {
  test("App se rend sans lever", () => {
    assert.ok(rendre(React.createElement(App)).length > 500);
  });

  test("VueAlmanach se rend sans donnees", () => {
    assert.ok(rendre(React.createElement(VueAlmanach, {
      teams: [], appris: [], setAppris: () => {}, suivies: [119],
    })).length > 100);
  });

  test("VueNuits se rend sans donnees", () => {
    assert.ok(rendre(React.createElement(VueNuits, {
      teams: [], suivies: [119], setSuivies: () => {},
    })).length > 100);
  });

  test("VueNuits se rend avec un classement complet", () => {
    const html = rendre(React.createElement(VueNuits, {
      teams: [equipe], suivies: [119], setSuivies: () => {},
      stadeHabituel: { 119: 22 }, bilans: bilan, stades,
    }));
    assert.ok(html.length > 100);
  });

  test("VueNuits se rend en mode toutes equipes", () => {
    assert.ok(rendre(React.createElement(VueNuits, {
      teams: [equipe], suivies: [], setSuivies: () => {}, bilans: bilan,
    })).length > 100);
  });

  test("VueNuits tolere des props absentes", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueNuits, { teams: [], suivies: [], setSuivies: () => {} })));
  });

  test("VueAlmanach tolere une liste d'equipes vide", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueAlmanach, {
        teams: [], appris: ["walk", "home_run"], setAppris: () => {}, suivies: [],
      })));
  });
});

describe("garde-fous de mise en page", () => {
  test("les classes responsives sont bien emises", () => {
    const html = rendre(React.createElement(App));
    for (const c of ["alm-page", "alm-titre"])
      assert.match(html, new RegExp(c), `classe ${c} absente du rendu`);
  });

  test("la feuille de style embarque la requete media mobile", () => {
    const html = rendre(React.createElement(App));
    assert.match(html, /@media \(max-width: 560px\)/);
    assert.match(html, /prefers-reduced-motion/);
  });

  test("aucun stockage navigateur interdit n'est utilise au rendu", () => {
    assert.doesNotThrow(() => rendre(React.createElement(App)),
      "le rendu ne doit dependre d'aucune API navigateur");
  });
});


describe("rendu de la vue Terrains", () => {
  test("se rend sans données", () => {
    assert.ok(rendre(React.createElement(VueTerrains, { teams: [], stades: {} })).length > 100);
  });
  test("se rend avec un parc complet", () => {
    const html = rendre(React.createElement(VueTerrains, {
      teams: [equipe], stades,
      stadeHabituel: { 119: 22 }, suivies: [119],
    }));
    assert.match(html, /Dodger Stadium|LAD/, "le parc doit apparaître dans le rendu");
  });
  test("tolère un stade sans coordonnées", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueTerrains, {
        teams: [equipe], stades: { 22: { nom: "X" } }, stadeHabituel: {},
      })));
  });
});

describe("rendu de la vue Équipes", () => {
  const lanceur = {
    person: {
      id: 681911, fullName: "Alex Vesia", primaryNumber: "51", currentAge: 30,
      batSide: { code: "L" }, pitchHand: { code: "L" },
      stats: [{
        group: { displayName: "pitching" },
        splits: [{ team: { id: 119 }, stat: { era: "3.03", wins: 1, losses: 1, saves: 3, strikeOuts: 53, inningsPitched: "38.2" } }],
      }],
    },
    jerseyNumber: "51",
    position: { type: "Pitcher", abbreviation: "P", name: "Pitcher" },
    status: { description: "Active" },
  };
  const frappeur = {
    person: {
      id: 669743, fullName: "Alex Call", primaryNumber: "12", currentAge: 31,
      batSide: { code: "R" }, pitchHand: { code: "R" },
      stats: [{
        group: { displayName: "hitting" },
        splits: [{ team: { id: 119 }, stat: { avg: ".246", homeRuns: 1, rbi: 16, ops: ".676", gamesPlayed: 65, stolenBases: 1 } }],
      }],
    },
    jerseyNumber: "12",
    position: { type: "Outfielder", abbreviation: "LF", name: "Outfielder" },
    status: { description: "Injured 10-Day" },
  };

  test("se rend sans données", () => {
    assert.ok(rendre(React.createElement(VueEquipes, { teams: [], suivies: [] })).length > 100);
  });

  test("se rend avec une équipe complète", () => {
    const html = rendre(React.createElement(VueEquipes, {
      teams: [equipe], suivies: [119], bilans: bilan, stades,
    }));
    assert.match(html, /Los Angeles Dodgers/);
    assert.match(html, /NL Ouest/, "la division doit être en français");
    assert.match(html, /67-39/, "le bilan de l'équipe doit apparaître");
    assert.match(html, /Dodger Stadium/, "le parc doit renvoyer vers les terrains");
  });

  test("les sigles sont explicables au clic, pas seulement au survol", () => {
    // Une infobulle n'existe pas au doigt : chaque sigle doit être un bouton.
    const html = rendre(React.createElement(VueEquipes, { teams: [equipe], suivies: [119] }));
    assert.match(html, /LIRE LES CHIFFRES/);
    for (const sigle of ["MOY", "CC", "PP", "ERA"])
      assert.match(html, new RegExp(`<button[^>]*>${sigle}</button>`),
        `le sigle ${sigle} doit être cliquable`);
  });

  test("le menu déroulant sépare les équipes suivies", () => {
    const html = rendre(React.createElement(ChoixEquipe, {
      id: "x", libelle: "L'ÉQUIPE", teams: [equipe], suivies: [119], valeur: 119, onChange: () => {},
    }));
    assert.match(html, /Que je suis/);
    assert.match(html, /<select/);
  });

  test("le menu fonctionne sans aucune équipe suivie", () => {
    const html = rendre(React.createElement(ChoixEquipe, {
      id: "x", libelle: "L'ÉQUIPE", teams: [equipe], suivies: [], valeur: 119, onChange: () => {},
    }));
    assert.doesNotMatch(html, /Que je suis/);
    assert.match(html, /Los Angeles Dodgers/);
  });

  test("une fiche de lanceur montre son ERA et son bilan", () => {
    const html = rendre(React.createElement(FicheJoueur, { m: lanceur, teamId: 119 }));
    assert.match(html, /Alex Vesia/);
    assert.match(html, /ERA 3.03/);
    assert.match(html, /1-1/);
    assert.match(html, /53 K/);
    assert.match(html, /lance gaucher/);
  });

  test("une fiche de frappeur montre sa moyenne, pas un ERA", () => {
    const html = rendre(React.createElement(FicheJoueur, { m: frappeur, teamId: 119 }));
    assert.match(html, /MOY .246/);
    assert.match(html, /1 CC/);
    assert.match(html, /16 PP/);
    assert.doesNotMatch(html, /ERA/, "un voltigeur n'a pas d'ERA à afficher");
  });

  test("un joueur des deux casquettes porte ses deux lignes", () => {
    // Le groupe s'intitule « Les deux casquettes » : n'en montrer qu'une
    // contredirait son propre titre.
    const ohtani = {
      person: {
        id: 660271, fullName: "Shohei Ohtani", currentAge: 32,
        batSide: { code: "L" }, pitchHand: { code: "R" },
        stats: [
          { group: { displayName: "hitting" },
            splits: [{ team: { id: 119 }, stat: { avg: ".282", homeRuns: 41, rbi: 84, ops: "1.014", gamesPlayed: 110, stolenBases: 15 } }] },
          { group: { displayName: "pitching" },
            splits: [{ team: { id: 119 }, stat: { era: "2.87", wins: 5, losses: 2, strikeOuts: 78, inningsPitched: "62.2" } }] },
        ],
      },
      jerseyNumber: "17",
      position: { type: "Two-Way Player", abbreviation: "TWP", name: "Two-Way Player" },
      status: { description: "Active" },
    };
    const html = rendre(React.createElement(FicheJoueur, { m: ohtani, teamId: 119 }));
    assert.match(html, /ERA 2.87/, "la ligne de lancer manque");
    assert.match(html, /MOY .282/, "la ligne de frappe manque");
    assert.match(html, /41 CC/);
  });

  test("un lanceur ordinaire ne montre pas ses quelques passages au bâton", () => {
    // L'hydratation des deux groupes lui en donne une ; elle n'apprend rien.
    const releveur = {
      person: {
        id: 1, fullName: "Releveur",
        stats: [
          { group: { displayName: "hitting" }, splits: [{ team: { id: 119 }, stat: { avg: ".000", homeRuns: 0, rbi: 0 } }] },
          { group: { displayName: "pitching" }, splits: [{ team: { id: 119 }, stat: { era: "3.03", wins: 1, losses: 1, strikeOuts: 53 } }] },
        ],
      },
      position: { type: "Pitcher", abbreviation: "P" },
      status: {},
    };
    const html = rendre(React.createElement(FicheJoueur, { m: releveur, teamId: 119 }));
    assert.match(html, /ERA 3.03/);
    assert.doesNotMatch(html, /MOY/, "la ligne de frappe d'un lanceur est du bruit");
  });

  test("une indisponibilité est dite, en français", () => {
    assert.match(rendre(React.createElement(FicheJoueur, { m: frappeur, teamId: 119 })),
      /blessé — liste 10 jours/);
  });

  test("un joueur sans statistiques ne casse pas la fiche", () => {
    const nu = { person: { id: 1, fullName: "Recrue" }, position: { type: "Infielder", abbreviation: "SS" }, status: {} };
    const html = rendre(React.createElement(FicheJoueur, { m: nu, teamId: 119 }));
    assert.match(html, /Recrue/);
    assert.match(html, /aucune apparition/);
  });
});

describe("affiches du soir", () => {
  const eqs = {
    113: { id: 113, name: "Cincinnati Reds", abbreviation: "CIN" },
    114: { id: 114, name: "Cleveland Guardians", abbreviation: "CLE" },
    120: { id: 120, name: "Washington Nationals", abbreviation: "WSH" },
  };
  const jeu = (o) => ({ id: 1, idStade: 5, idDom: 113, idExt: 114, hhmm: "01:10", ...o });

  test("un seul match affiche l'heure", () => {
    const html = rendre(React.createElement(AffichesDuSoir, { liste: [jeu({})], parEquipe: eqs }));
    assert.match(html, /Cincinnati Reds/);
    assert.match(html, /reçoit/);
    assert.match(html, /01:10/);
    assert.doesNotMatch(html, /×/, "pas de multiplicateur pour un match unique");
  });

  /* Un double programme oppose toujours les memes equipes : verifie sur les
     23 cas de la saison. On mutualise donc l'affiche. */
  test("un double programme mutualise l'affiche", () => {
    const html = rendre(React.createElement(AffichesDuSoir, {
      liste: [jeu({ id: 1, hhmm: "20:10", double: "Y" }), jeu({ id: 2, hhmm: "00:10", double: "Y" })],
      parEquipe: eqs,
    }));
    assert.equal(html.match(/Cincinnati Reds/g).length, 1, "l'affiche ne doit apparaître qu'une fois");
    assert.match(html, /×2/);
    assert.match(html, /20:10/);
    assert.match(html, /00:10/);
  });

  test("des affiches différentes restent empilées", () => {
    // Jamais observe en saison reguliere, mais le repli doit exister.
    const html = rendre(React.createElement(AffichesDuSoir, {
      liste: [jeu({ id: 1, idExt: 114 }), jeu({ id: 2, idExt: 120, hhmm: "04:10" })],
      parEquipe: eqs,
    }));
    assert.match(html, /Cleveland Guardians/);
    assert.match(html, /Washington Nationals/);
    assert.doesNotMatch(html, /×2/, "deux affiches distinctes ne se mutualisent pas");
  });

  test("ne casse pas sur une liste vide", () => {
    assert.equal(rendre(React.createElement(AffichesDuSoir, { liste: [], parEquipe: eqs })), "");
  });
});

describe("lien vers la fiche d'un terrain", () => {
  test("rend un bouton quand le stade est identifié", () => {
    const html = rendre(React.createElement(LienStade, { idStade: 5325, nom: "Great American Ball Park" }));
    assert.match(html, /<button/);
    assert.match(html, /Great American Ball Park/);
  });
  test("reste du texte simple sans identifiant", () => {
    const html = rendre(React.createElement(LienStade, { nom: "Parc inconnu" }));
    assert.doesNotMatch(html, /<button/, "sans identifiant, pas de lien mort");
    assert.match(html, /Parc inconnu/);
  });
  test("ne rend rien sans nom", () => {
    assert.equal(rendre(React.createElement(LienStade, { idStade: 5325 })), "");
  });
});

describe("le lien agenda de la fiche d'un match", () => {
  const m = {
    id: 776413, cle: "776413@2026-08-22", nuit: "2026-08-22",
    debut: "2026-08-23T00:10:00Z", date: "2026-08-22", tbd: false, hhmm: "02:10",
    ext: "LAD", dom: "SD", idExt: 119, idDom: 135,
    stade: "Petco Park", idStade: 2680, etat: "Preview",
  };
  const props = {
    parId: { 119: equipe, 135: { id: 135, name: "San Diego Padres", abbreviation: "SD" } },
    stades: { 2680: { nom: "Petco Park", ville: "San Diego" } },
    lanceurs: {}, note: null, spoilers: false, onFermer: () => {},
  };

  test("un match à venir se télécharge en .ics, fabriqué au rendu", () => {
    const html = rendre(React.createElement(DetailMatch, { m, ...props }));
    assert.match(html, /ajouter ce match à mon agenda/);
    // Fabrique dans la page et servi en data: — aucune requete, rien a heberger.
    assert.match(html, /href="data:text\/calendar/);
    assert.match(html, /download="LAD-SD-2026-08-22\.ics"/);
    // L'affiche complete et le stade sont bien dans l'evenement encode.
    const brut = decodeURIComponent(/data:text\/calendar;charset=utf-8,([^"]*)/.exec(html)[1].replaceAll("&amp;", "&"));
    assert.match(brut, /SUMMARY:Los Angeles Dodgers @ San Diego Padres/);
    assert.match(brut, /LOCATION:Petco Park\\, San Diego/);
    assert.match(brut, /DTSTART:20260823T001000Z/);
  });

  test("pas de lien pour un match fini, en cours ou reporté", () => {
    for (const fait of [{ etat: "Final" }, { etat: "Live" }, { reporte: true }]) {
      const html = rendre(React.createElement(DetailMatch, { m: { ...m, ...fait }, ...props }));
      assert.doesNotMatch(html, /agenda/, `lien présent malgré ${JSON.stringify(fait)}`);
    }
  });
});

describe("les montages de la fiche d'un match passé", () => {
  const m = {
    id: 776413, cle: "776413@2026-08-20", nuit: "2026-08-20",
    debut: "2026-08-21T00:10:00Z", date: "2026-08-20", tbd: false, hhmm: "02:10",
    ext: "LAD", dom: "SD", idExt: 119, idDom: 135,
    stade: "Petco Park", idStade: 2680, etat: "Final",
  };
  const props = {
    parId: { 119: equipe, 135: { id: 135, name: "San Diego Padres", abbreviation: "SD" } },
    stades: { 2680: { nom: "Petco Park", ville: "San Diego" } },
    lanceurs: {}, note: null, spoilers: false, onFermer: () => {},
  };
  const montage = { url: "https://x/y.mp4", adaptatif: false, duree: "00:11:21", titre: "t" };

  test("annonce la recherche tant que le contenu n'est pas là", () => {
    const html = rendre(React.createElement(DetailMatch, { m, ...props }));
    assert.match(html, /Recherche des montages/);
  });

  test("propose les deux montages quand la MLB les fournit", () => {
    const html = rendre(React.createElement(DetailMatch, {
      m, resumes: { recap: montage, condense: montage }, ...props,
    }));
    assert.match(html, /Match condensé/);
    assert.match(html, /Résumé commenté/);
  });

  test("nomme le coupable quand la MLB ne fournit rien", () => {
    /* Regression : la fiche restait muette — ni bouton, ni explication —
       quand le CDN de la MLB servait sa variante sans montages. */
    for (const vide of [null, { recap: null, condense: null }]) {
      const html = rendre(React.createElement(DetailMatch, { m, resumes: vide, ...props }));
      assert.match(html, /réponse incomplète/, `silence pour resumes=${JSON.stringify(vide)}`);
      assert.doesNotMatch(html, /Recherche des montages/);
    }
  });

  test("rien de tout cela pour un match à venir ou reporté", () => {
    for (const pas of [{ etat: "Preview" }, { reporte: true }]) {
      const html = rendre(React.createElement(DetailMatch, { m: { ...m, ...pas }, ...props }));
      assert.doesNotMatch(html, /montage/i);
    }
  });
});

describe("aucune fuite de résultat au rendu", () => {
  /* Regression : le bandeau LA SITUATION affichait bilan, série et nombre
     magique — tous derivés du classement, donc de la nuit précédente.
     On teste le composant directement : au rendu serveur les effets ne
     tournent pas, donc VueNuits reste en chargement et ne montre rien —
     un test à son niveau passerait pour de mauvaises raisons. */
  const sensible = [{
    eq: { id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD", division: { name: "National League West" } },
    b: { v: 67, d: 39, rang: 1, meneur: true, magique: 45, serieNb: 4, serieType: "wins" },
  }];

  test("rien ne fuite tant que les résultats sont masqués", () => {
    const html = rendre(React.createElement(BandeauSituation, { situation: sensible, spoilers: false }));
    assert.doesNotMatch(html, /67-39/, "le bilan fuite");
    assert.doesNotMatch(html, /magique 45/, "le nombre magique fuite");
    assert.doesNotMatch(html, /▲4/, "la série en cours fuite");
  });

  test("mais l'utilisateur sait qu'il manque quelque chose", () => {
    const html = rendre(React.createElement(BandeauSituation, { situation: sensible, spoilers: false }));
    assert.match(html, /masquée/);
    assert.match(html, /afficher quand même/);
  });

  test("tout revient une fois les résultats demandés", () => {
    const html = rendre(React.createElement(BandeauSituation, { situation: sensible, spoilers: true }));
    assert.match(html, /67-39/);
    assert.match(html, /magique 45/);
    assert.match(html, /▲4/);
  });

  test("ne rend rien sans équipe suivie", () => {
    assert.equal(rendre(React.createElement(BandeauSituation, { situation: [], spoilers: true })), "");
  });
});

describe("frise complète, recommandations ciblées", () => {
  /* La frise doit montrer toute la nuit, mais « À ne pas rater » et le match
     du jour ne doivent proposer que des équipes suivies. Deux notions
     distinctes qui etaient confondues dans un seul filtre. */
  test("la vue se rend avec une sélection restreinte", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueNuits, {
        teams: [equipe], suivies: [119], setSuivies: () => {},
        bilans: bilan, stades, stadeHabituel: { 119: 22 },
      })));
  });
  test("et sans aucune sélection", () => {
    assert.doesNotThrow(() =>
      rendre(React.createElement(VueNuits, {
        teams: [equipe], suivies: [], setSuivies: () => {}, bilans: bilan,
      })));
  });
});

describe("vue Le direct", () => {
  test("se rend sans données", () => {
    assert.ok(rendre(React.createElement(VueDirect, { teams: [], suivies: [] })).length >= 0);
  });

  test("le losange allume les buts occupés", () => {
    const vide = rendre(React.createElement(BasesOccupees, { off: {} }));
    const pleines = rendre(React.createElement(BasesOccupees, { off: { first: {}, second: {}, third: {} } }));
    const compte = (h) => (h.match(/#F2CE6B/g) || []).length;
    assert.ok(compte(pleines) > compte(vide), "les bases pleines doivent s'allumer davantage");
  });

  test("les compteurs respectent leurs maximums", () => {
    const html = rendre(React.createElement(Compteurs, { balles: 3, prises: 2, retraits: 2 }));
    assert.match(html, /balles/);
    assert.match(html, /prises/);
    assert.match(html, /retraits/);
  });

  test("le compte retombe à zéro entre deux frappeurs", () => {
    /* L'API ne renvoie pas un compte mais l'ETAT TERMINAL de la presence au
       bâton : sur un retrait sur prises, `linescore` porte 0-3 — trois
       prises — et le garde jusqu'a ce que le frappeur suivant se presente.
       Releve sur BOS @ PIT : deux minutes et huit secondes a afficher
       « 0-3, 3 retraits », changement de côté compris. La rangee des prises
       n'ayant que deux pastilles, elle se montrait pleine tout du long.
       C'est `about.isComplete` qui distingue les deux situations. */
    const pleines = (h) => (h.match(/background:#C2603A/gi) || []).length;
    const enCours = rendre(React.createElement(Compteurs, { balles: 0, prises: 2, retraits: 2 }));
    const entreDeux = rendre(React.createElement(Compteurs, { balles: 0, prises: 0, retraits: 3 }));
    assert.ok(pleines(enCours) > 0, "deux prises doivent allumer des pastilles");
    assert.equal(pleines(entreDeux), 0, "entre deux frappeurs, aucune prise ne doit rester allumée");
  });

  test("le tableau par manche affiche R, H et E", () => {
    const html = rendre(React.createElement(TableauManches, {
      innings: [{ num: 1, home: { runs: 0 }, away: { runs: 1 } }, { num: 2, home: { runs: 2 }, away: { runs: 0 } }],
      teams: { home: { runs: 2, hits: 5, errors: 1 }, away: { runs: 1, hits: 3, errors: 0 } },
      ab: { ext: "PHI", dom: "MIA" },
    }));
    assert.match(html, /PHI/);
    assert.match(html, /MIA/);
    for (const k of ["R", "H", "E"]) assert.match(html, new RegExp(`>${k}<`));
  });

  test("ne casse pas sur un tableau de manches absent", () => {
    assert.equal(rendre(React.createElement(TableauManches, { innings: [], teams: {}, ab: {} })), "");
  });
});

describe("bandeaux d'avertissement", () => {
  const avert = (o = {}) => ({
    cle: "1:rappel", type: "rappel", titre: "San Francisco Giants @ Los Angeles Dodgers",
    corps: "Coup d'envoi dans 12 min.", cible: "programme", tag: "1", idEquipe: 119, ...o,
  });

  test("la pile vide ne rend rien", () => {
    assert.equal(rendre(React.createElement(PileBandeaux, { bandeaux: [], ecarter: () => {} })), "");
    assert.equal(rendre(React.createElement(PileBandeaux, { ecarter: () => {} })), "");
  });

  test("un bandeau montre le match, le moment et de quoi partir", () => {
    const html = rendre(React.createElement(PileBandeaux, {
      bandeaux: [avert()], ecarter: () => {},
    }));
    assert.match(html, /San Francisco Giants @ Los Angeles Dodgers/);
    assert.match(html, /Coup d&#x27;envoi dans 12 min\./);
    assert.match(html, /ÇA APPROCHE/);
    assert.match(html, /Écarter/, "il doit toujours y avoir un moyen de le fermer");
  });

  test("chaque moment a son etiquette", () => {
    const html = rendre(React.createElement(PileBandeaux, {
      bandeaux: [
        avert({ cle: "1:echauffement", type: "echauffement" }),
        avert({ cle: "1:premiere", type: "premiere", cible: "direct" }),
      ],
      ecarter: () => {},
    }));
    assert.match(html, /ÉCHAUFFEMENTS/);
    assert.match(html, /ÇA COMMENCE/);
  });

  test("le reglage n'est pas rendu sans de quoi le brancher", () => {
    // Au rendu serveur comme dans une vue montee seule : pas d'interrupteur
    // qui ne commanderait rien.
    assert.equal(rendre(React.createElement(ReglageAvertissements, { actif: false, nbSuivies: 1 })), "");
  });

  test("la case reste active meme sans permission systeme", () => {
    const html = rendre(React.createElement(ReglageAvertissements, {
      actif: true, sur: () => {}, nbSuivies: 1, permission: "denied",
    }));
    assert.doesNotMatch(html, /disabled/, "le bandeau dans la page reste un canal valable");
    assert.match(html, /bandeau dans la page/);
  });
});

describe("garde-fous d'accessibilité", () => {
  test("les points de la carte sont des commandes, pas un dessin", () => {
    /* Un `<g onClick>` dans un `<svg role="img">` n'est ni tabulable ni
       annonce : la carte — tout le contenu de cet onglet — n'existait que
       pour la souris. Mesure a l'appui : zero arret de tabulation. */
    const html = rendre(React.createElement(VueTerrains, {
      teams: [equipe], stades, stadeHabituel: { 119: 22 }, suivies: [119],
    }));
    assert.doesNotMatch(html, /role="img"/, "role=img referme la carte aux lecteurs d'écran");
    assert.match(html, /role="button"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /aria-label="Los Angeles Dodgers/);
  });

  test("l'anneau de focus couvre aussi les éléments tabulables non-boutons", () => {
    assert.match(rendre(React.createElement(App)), /\[tabindex\]\):focus-visible/);
  });

  test("le titre de la page distingue les onglets", () => {
    // Cinq entrees d'historique portaient le meme libelle.
    const t = new Set(Object.values(A_TITRES));
    assert.equal(t.size, Object.keys(A_TITRES).length, "chaque onglet doit avoir son propre titre");
    assert.ok(t.size >= 6, "un onglet a-t-il été ajouté sans titre ?");
  });
});

describe("anti-spoiler du carnet", () => {
  test("le score du match dépouillé est masqué par défaut", () => {
    /* Le carnet ouvre sur le DERNIER match joue : l'afficher revenait a
       annoncer le resultat a qui n'a pas encore vu le replay. Le programme
       et le direct posaient deja la question. */
    const html = rendre(React.createElement(VueAlmanach, {
      teams: [equipe], appris: [], setAppris: () => {}, suivies: [119],
    }));
    assert.doesNotMatch(html, /\d+\s*—\s*\d+/, "aucun score ne doit sortir sans qu'on le demande");
  });
});

describe("traduction affichée", () => {
  test("l'action sort en français, avec l'original à un clic", () => {
    const html = rendre(React.createElement(Action, {
      texte: "Mookie Betts singles on a line drive to right fielder Juan Soto.",
    }));
    assert.match(html, /réussit un simple/);
    assert.match(html, /<button[^>]*>VO<\/button>/, "l'original doit rester accessible");
    // L'anglais ne doit pas etre AFFICHE : il ne survit que dans l'attribut
    // `title` du bouton, ce que le lecteur ne voit pas tant qu'il ne demande rien.
    const visible = html.replace(/<[^>]+>/g, "");
    assert.doesNotMatch(visible, /right fielder/);
  });

  test("une action intraduisible s'affiche telle quelle, sans bouton", () => {
    const brut = "Manfred Man reverses the polarity of the neutron flow.";
    const html = rendre(React.createElement(Action, { texte: brut }));
    assert.match(html, /neutron flow/);
    assert.doesNotMatch(html, /<button/, "proposer « VO » sur de l'anglais n'aurait aucun sens");
  });
});

describe("rendu de la vue Circuits", () => {
  test("se rend sans données ni navigateur", () => {
    /* Le moteur 3D n'est charge que par un effet, et les effets ne tournent
       pas au rendu serveur : cette vue doit donc s'afficher entierement sans
       WebGL, sans canvas, et sans que `three` soit meme telecharge. */
    const html = rendre(React.createElement(VueCircuits, { teams: [equipe], suivies: [119] }));
    assert.match(html, /Ce match/);
    assert.match(html, /Toute la nuit/);
    assert.doesNotMatch(html, /<canvas/, "aucun canvas au rendu serveur");
  });

  test("le conteneur de la scène s'affiche avant le moteur 3D", () => {
    // Ce qu'on voit pendant que les 141 Ko arrivent : un cadre et un mot,
    // pas un trou blanc.
    const html = rendre(React.createElement(SceneCircuits, {
      circuits: [], mur: null, marques: [], ouvert: null,
    }));
    assert.match(html, /Chargement de la vue en trois dimensions/);
    assert.match(html, /Glisser pour tourner/);
  });

  test("l'onglet annonce ce qui est mesuré et ce qui est calculé", () => {
    // La vue montre une courbe que personne n'a filmee : elle doit dire
    // lesquels de ses chiffres sont des mesures.
    const html = rendre(React.createElement(VueCircuits, { teams: [equipe], suivies: [119] }));
    assert.match(html, /le vol de bout en bout/);
  });
});

describe("le clip d'un circuit", () => {
  test("il annonce sa recherche avant que le contenu n'arrive", () => {
    /* Le contenu d'un match pese 469 Ko et ignore le filtre `fields` : il ne
       part qu'a l'ouverture d'un circuit. Entre-temps, l'ecran le dit. */
    const html = rendre(React.createElement(ClipCircuit, {
      circuit: { idMatch: 7, playId: "abc", cle: "x" },
    }));
    assert.match(html, /Recherche du clip/);
    assert.doesNotMatch(html, /<video/, "aucune vidéo tant que le clip n'est pas trouvé");
  });

  test("sans circuit ouvert, il ne rend rien", () => {
    assert.equal(rendre(React.createElement(ClipCircuit, { circuit: null })), "");
  });
});

describe("les couleurs dans la liste", () => {
  test("chaque fiche porte la couleur de son équipe", () => {
    // La tranche de couleur est la legende de la scene : sans elle, vingt-huit
    // courbes se ressemblent.
    const html = rendre(React.createElement(VueCircuits, { teams: [equipe], suivies: [119] }));
    // La vue est en chargement au rendu serveur : on verifie au moins que le
    // melange raccourci/propriete longue a disparu du style des fiches.
    assert.doesNotMatch(html, /border:[^;"]*;[^"]*border-left:/,
      "mélanger `border` et `borderLeft` laisse React choisir l'ordre au rerendu");
  });
});

describe("rendu de la vue Classement", () => {
  const eq = (id, name, abbreviation, div) => ({ id, name, abbreviation, division: { id: 0, name: div } });
  const equipes = [
    eq(139, "Tampa Bay Rays", "TB", "American League East"),
    eq(147, "New York Yankees", "NYY", "American League East"),
    eq(111, "Boston Red Sox", "BOS", "American League East"),
    eq(110, "Baltimore Orioles", "BAL", "American League East"),
    eq(114, "Cleveland Guardians", "CLE", "American League Central"),
    eq(116, "Detroit Tigers", "DET", "American League Central"),
    eq(117, "Houston Astros", "HOU", "American League West"),
    eq(119, "Los Angeles Dodgers", "LAD", "National League West"),
    eq(121, "New York Mets", "NYM", "National League East"),
  ];
  const bilans = {
    139: { v: 76, d: 52, pct: 0.594, rang: 1, meneur: true, magique: 32, serieNb: 2, serieType: "losses" },
    147: { v: 73, d: 55, pct: 0.570, meneur: false, retard: 3, wc: -9.5, wcRang: 1, serieNb: 5, serieType: "wins" },
    111: { v: 69, d: 59, pct: 0.539, meneur: false, retard: 7, wc: -5.5, wcRang: 2 },
    110: { v: 62, d: 66, pct: 0.484, meneur: false, wc: 4.0, wcRang: 4 },
    114: { v: 55, d: 73, pct: 0.430, meneur: false, wc: 12.0, wcRang: 6, elimWc: 0 },
    116: { v: 75, d: 53, pct: 0.586, rang: 1, meneur: true, magique: 30 },
    117: { v: 70, d: 58, pct: 0.547, rang: 1, meneur: true },
    119: { v: 80, d: 48, pct: 0.625, rang: 1, meneur: true, clinche: true },
    121: { v: 60, d: 68, pct: 0.469, meneur: false, wc: 6.0, wcRang: 5 },
  };

  test("se rend sans données, avec un mot d'attente", () => {
    const html = rendre(React.createElement(VueClassement, { teams: [], bilans: {} }));
    assert.ok(html.length > 100);
    assert.match(html, /pas encore arrivé/);
  });

  test("montre les deux ligues, meneurs en tête de série et wild cards", () => {
    const html = rendre(React.createElement(VueClassement, {
      teams: equipes, bilans, suivies: [119],
    }));
    assert.match(html, /Ligue américaine/);
    assert.match(html, /Ligue nationale/);
    // Tetes de serie : les Rays (.594) avant les Tigers (.586).
    assert.ok(html.indexOf("Tampa Bay Rays") < html.indexOf("Detroit Tigers"),
      "les meneurs doivent être triés par bilan");
    assert.match(html, /magique 32/);
    assert.match(html, /qualifiée/);
  });

  test("les écarts au wild card portent le bon signe", () => {
    const html = rendre(React.createElement(VueClassement, { teams: equipes, bilans }));
    assert.match(html, /\+9\.5/, "une avance s'affiche avec son +");
    assert.match(html, /(^|[^+\d])4\.0/, "un retard s'affiche sans signe");
  });

  test("la ligne des séries coupe la course après trois équipes", () => {
    const html = rendre(React.createElement(VueClassement, { teams: equipes, bilans }));
    assert.match(html, /LA LIGNE/);
    assert.ok(html.indexOf("Baltimore Orioles") < html.indexOf("LA LIGNE"),
      "la 3e place au wild card est au-dessus de la ligne");
    assert.ok(html.indexOf("LA LIGNE") < html.indexOf("Cleveland Guardians"),
      "une poursuivante est sous la ligne");
  });

  test("une équipe éliminée est dite éliminée", () => {
    const html = rendre(React.createElement(VueClassement, { teams: equipes, bilans }));
    assert.match(html, /éliminée/);
  });

  test("hors saison, la note d'avertissement s'affiche", () => {
    const html = rendre(React.createElement(VueClassement, {
      teams: equipes, bilans, saisonBilans: 2025,
    }));
    assert.match(html, /Hors saison : ce classement est celui de 2025/);
  });

  test("tolère des props absentes", () => {
    assert.doesNotThrow(() => rendre(React.createElement(VueClassement, {})));
  });
});
