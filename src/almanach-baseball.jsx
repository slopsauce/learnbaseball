import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { CONCEPTS, BY_ID } from "./donnees/notions.js";
import { CONTOUR_US, CARTE_L, CARTE_H, projeter } from "./donnees/carte.js";
import { WIKI_STADES, AFFICHES } from "./donnees/stades.js";

/* ------------------------------------------------------------------ *
 *  L'ALMANACH
 *  Deux vues sur une meme saison :
 *   - LE CARNET : une notion par nuit, tiree du vrai play-by-play,
 *     illustree par le clip officiel de l'action quand il existe.
 *   - LES NUITS : le calendrier remis a l'heure de Paris. L'axe n'est
 *     pas la date mais l'heure reelle de debut, minuit au centre.
 *  Source : statsapi.mlb.com (sans cle, CORS ouvert).
 * ------------------------------------------------------------------ */

const T = {
  turf: "#123D2A",
  turfLit: "#16472F",
  night: "#0B241A",
  chalk: "#EFF3EA",
  dim: "#93A697",
  clay: "#C2603A",
  sodium: "#F2CE6B",
};

const FF_DISPLAY = "'Big Shoulders Display', 'Haettenschweiler', Impact, sans-serif";
const FF_BODY = "'Spectral', Georgia, serif";
const FF_MONO = "'Space Mono', ui-monospace, Menlo, monospace";

/* ------------------------------------------------------------------ *
 *  POLICES — servies depuis le depot, pas depuis Google
 *  L'`@import` vers fonts.googleapis.com transmettait l'adresse IP de
 *  chaque visiteur a un tiers, et retardait le texte d'un aller-retour
 *  reseau : la premiere peinture se faisait en Georgia puis sautait.
 *  Ici les fichiers sont locaux, en sous-ensemble latin, sous OFL —
 *  voir public/polices/LISEZMOI-LICENCE.txt.
 *
 *  Big Shoulders est une police VARIABLE : Google servait le meme
 *  fichier pour 400, 700 et 800 (md5 identiques). Un seul fichier suffit
 *  donc, declare sur toute sa plage de graisses — 71 Ko economises.
 *
 *  `BASE` suit la base de Vite : sous GitHub Pages le site est servi
 *  depuis /<depot>/, et une URL absolue pointerait a cote.
 * ------------------------------------------------------------------ */
const BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

const POLICES = [
  ["Big Shoulders Display", "big-shoulders-display-var", "normal", "400 800"],
  ["Spectral", "spectral-400", "normal", "400"],
  ["Spectral", "spectral-400-italic", "italic", "400"],
  // Pas de Spectral gras : les quatre <strong> de l'application sont tous
  // dans des paragraphes en Space Mono. Verifie avant de retirer le fichier.
  ["Space Mono", "space-mono-400", "normal", "400"],
  ["Space Mono", "space-mono-700", "normal", "700"],
]
  .map(
    ([famille, fichier, style, poids]) => `    @font-face {
      font-family: '${famille}';
      font-style: ${style};
      font-weight: ${poids};
      font-display: swap;
      src: url('${BASE}polices/${fichier}.woff2') format('woff2');
    }`
  )
  .join("\n");

const STORE_KEY = "almanach-carnet-v1";
const API = "https://statsapi.mlb.com/api/v1";


/* ------------------------------------------------------------------ *
 *  VIDEO
 *  /game/{pk}/content expose les clips officiels. Le champ `guid` d'un
 *  clip EST le playId de l'action — c'est la jointure avec le
 *  play-by-play, qui porte deja les playId sur chaque lancer.
 *  Seule une action sur cinq environ est filmee.
 * ------------------------------------------------------------------ */
function indexerClips(content) {
  const map = new Map();
  for (const it of content?.highlights?.highlights?.items || []) {
    if (!it.guid) continue;
    const pb = it.playbacks || [];
    const mp4 = pb.find((p) => p.name === "mp4Avc") || pb.find((p) => p.url?.endsWith(".mp4"));
    if (!mp4) continue;
    const cuts = it.image?.cuts || [];
    const poster = (cuts.find((c) => c.width === 1280) || cuts[0])?.src;
    map.set(it.guid, { url: mp4.url, poster, titre: it.title, duree: it.duration });
  }
  return map;
}

/* ------------------------------------------------------------------ *
 *  DETECTION dans le play-by-play
 * ------------------------------------------------------------------ */
function classifyFieldOut(desc = "") {
  const d = desc.toLowerCase();
  if (d.includes("grounds out") || d.includes("ground out")) return "ground_out";
  if (d.includes("flies out") || d.includes("fly out")) return "fly_out";
  if (d.includes("lines out") || d.includes("line out")) return "line_out";
  if (d.includes("pops out") || d.includes("pop out")) return "pop_out";
  return "fly_out";
}

const AT_BAT_MAP = {
  single: "single",
  double: "double",
  triple: "triple",
  home_run: "home_run",
  walk: "walk",
  intent_walk: "intent_walk",
  hit_by_pitch: "hit_by_pitch",
  strikeout: "strikeout",
  strikeout_double_play: "strikeout",
  sac_fly: "sac_fly",
  sac_fly_double_play: "sac_fly",
  sac_bunt: "sac_bunt",
  sac_bunt_double_play: "sac_bunt",
  grounded_into_double_play: "gidp",
  double_play: "double_play",
  triple_play: "triple_play",
  field_error: "field_error",
  fielders_choice: "fielders_choice",
  fielders_choice_out: "fielders_choice",
  force_out: "force_out",
  catcher_interf: "catcher_interf",
};

const ACTION_MAP = {
  stolen_base_2b: "stolen_base_2b",
  stolen_base_3b: "stolen_base_3b",
  stolen_base_home: "stolen_base_home",
  caught_stealing_2b: "caught_stealing",
  caught_stealing_3b: "caught_stealing",
  caught_stealing_home: "caught_stealing",
  pickoff_caught_stealing_2b: "caught_stealing",
  pickoff_caught_stealing_3b: "caught_stealing",
  pickoff_caught_stealing_home: "caught_stealing",
  pickoff_1b: "pickoff",
  pickoff_2b: "pickoff",
  pickoff_3b: "pickoff",
  balk: "balk",
  wild_pitch: "wild_pitch",
  passed_ball: "passed_ball",
  defensive_indiff: "defensive_indiff",
};

function detectSightings(plays, clips = new Map()) {
  const found = new Map();

  const add = (id, play, clip, over) => {
    if (!id || !BY_ID[id]) return;
    const ancien = found.get(id);
    // On ne remplace une occurrence deja retenue que pour gagner une video.
    if (ancien && (ancien.clip || !clip)) return;
    found.set(id, {
      conceptId: id,
      manche: play?.about?.inning,
      demi: play?.about?.halfInning,
      description: play?.result?.description || "",
      frappeur: play?.matchup?.batter?.fullName || "",
      lanceur: play?.matchup?.pitcher?.fullName || "",
      idFrappeur: play?.matchup?.batter?.id,
      idLanceur: play?.matchup?.pitcher?.id,
      coteFrappeur: play?.matchup?.batSide?.code,
      coteLanceur: play?.matchup?.pitchHand?.code,
      clip,
      ...over,
    });
  };

  for (const play of plays) {
    const r = play.result || {};
    const et = r.eventType;
    const evs = play.playEvents || [];

    // un clip est rattache a l'action si l'un de ses lancers porte le playId
    const clip = evs.map((e) => e.playId && clips.get(e.playId)).find(Boolean) || null;

    if (et === "home_run" && (r.rbi || 0) >= 4) add("grand_slam", play, clip);
    if (et === "field_out") add(classifyFieldOut(r.description), play, clip);
    else if (AT_BAT_MAP[et]) add(AT_BAT_MAP[et], play, clip);

    for (const ev of evs) {
      if (ev.type === "action") {
        const id = ACTION_MAP[ev?.details?.eventType];
        if (id) add(id, play, clip, { description: ev?.details?.description || r.description || "" });
      }
      if (ev.isPitch && ev?.count?.balls === 3 && ev?.count?.strikes === 2) {
        add("full_count", play, clip, {
          description: `${play?.matchup?.batter?.fullName || "Le frappeur"} sur un compte plein contre ${play?.matchup?.pitcher?.fullName || "le lanceur"}.`,
        });
      }
    }
  }
  return [...found.values()];
}

/* ------------------------------------------------------------------ *
 *  IMAGERIE OFFICIELLE MLB
 *  Tout est servi en CORS ouvert et minuscule : 761 o pour une casquette,
 *  6 Ko pour un portrait detoure. Cache 14 jours cote CDN.
 * ------------------------------------------------------------------ */
const CAP = (id, sombre = true) =>
  `https://www.mlbstatic.com/team-logos/team-cap-on-${sombre ? "dark" : "light"}/${id}.svg`;
const ROND = (id) => `https://midfield.mlbstatic.com/v1/team/${id}/spots/72`;
const PORTRAIT = (id) => `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;

const COTE = { L: "gaucher", R: "droitier", S: "ambidextre" };

/* Une image qui disparait proprement si le CDN ne repond pas. */
function Img({ src, alt, size, rond = false, style }) {
  const [ko, setKo] = useState(false);
  if (ko || !src) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setKo(true)}
      style={{ display: "block", flexShrink: 0, borderRadius: rond ? "50%" : 0, ...style }}
    />
  );
}

/* ------------------------------------------------------------------ *
 *  LE LOSANGE — l'element signature
 * ------------------------------------------------------------------ */
const PTS = { H: [50, 92], B1: [92, 50], B2: [50, 8], B3: [8, 50] };
const SEG = {
  1: [PTS.H, PTS.B1],
  2: [PTS.B1, PTS.B2],
  3: [PTS.B2, PTS.B3],
  4: [PTS.B3, PTS.H],
};

function Losange({ concept, size = 92, animate = false, muted = false }) {
  const legs = concept?.legs || [];
  const scored = !!concept?.scored;
  const fail = !!concept?.fail;
  const ink = muted ? T.dim : T.clay;
  const len = 60;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon
        points="50,92 92,50 50,8 8,50"
        fill={scored ? (muted ? "rgba(242,206,107,.13)" : "rgba(242,206,107,.20)") : "none"}
        stroke={muted ? "rgba(147,166,151,.5)" : "rgba(147,166,151,.75)"}
        strokeWidth="1.6"
      />
      {legs.map((n) => {
        const [[x1, y1], [x2, y2]] = SEG[n];
        return (
          <line
            key={n}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={ink}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={fail ? "7 5" : animate ? len : undefined}
            strokeDashoffset={animate && !fail ? len : undefined}
            style={
              animate && !fail
                ? { animation: `trace 620ms ${120 * n}ms cubic-bezier(.4,0,.2,1) forwards` }
                : undefined
            }
          />
        );
      })}
      {fail && (() => {
        const cible = legs.length ? SEG[legs[legs.length - 1]][1] : PTS.B1;
        const cx = Math.min(88, Math.max(12, cible[0]));
        const cy = Math.min(88, Math.max(12, cible[1]));
        const a = 9;
        return (
          <g stroke={T.clay} strokeWidth="4" strokeLinecap="round">
            <line x1={cx - a} y1={cy - a} x2={cx + a} y2={cy + a} />
            <line x1={cx + a} y1={cy - a} x2={cx - a} y2={cy + a} />
          </g>
        );
      })()}
      {[PTS.H, PTS.B1, PTS.B2, PTS.B3].map(([x, y], i) => (
        <rect
          key={i} x={x - 3.2} y={y - 3.2} width="6.4" height="6.4"
          transform={`rotate(45 ${x} ${y})`}
          fill={muted ? "rgba(147,166,151,.55)" : T.dim}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 *  Stockage — localStorage, cloisonne par ORIGINE (pas par chemin) :
 *  tous tes projets sur <toi>.github.io partagent le meme espace.
 * ------------------------------------------------------------------ */
const ETAT_VIDE = { appris: [], suivies: [119] };

async function loadState() {
  try {
    return { ...ETAT_VIDE, ...(JSON.parse(localStorage.getItem(STORE_KEY)) || {}) };
  } catch {
    return { ...ETAT_VIDE };
  }
}

/* Semantique de fusion : sauver les notions ne doit pas effacer les equipes
   suivies, et reciproquement. */
async function saveState(patch) {
  try {
    const courant = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...courant, ...patch }));
  } catch {
    /* mode prive / quota plein : on continue en memoire */
  }
}

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
const ordinal = (n) => (!n ? "?" : n === 1 ? "1re" : `${n}e`);

const TZ = "Europe/Paris";

/* La date du jour a Paris, en AAAA-MM-JJ.
   `new Date().toISOString().slice(0,10)` donne la date UTC : entre minuit et
   02h l'ete, c'est encore la veille. Le reste du fichier raisonne en nuits
   parisiennes, donc melanger les deux bases decalait la fenetre d'un cran
   pendant deux heures chaque nuit — exactement les heures ou l'on consulte. */
const jourParis = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/* Une reponse d'erreur reste tres souvent du JSON valide. Sans controle du
   statut, un 500 se lit comme une reponse vide : le carnet annoncait « aucun
   match termine » et le programme une nuit sans match, au lieu de dire que
   l'API est tombee. On leve, et chaque appelant decide s'il rattrape. */
async function jsonMlb(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText || ""}`.trim());
  return r.json();
}

function dateFR(s) {
  try {
    return new Date(s).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long",
    });
  } catch {
    return s;
  }
}

/* Le « K » inverse du carnet n'a pas de codepoint fiable : U+A7B0 manque
   dans la quasi-totalite des polices, systeme compris, et sort en tofu.
   On retourne un vrai K en CSS — meme police, meme graisse, toujours rendu. */
function texteAvecKInverse(txt) {
  return String(txt).split("{{K}}").map((seg, i) => (
    <React.Fragment key={i}>
      {i > 0 && (
        <span style={{ display: "inline-block", transform: "scaleX(-1)" }}>K</span>
      )}
      {seg}
    </React.Fragment>
  ));
}

/* ------------------------------------------------------------------ *
 *  LE QUIZ
 *  Le carnet expose aux notions sans jamais verifier qu'elles restent,
 *  et devient un musee une fois les 32 cochees. Les questions sont
 *  tirees d'actions reellement survenues, pas d'exemples fabriques.
 *  Les distracteurs partagent la forme de la bonne reponse — meme
 *  nombre de segments traces sur le losange — pour que le choix demande
 *  une vraie discrimination et pas une elimination grossiere.
 * ------------------------------------------------------------------ */
function melanger(liste, alea = Math.random) {
  const l = liste.slice();
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

function fabriquerQuestion(sightings, dejaVues = [], alea = Math.random) {
  const frais = sightings.filter((s) => !dejaVues.includes(s.conceptId));
  const vivier = frais.length ? frais : sightings;
  if (!vivier.length) return null;

  const tire = vivier[Math.floor(alea() * vivier.length)];
  const bon = BY_ID[tire.conceptId];
  if (!bon) return null;

  const memeForme = CONCEPTS.filter((c) => c.id !== bon.id && c.legs.length === bon.legs.length);
  const reste = CONCEPTS.filter((c) => c.id !== bon.id && c.legs.length !== bon.legs.length);
  const distracteurs = [...melanger(memeForme, alea), ...melanger(reste, alea)].slice(0, 3);

  return { action: tire, bon, options: melanger([bon, ...distracteurs], alea) };
}

/* ================================================================== *
 *  VUE « LE CARNET »
 * ================================================================== */
function VueAlmanach({ teams, appris, setAppris, suivies }) {
  const [teamId, setTeamId] = useState(() => suivies[0] || 119);
  const [game, setGame] = useState(null);
  const [sightings, setSightings] = useState([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("load"); // load | ok | vide | erreur
  const [erreur, setErreur] = useState("");
  const [justInked, setJustInked] = useState(null);
  const [ouvertCarnet, setOuvertCarnet] = useState(false);
  const [consulte, setConsulte] = useState(null); // conceptId ouvert depuis le carnet
  const [mode, setMode] = useState("decouvrir"); // decouvrir | reviser
  const [question, setQuestion] = useState(null);
  const [choix, setChoix] = useState(null);
  const [seance, setSeance] = useState({ bon: 0, total: 0 });
  const [posees, setPosees] = useState([]);
  const articleRef = useRef(null);

  const charger = useCallback(async (tid) => {
    setPhase("load");
    setErreur("");
    try {
      const sch = await jsonMlb(
        `${API}/schedule?sportId=1&teamId=${tid}` +
          `&startDate=${jourParis(new Date(Date.now() - 12 * 864e5))}` +
          `&endDate=${jourParis()}`
      );

      // Un match reporte porte abstractGameState "Final" alors qu'il n'a jamais
      // ete joue : allPlays est vide et winProbability repond 404. Environ 3 %
      // des matchs. On se fie donc a codedGameState, qui vaut "F" pour un vrai
      // match termine et "D" pour un report.
      const finis = (sch.dates || [])
        .flatMap((d) => d.games || [])
        .filter((g) => classerMatch(g.status).fini)
        .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));

      if (!finis.length) {
        setPhase("vide");
        return;
      }

      // Filet de securite : si la feuille du dernier match est vide malgre
      // tout, on remonte au precedent plutot que d'afficher une page morte.
      let g = null, vues = [];
      for (const candidat of finis.slice(0, 3)) {
        const [pbp, content] = await Promise.all([
          jsonMlb(`${API}/game/${candidat.gamePk}/playByPlay`),
          // Le contenu video est un bonus : son absence ne doit pas priver
          // l'utilisateur de la fiche.
          jsonMlb(`${API}/game/${candidat.gamePk}/content`).catch(() => null),
        ]);
        const trouve = detectSightings(pbp.allPlays || [], indexerClips(content));
        if (trouve.length) {
          g = candidat;
          vues = trouve;
          break;
        }
      }
      if (!g) {
        setPhase("vide");
        return;
      }
      vues.sort((a, b) => BY_ID[b.conceptId].rarete - BY_ID[a.conceptId].rarete);

      setGame(g);
      setSightings(vues);
      setIdx(0);
      setPhase("ok");
    } catch (e) {
      setErreur(String(e?.message || e));
      setPhase("erreur");
    }
  }, []);

  useEffect(() => {
    // `charger` bascule en etat « chargement » avant de partir sur le reseau.
    // La regle ne voit pas la frontiere asynchrone et lit un enchainement de
    // rendus la ou il n'y a qu'un passage en attente, voulu et visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger(teamId);
  }, [teamId, charger]);

  const nouveaux = useMemo(
    () => sightings.filter((s) => !appris.includes(s.conceptId)),
    [sightings, appris]
  );
  const liste = nouveaux.length ? nouveaux : sightings;

  // Consultation depuis le carnet : on reutilise l'action du match si la notion
  // y figure, sinon on affiche la fiche seule (mode revision, sans ancrage).
  const consulteSighting = consulte ? sightings.find((s) => s.conceptId === consulte) : null;
  const courant = consulte
    ? consulteSighting || { conceptId: consulte, clip: null, virtuel: true }
    : liste[Math.min(idx, Math.max(liste.length - 1, 0))] || null;

  const concept = courant ? BY_ID[courant.conceptId] : null;
  const dejaVu = courant ? appris.includes(courant.conceptId) : false;
  const ancre = !!courant && !courant.virtuel;

  useEffect(() => {
    if (!consulte || !articleRef.current) return;
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    articleRef.current.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
  }, [consulte]);

  const suivante = useCallback(
    (histoire = posees) => {
      setChoix(null);
      setQuestion(fabriquerQuestion(sightings, histoire));
    },
    [sightings, posees]
  );

  useEffect(() => {
    // Cas reel : on passe en revision pendant que la feuille de match charge
    // encore. Sans cette amorce, l'arrivee des donnees ne declencherait rien et
    // l'ecran resterait bloque sur « aucune action exploitable ». La question
    // ne peut pas etre calculee au rendu : `fabriquerQuestion` tire au sort,
    // donc rendrait le rendu impur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode === "reviser" && !question && sightings.length) suivante([]);
  }, [mode, question, sightings, suivante]);

  const repondre = (c) => {
    if (choix) return; // une seule reponse par question
    setChoix(c);
    const juste = c.id === question.bon.id;
    setSeance((s) => ({ bon: s.bon + (juste ? 1 : 0), total: s.total + 1 }));
    setPosees((p) => [...p, question.bon.id]);
  };

  const noter = async () => {
    if (!courant || dejaVu || !ancre) return;
    const s = [...appris, courant.conceptId];
    setAppris(s);
    setJustInked(courant.conceptId);
    await saveState({ appris: s });
    setTimeout(() => setJustInked(null), 1400);
    // La notion notee sort de `nouveaux` : la liste retrecit et l'index
    // pointe naturellement sur la suivante. L'incrementer en sauterait une.
  };

  return (
    <div className="alm-rise">
      {/* ---------- decouvrir ou reviser ---------- */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["decouvrir", "Découvrir"], ["reviser", "Réviser"]].map(([id, lib]) => (
          <button
            key={id}
            className="alm-btn"
            onClick={() => setMode(id)}
            aria-pressed={mode === id}
            style={btnStyle(mode === id)}
          >
            {lib}
          </button>
        ))}
        {mode === "reviser" && seance.total > 0 && (
          <span
            style={{
              fontFamily: FF_MONO, fontSize: 11, color: T.dim,
              alignSelf: "center", marginLeft: "auto",
            }}
          >
            {seance.bon} / {seance.total} cette séance
          </span>
        )}
      </div>

      {/* ---------- quelle equipe on etudie ---------- */}
      <div style={{ margin: "0 0 22px", display: "flex", alignItems: "center", gap: 10 }}>
        <label
          htmlFor="eq"
          style={{ fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".16em", color: T.dim }}
        >
          D'APRÈS
        </label>
        <Img src={CAP(teamId)} alt="" size={26} />
        <select
          id="eq"
          className="alm-sel"
          value={teamId}
          onChange={(e) => setTeamId(Number(e.target.value))}
          style={{
            fontFamily: FF_MONO, fontSize: 12, color: T.chalk,
            background: "rgba(11,36,26,.7)", border: "1px solid rgba(239,243,234,.28)",
            padding: "6px 10px", borderRadius: 2, cursor: "pointer",
          }}
        >
          {(() => {
            const liste = teams.length ? teams : [{ id: 119, name: "Los Angeles Dodgers" }];
            const mes = liste.filter((t) => suivies.includes(t.id));
            const reste = liste.filter((t) => !suivies.includes(t.id));
            const opt = (t) => (
              <option key={t.id} value={t.id} style={{ color: "#111" }}>
                {t.name}
              </option>
            );
            return mes.length ? (
              <>
                <optgroup label="Que je suis">{mes.map(opt)}</optgroup>
                <optgroup label="Les autres">{reste.map(opt)}</optgroup>
              </>
            ) : (
              liste.map(opt)
            );
          })()}
        </select>
      </div>

      {phase === "load" && (
        <p style={{ fontFamily: FF_MONO, fontSize: 12, color: T.dim, animation: "pulse 1.4s infinite" }}>
          Dépouillement de la feuille de match…
        </p>
      )}

      {phase === "erreur" && (
        <div style={{ border: `1px solid ${T.clay}`, padding: 18, borderRadius: 3 }}>
          <p style={{ margin: 0, fontSize: 15 }}>
            La feuille de match n'est pas arrivée. L'API de MLB n'a pas répondu.
          </p>
          <p style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim, margin: "8px 0 14px" }}>
            {erreur}
          </p>
          <button className="alm-btn" onClick={() => charger(teamId)} style={btnStyle(true)}>
            Réessayer
          </button>
        </div>
      )}

      {phase === "vide" && (
        <p style={{ fontSize: 16 }}>
          Aucun match terminé sur les douze derniers jours. Hors saison, ou pause du match des étoiles —
          choisis une autre équipe en attendant.
        </p>
      )}

      {phase === "ok" && mode === "reviser" && question && (
        <div className="alm-rise" key={question.action.conceptId + posees.length}>
          <div
            style={{
              fontFamily: FF_MONO, fontSize: 11, color: T.dim, marginBottom: 12,
            }}
          >
            {ordinal(question.action.manche)} MANCHE ·{" "}
            {question.action.demi === "top" ? "HAUT" : "BAS"}
            {game ? ` · ${game.teams.away.team.abbreviation} @ ${game.teams.home.team.abbreviation}` : ""}
          </div>

          {/* L'action, sans le losange ni le code : ils donneraient la reponse. */}
          <div
            style={{
              background: "rgba(11,36,26,.78)", border: "1px solid rgba(239,243,234,.2)",
              borderRadius: 3, padding: 20, fontSize: 16, lineHeight: 1.5,
            }}
          >
            {question.action.description}
          </div>

          <p style={{ fontFamily: FF_MONO, fontSize: 11, color: T.sodium, margin: "16px 0 10px", letterSpacing: ".1em" }}>
            QUELLE NOTION EST-CE ?
          </p>

          <div style={{ display: "grid", gap: 8 }}>
            {question.options.map((o) => {
              const juste = o.id === question.bon.id;
              const pris = choix?.id === o.id;
              const fond = !choix
                ? "rgba(11,36,26,.5)"
                : juste
                ? "rgba(242,206,107,.18)"
                : pris
                ? "rgba(194,96,58,.22)"
                : "rgba(11,36,26,.3)";
              return (
                <button
                  key={o.id}
                  className="alm-cell"
                  onClick={() => repondre(o)}
                  disabled={!!choix}
                  style={{
                    all: "unset", cursor: choix ? "default" : "pointer", display: "block",
                    boxSizing: "border-box", padding: "11px 14px", borderRadius: 2,
                    background: fond,
                    border: `1px solid ${choix && juste ? T.sodium : choix && pris ? T.clay : "rgba(239,243,234,.2)"}`,
                    opacity: choix && !juste && !pris ? 0.45 : 1,
                    fontSize: 15,
                  }}
                >
                  {choix && juste ? "✓ " : choix && pris ? "✗ " : ""}
                  {o.titre}
                </button>
              );
            })}
          </div>

          {choix && (
            <div className="alm-rise" style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <Losange concept={question.bon} size={72} animate />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: FF_MONO, fontWeight: 700, fontSize: 22,
                      color: T.clay, letterSpacing: ".04em",
                    }}
                  >
                    {question.bon.code}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 15.5, lineHeight: 1.45 }}>
                    {question.bon.retenir}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <button className="alm-btn" onClick={() => suivante()} style={btnStyle(true)}>
                  Question suivante
                </button>
                <button
                  className="alm-btn"
                  onClick={() => { setMode("decouvrir"); setConsulte(question.bon.id); }}
                  style={btnStyle(false)}
                >
                  Relire la fiche
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "ok" && mode === "reviser" && !question && (
        <p style={{ fontSize: 16 }}>
          Ce match ne contient aucune action exploitable pour une question. Choisis une autre équipe.
        </p>
      )}

      {phase === "ok" && mode === "decouvrir" && courant && concept && (
        <article ref={articleRef} key={courant.conceptId} className="alm-rise">
          <div
            style={{
              fontFamily: FF_MONO, fontSize: 11, color: T.dim,
              letterSpacing: ".06em", marginBottom: 14,
            }}
          >
            {ancre ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Img src={CAP(game.teams.away.team.id)} alt="" size={22} />
                <span>{game.teams.away.team.name} {game.teams.away.score}</span>
                <span style={{ opacity: .5 }}>—</span>
                <span>{game.teams.home.score} {game.teams.home.team.name}</span>
                <Img src={CAP(game.teams.home.team.id)} alt="" size={22} />
                <span style={{ color: "rgba(147,166,151,.55)" }}>
                  · {dateFR(game.gameDate)}{game.venue?.name ? ` · ${game.venue.name}` : ""}
                </span>
              </span>
            ) : (
              <span style={{ color: T.sodium }}>CONSULTÉE DEPUIS LE CARNET · absente de ce match</span>
            )}
          </div>

          {/* LA CASE — seulement si la notion est ancree dans une action */}
          {ancre && (
            <div
              style={{
                background: "rgba(11,36,26,.78)",
                border: "1px solid rgba(239,243,234,.2)",
                borderRadius: 3, padding: 22,
                display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap",
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <Losange concept={concept} size={104} animate />
              </div>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontFamily: FF_MONO, fontSize: 11, color: T.sodium, letterSpacing: ".14em" }}>
                  {ordinal(courant.manche)} MANCHE · {courant.demi === "top" ? "HAUT" : "BAS"}
                </div>
                <div
                  style={{
                    fontFamily: FF_MONO, fontWeight: 700, fontSize: 30,
                    color: T.clay, margin: "2px 0 8px", letterSpacing: ".04em",
                  }}
                >
                  {concept.code}
                </div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "rgba(239,243,234,.9)" }}>
                  {courant.description}
                </p>
                {courant.frappeur && (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 10, marginTop: 12,
                      flexWrap: "wrap", fontFamily: FF_MONO, fontSize: 10.5, color: T.dim,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Img src={PORTRAIT(courant.idFrappeur)} alt="" size={38} rond
                           style={{ background: "rgba(239,243,234,.09)" }} />
                      <span>
                        <span style={{ color: T.chalk, display: "block" }}>{courant.frappeur}</span>
                        <span style={{ fontSize: 9 }}>
                          frappeur {COTE[courant.coteFrappeur] || ""}
                        </span>
                      </span>
                    </span>
                    <span style={{ color: T.clay, fontSize: 13 }}>×</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Img src={PORTRAIT(courant.idLanceur)} alt="" size={38} rond
                           style={{ background: "rgba(239,243,234,.09)" }} />
                      <span>
                        <span style={{ color: T.chalk, display: "block" }}>{courant.lanceur}</span>
                        <span style={{ fontSize: 9 }}>
                          lanceur {COTE[courant.coteLanceur] || ""}
                        </span>
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode revision : pas d'action a montrer, mais on garde l'identite visuelle */}
          {!ancre && (
            <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
              <Losange concept={concept} size={78} animate />
              <div
                style={{
                  fontFamily: FF_MONO, fontWeight: 700, fontSize: 28,
                  color: T.clay, letterSpacing: ".04em",
                }}
              >
                {concept.code}
              </div>
            </div>
          )}

          {/* LE CLIP — seulement si l'action a ete filmee */}
          {courant.clip && (
            <div style={{ marginTop: 14 }}>
              <video
                key={courant.clip.url}
                src={courant.clip.url}
                poster={courant.clip.poster}
                controls
                preload="none"
                playsInline
                style={{
                  width: "100%", display: "block", borderRadius: 3,
                  background: "#000", border: "1px solid rgba(239,243,234,.2)",
                }}
              />
              <p
                style={{
                  fontFamily: FF_MONO, fontSize: 10, color: T.dim,
                  margin: "6px 0 0", letterSpacing: ".04em",
                }}
              >
                {courant.clip.titre}
                {courant.clip.duree ? ` · ${courant.clip.duree}` : ""}
              </p>
            </div>
          )}

          <h2
            style={{
              fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 40, lineHeight: 1,
              textTransform: "uppercase", margin: "34px 0 6px", letterSpacing: ".01em",
            }}
          >
            {concept.titre}
          </h2>
          <p style={{ fontStyle: "italic", color: T.sodium, fontSize: 15.5, margin: "0 0 20px" }}>
            {concept.gist}
          </p>

          {concept.corps.map((p, i) => (
            <p key={i} style={{ fontSize: 16, lineHeight: 1.68, margin: "0 0 15px", color: "rgba(239,243,234,.93)" }}>
              {texteAvecKInverse(p)}
            </p>
          ))}

          <div style={{ borderLeft: `3px solid ${T.clay}`, paddingLeft: 14, margin: "22px 0 26px" }}>
            <div style={{ fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em", color: T.dim }}>
              À RETENIR
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 16.5, lineHeight: 1.45 }}>{concept.retenir}</p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {/* On ne peut cocher une notion que si elle s'est vraiment produite. */}
            {ancre && !dejaVu && (
              <button className="alm-btn" onClick={noter} style={btnStyle(true)}>
                Noter dans le carnet
              </button>
            )}
            {dejaVu && (
              <span style={{ fontFamily: FF_MONO, fontSize: 11, color: T.sodium, letterSpacing: ".1em" }}>
                ✓ DÉJÀ NOTÉE
              </span>
            )}
            {consulte ? (
              <button className="alm-btn" onClick={() => setConsulte(null)} style={btnStyle(!dejaVu)}>
                Retour à cette nuit
              </button>
            ) : (
              liste.length > 1 && (
                <button
                  className="alm-btn"
                  onClick={() => setIdx((idx + 1) % liste.length)}
                  style={btnStyle(false)}
                >
                  Une autre de cette nuit
                </button>
              )
            )}
            {!consulte && (
              <span style={{ fontFamily: FF_MONO, fontSize: 10.5, color: T.dim, marginLeft: "auto" }}>
                {nouveaux.length
                  ? `${nouveaux.length} notion${nouveaux.length > 1 ? "s" : ""} neuve${nouveaux.length > 1 ? "s" : ""} dans ce match`
                  : "tout ce match est déjà noté"}
              </span>
            )}
          </div>
        </article>
      )}

      {phase === "ok" && mode === "decouvrir" && !courant && (
        <p style={{ fontSize: 16 }}>
          Ce match ne contenait aucune action reconnue par l'almanach. Ça arrive : essaie une autre équipe.
        </p>
      )}

      {/* ---------- LE CARNET ---------- */}
      <section style={{ marginTop: 46 }}>
        <button
          className="alm-btn"
          onClick={() => setOuvertCarnet(!ouvertCarnet)}
          aria-expanded={ouvertCarnet}
          style={{
            all: "unset", cursor: "pointer", display: "flex", alignItems: "center",
            gap: 10, width: "100%", borderTop: "1px solid rgba(239,243,234,.22)", paddingTop: 14,
          }}
        >
          <span
            style={{
              fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 24,
              textTransform: "uppercase", letterSpacing: ".03em",
            }}
          >
            Le carnet
          </span>
          <span style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim }}>
            {ouvertCarnet ? "▾ replier" : "▸ déplier"}
          </span>
        </button>

        {ouvertCarnet && (
          <div
            className="alm-rise"
            style={{
              marginTop: 18, display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 12,
            }}
          >
            {CONCEPTS.map((c) => {
              const vu = appris.includes(c.id);
              return (
                <button
                  key={c.id}
                  className="alm-cell"
                  onClick={() => setConsulte(c.id)}
                  aria-label={`Ouvrir la fiche : ${c.titre}`}
                  title={c.titre}
                  style={{
                    all: "unset", cursor: "pointer", display: "block", boxSizing: "border-box",
                    border: `1px solid rgba(239,243,234,${vu ? ".26" : ".1"})`,
                    background: consulte === c.id
                      ? "rgba(194,96,58,.22)"
                      : vu ? "rgba(11,36,26,.6)" : "rgba(11,36,26,.28)",
                    borderRadius: 2, padding: "8px 6px 10px", textAlign: "center",
                    opacity: vu ? 1 : .55,
                  }}
                >
                  <Losange concept={c} size={62} muted={!vu} animate={justInked === c.id} />
                  <div
                    style={{
                      fontFamily: FF_MONO, fontSize: 10, color: vu ? T.clay : T.dim,
                      fontWeight: 700, letterSpacing: ".04em",
                    }}
                  >
                    {c.code}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5, lineHeight: 1.25, color: T.dim, marginTop: 3,
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {c.titre}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ================================================================== *
 *  VUE « LES NUITS »
 *  L'axe horizontal va de 17h a 07h heure de Paris, soit 14 heures,
 *  ce qui place minuit exactement au centre : a gauche ce qui se
 *  regarde le soir, a droite ce qui demande un reveil.
 *  68 % des matchs changent de date entre le calendrier MLB et le
 *  calendrier parisien — d'ou le regroupement par NUIT, pas par jour.
 * ================================================================== */
/* TZ et jourParis sont declares avec les helpers, en tete : les deux vues
   qui precedent s'en servent aussi. */
const DEBUT = 17;          // bord gauche de la piste, en heures
const FIN = 31;            // bord droit (07h le lendemain)
const AUBE = 7;            // avant 7h, on appartient a la nuit precedente
const PASTILLE_PX = 56;    // largeur reelle d'une pastille
const VOIE_PX = 22;        // hauteur d'une voie d'empilement
const NB_NUITS = 14;
/* Limite de tolerance personnelle, en heures etendues : 25,75 = 01h45.
   Ce n'est pas un arrondi de confort. La distribution des departs montre un
   gros bloc a 01h40 (89 matchs par saison) puis un creux, le paquet suivant
   n'arrivant qu'a 02h05. Le seuil tombe donc dans le trou. */
const LIMITE_TENABLE = 25.75;

const fmtParis = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function decalerJour(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`); // midi : immunise contre les changements d'heure
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Renvoie la nuit d'appartenance et l'heure "etendue" (25.17 = 01h10). */
function nuitDe(isoUtc) {
  const p = Object.fromEntries(
    fmtParis.formatToParts(new Date(isoUtc)).map((x) => [x.type, x.value])
  );
  let h = Number(p.hour) + Number(p.minute) / 60;
  let jour = `${p.year}-${p.month}-${p.day}`;
  if (h < AUBE) {
    h += 24;
    jour = decalerJour(jour, -1);
  }
  return { jour, h, hhmm: `${p.hour}:${p.minute}` };
}

/* Une nuit chevauche toujours deux dates : la soiree et le petit matin.
   L'etiqueter d'un seul jour induirait en erreur pour un match a 01h10. */
function libelleNuit(iso) {
  const court = (s) => {
    const d = new Date(`${s}T12:00:00Z`);
    const j = d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
    const m = d.toLocaleDateString("fr-FR", { day: "numeric", timeZone: "UTC" });
    return `${j} ${m}`;
  };
  return { soir: court(iso), matin: court(decalerJour(iso, 1)) };
}

/* Empilement en voies : deux pastilles trop proches passent l'une sous l'autre. */
function repartirEnVoies(matchs, largeur) {
  const voies = [];
  for (const m of matchs) {
    let i = voies.findIndex((v) => m.pct - v[v.length - 1].pct >= largeur);
    if (i === -1) {
      voies.push([m]);
      i = voies.length - 1;
    } else {
      voies[i].push(m);
    }
    m.voie = i;
  }
  return Math.max(voies.length, 1);
}

/* ---------------------------------------------------------------- *
 *  COTE DE RENCONTRE — methode log5 (Bill James), en cotes.
 *  On combine les deux pourcentages de victoire puis on applique
 *  l'avantage du terrain : entre deux equipes egales, l'equipe qui
 *  recoit gagne environ 54 % du temps, soit un rapport de cotes 1,17.
 *  C'est une estimation grossiere : elle ignore les lanceurs partants,
 *  les blessures et la forme du moment.
 * ---------------------------------------------------------------- */
const AVANTAGE_TERRAIN = 1.17;

function coteDomicile(pctDom, pctExt) {
  if (pctDom == null || pctExt == null) return null;
  const borne = (p) => Math.min(0.85, Math.max(0.15, p)); // evite les cotes infinies
  const od = borne(pctDom) / (1 - borne(pctDom));
  const oe = borne(pctExt) / (1 - borne(pctExt));
  const r = (od / oe) * AVANTAGE_TERRAIN;
  return r / (1 + r);
}

/* ---------------------------------------------------------------- *
 *  INDICE DE SUSPENSE — somme des variations absolues de probabilite
 *  de victoire sur l'ensemble du match. Un match a sens unique tourne
 *  autour de 100, un renversement repete depasse 400.
 *  Bornes de deciles mesurees sur 34 matchs de juillet 2026 :
 *  mediane 211, quartiles 166 et 276.
 *  Cet indice NE REVELE PAS le vainqueur — c'est tout son interet.
 * ---------------------------------------------------------------- */
const DECILES = [92, 119, 171, 188, 211, 241, 260, 313, 363];
const CHAMPS_WP = "fields=homeTeamWinProbabilityAdded";

function noteSuspense(indice) {
  let n = 0;
  while (n < DECILES.length && indice >= DECILES[n]) n++;
  return n + 1; // 1 a 10
}

/* ---------------------------------------------------------------- *
 *  INDICE D'ENVIE
 *  Ce qui decide qu'on regarde un match depuis Paris, par ordre de
 *  poids reel : l'heure d'abord (un match a 4h ne sera pas regarde,
 *  quel que soit l'affiche), puis l'incertitude, puis le niveau des
 *  deux equipes. La cote sert ici a l'envers : elle predit mal le
 *  vainqueur, mais un 50/50 annonce un match plus disputé qu'un 75/25.
 *  Volontairement grossier — le but est de donner envie, pas de parier.
 * ---------------------------------------------------------------- */
function indiceEnvie(m, bilans) {
  if (m.etat === "Final") return -1;
  const p = m.coteDom ?? 0.5;
  const serre = 1 - Math.abs(2 * p - 1);
  const niveau = Math.max(
    0,
    Math.min(1, (((bilans[m.idDom]?.pct ?? 0.5) + (bilans[m.idExt]?.pct ?? 0.5)) / 2 - 0.42) / 0.16)
  );
  const heure = m.h < 24 ? 1 : m.h <= LIMITE_TENABLE ? 0.3 : 0;
  // Bonus d'enjeu : serie chaude, course au wild card, dernier match d'une serie.
  let enjeu = 0;
  for (const id of [m.idExt, m.idDom]) {
    const b = bilans[id];
    if (b?.serieNb >= 4) enjeu = Math.max(enjeu, 0.6);
    if (b?.wc != null && Math.abs(b.wc) <= 2) enjeu = Math.max(enjeu, 0.8);
    if (b?.magique != null && b.magique <= 15) enjeu = Math.max(enjeu, 1);
  }
  // Un derby de division vaut double dans la course : battre un rival direct
  // creuse l'ecart des deux cotes a la fois. Verifie sans biais horaire (0,93x).
  if (m.derby) {
    const enCourse = (b) => !!b && (b.meneur || b.magique != null || (b.wc != null && b.wc <= 6));
    enjeu = Math.max(enjeu, enCourse(bilans[m.idExt]) && enCourse(bilans[m.idDom]) ? 0.5 : 0.2);
  }
  // Pas de bonus pour la finale de serie : mesure sur 966 matchs, une finale
  // demarre a 20h heure de Paris en mediane contre 01h pour les autres, et
  // tombe 5,9x plus souvent avant minuit. Gagner une serie ne rapporte rien
  // au classement — le bonus ne recompensait donc que l'horaire, deja pondere
  // a 38 %. C'etait du double comptage.
  return 0.38 * heure + 0.26 * serre + 0.16 * niveau + 0.14 * enjeu + (m.neutre ? 0.06 : 0);
}

/* Formule la raison principale, en clair. */
function raisonEnvie(m, bilans, stades = {}, stadeHabituel = {}, spoilers = false) {
  const r = [];
  // L'heure figure desormais en tete de carte, avec l'etiquette EN SOIREE :
  // inutile de la redire ici. On ne garde le qualificatif que pour la tranche
  // 00h-01h30, qui n'a pas d'etiquette et merite d'etre signalee comme jouable.
  if (m.h >= 24 && m.h <= LIMITE_TENABLE) r.push("encore tenable malgré l'heure");

  // Les suivantes sont classees de la plus rare a la plus banale, sinon
  // « dernier match de la série » — un match sur trois — mange la place.
  if (m.neutre && m.stade) r.push(`à ${m.stade}`);

  // Une serie en cours revele le resultat de la nuit derniere : « sur 4
  // victoires » dit qu'ils ont gagne hier. On la tait tant que les resultats
  // sont masques.
  if (spoilers) {
    for (const id of [m.idExt, m.idDom]) {
      const s = libelleSerie(bilans[id]);
      if (s && s.remarquable) {
        r.push(`${id === m.idDom ? m.dom : m.ext} sur ${s.texte}`);
        break;
      }
    }
  }

  const e = enjeuEquipe(bilans[m.idDom]) || enjeuEquipe(bilans[m.idExt]);
  if (e && e.includes("wild card")) r.push(e);

  const p = m.coteDom;
  if (p != null && Math.abs(2 * p - 1) < 0.06) r.push("donné à pile ou face");

  // Ne le mentionner que pour un match nocturne : en soiree, « dernier match
  // de la serie » ne fait que redire « a une heure regardable ».
  if (m.h >= 24 && m.matchSerie && m.totalSerie && m.matchSerie === m.totalSerie && m.totalSerie > 2)
    r.push("dernier match de la série");

  const q = ((bilans[m.idDom]?.pct ?? 0.5) + (bilans[m.idExt]?.pct ?? 0.5)) / 2;
  if (q > 0.55) r.push("deux équipes du haut de tableau");

  if (r.length) return r.slice(0, 2).join(", ");
  // Aucun motif serieux : place a l'anecdote, qui ne vole donc rien.
  const a = anecdote(m, stades, stadeHabituel);
  if (a) return a;
  // Aucun motif distinctif : la carte est la pour l'horaire, et le repli doit
  // le dire sans contredire l'en-tete. Un repli unique se contredisait pour
  // les matchs de soiree, qui n'ont plus de qualificatif horaire dans `r`.
  if (m.h < 24) return "à une heure regardable, tout simplement";
  return "en pleine nuit, mais c'est du baseball";
}

/* ---------------------------------------------------------------- *
 *  LES ENJEUX
 *  Le nombre magique est le total de victoires de l'equipe en tete,
 *  ajoute aux defaites de son poursuivant, qui suffit a garantir la
 *  premiere place quoi qu'il arrive ensuite. Quand il tombe a zero,
 *  la division est acquise. C'est le decompte le plus jouissif du
 *  baseball : chaque soir il baisse de un ou de deux.
 * ---------------------------------------------------------------- */
const DIVISION_FR = (n = "") =>
  n
    .replace("American League", "AL")
    .replace("National League", "NL")
    .replace("East", "Est")
    .replace("Central", "Centre")
    .replace("West", "Ouest");

const RANG_FR = (r) => (r === 1 ? "1er" : r ? `${r}e` : "");

function libelleSerie(b) {
  if (!b?.serieNb) return null;
  const gagne = b.serieType === "wins";
  return {
    texte: `${b.serieNb} ${gagne ? "victoire" : "défaite"}${b.serieNb > 1 ? "s" : ""} d'affilée`,
    court: `${gagne ? "▲" : "▼"}${b.serieNb}`,
    chaud: b.serieNb >= 3,        // suffit pour colorer le badge
    remarquable: b.serieNb >= 4,  // exige davantage pour meriter une phrase
    gagne,
  };
}

/* Une phrase courte disant pourquoi le classement rend ce match interessant. */
function enjeuEquipe(b) {
  if (!b) return null;
  if (b.clinche) return "qualifiée";
  if (b.magique != null) return `nombre magique ${b.magique}`;
  if (b.wc != null && Math.abs(b.wc) <= 3) {
    return b.wc <= 0 ? `${Math.abs(b.wc).toFixed(1)} d'avance au wild card`
                     : `à ${b.wc.toFixed(1)} du wild card`;
  }
  if (b.retard != null && b.retard <= 4) return `à ${b.retard.toFixed(1)} de la tête`;
  return null;
}

/* ERA : points merites accordes par tranche de neuf manches. Moyenne de
   ligue autour de 4,10 — sous 3,20 c'est excellent, au-dessus de 5,00 c'est
   rude. C'est le chiffre par lequel on juge un lanceur en un coup d'oeil. */
function couleurEra(era) {
  const v = Number(era);
  if (!isFinite(v)) return T.dim;
  if (v < 3.2) return T.sodium;
  if (v > 5.0) return T.clay;
  return T.dim;
}

function Lanceur({ id, nom, st }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <Img
        src={PORTRAIT(id)}
        alt=""
        size={30}
        rond
        style={{ background: "rgba(239,243,234,.09)" }}
      />
      <span style={{ fontFamily: FF_MONO, fontSize: 10, lineHeight: 1.3, minWidth: 0 }}>
        <span style={{ color: T.chalk, display: "block" }}>{nom}</span>
        {st ? (
          <span
            title={`ERA ${st.era} — points mérités accordés toutes les neuf manches. Bilan ${st.v}-${st.d}, ${st.k} retraits sur prises.`}
            style={{ color: couleurEra(st.era), cursor: "help" }}
          >
            ERA {st.era} · {st.v}-{st.d}
          </span>
        ) : (
          <span style={{ color: T.dim }}>{"lanceur annoncé"}</span>
        )}
      </span>
    </span>
  );
}

/* Glose : un terme explicable au clic. Le survol ne suffit pas — il n'existe
   pas au toucher. L'explication sort en pleine largeur grace a flexBasis:100%,
   ce qui force un retour a la ligne dans les conteneurs flex-wrap qui
   l'accueillent (la ligne de situation et la rangee d'etiquettes). */
function Glose({ texte, children, style }) {
  const [ouvert, setOuvert] = useState(false);
  // `aria-expanded` seul annonce un controle deplie sans dire de quoi : il faut
  // designer la cible, donc lui donner un identifiant unique a l'instance.
  const id = React.useId();
  return (
    <>
      <button
        onClick={() => setOuvert(!ouvert)}
        aria-expanded={ouvert}
        aria-controls={id}
        title={texte}
        style={{ all: "unset", cursor: "help", ...style }}
      >
        {children}
      </button>
      {ouvert && (
        <span
          id={id}
          style={{
            flexBasis: "100%", fontFamily: FF_BODY, fontSize: 12.5,
            color: T.chalk, lineHeight: 1.45, marginTop: 5,
            borderLeft: `2px solid ${T.clay}`, paddingLeft: 9,
          }}
        >
          {texte}
        </span>
      )}
    </>
  );
}

/* Petite etiquette narrative, explicable au clic. */
function Etiquette({ children, titre, fort = false }) {
  return (
    <Glose
      texte={titre}
      style={{
        fontFamily: FF_MONO, fontSize: 8.5, letterSpacing: ".1em",
        padding: "2px 6px", borderRadius: 2, display: "inline-block",
        color: fort ? T.sodium : T.dim,
        border: `1px solid ${fort ? "rgba(242,206,107,.55)" : "rgba(239,243,234,.22)"}`,
        background: fort ? "rgba(242,206,107,.1)" : "transparent",
      }}
    >
      {children}
    </Glose>
  );
}

/* ---------------------------------------------------------------- *
 *  ANECDOTES
 *  Servies uniquement quand la carte n'a AUCUN motif serieux : elles
 *  ne prennent donc jamais la place d'une information. Toutes sont
 *  vraies — l'API donne l'altitude, les dimensions des clotures, la
 *  capacite et les coordonnees de chaque parc. Les jeux de noms sont
 *  la seule part de fantaisie, et ils portent sur des faits (les
 *  Orioles et les Blue Jays sont bien deux oiseaux).
 * ---------------------------------------------------------------- */
const PIED = 0.3048;
const m2 = (pieds) => Math.round(pieds * PIED);

/* Affiches cocasses. Le texte vit avec les identifiants : les separer
   en deux tables m'avait deja fait oublier d'en declarer la moitie. */

function blagueDeNoms(a, b) {
  const t = AFFICHES.find((x) => x.ids.includes(a) && x.ids.includes(b));
  return t ? t.texte : null;
}

function distanceKm(a, b) {
  if (!a?.lat || !b?.lat) return null;
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/* Renvoie une anecdote vraie sur ce match, ou null. */
function anecdote(m, stades, stadeHabituel) {
  const s = stades[m.idStade];
  const cand = [];

  // Ordre volontaire : du plus remarquable au plus anodin. On ne tire ensuite
  // que parmi les deux premieres, pour ne pas servir « 50 144 places »
  // quand on avait l'altitude de Coors Field sous la main.
  if (s?.alt >= 3000)
    cand.push(`à ${m2(s.alt)} m d'altitude — l'air est fin, la balle porte plus loin`);

  const b = blagueDeNoms(m.idExt, m.idDom);
  if (b) cand.push(b);

  if (s) {
    const petit = Math.min(s.gauche || 999, s.droite || 999);
    if (petit <= 315) cand.push(`clôture à ${m2(petit)} m seulement d'un côté, ça sort vite`);

    const km = distanceKm(stades[stadeHabituel[m.idExt]], s);
    if (km && km >= 3000) cand.push(`${km.toLocaleString("fr-FR")} km de voyage pour les visiteurs`);

    if (s.centre >= 415) cand.push(`champ centre à ${m2(s.centre)} m, il faudra courir`);
    if (s.places >= 50000)
      cand.push(`${s.places.toLocaleString("fr-FR")} places, un des plus grands parcs`);
    if (s.toit && s.toit !== "Open") cand.push("sous un toit, la météo n'aura pas son mot à dire");
  }

  if (!cand.length) return null;
  // Choix stable — un meme match donne toujours la meme anecdote — mais
  // restreint aux deux meilleures pour garder de la variete sans perdre en interet.
  return cand[m.id % Math.min(cand.length, 2)];
}

/* Le nom d'un stade renvoie vers sa fiche dans l'onglet Terrains. On passe
   par le fragment d'URL plutot que par un etat partage : le lien reste
   partageable et le bouton « precedent » du navigateur fonctionne seul.
   Composant unique, utilise par le bandeau du jour et le panneau de detail. */
function LienStade({ idStade, nom, style }) {
  if (!nom) return null;
  if (!idStade) return <span style={style}>{nom}</span>;
  return (
    <button
      onClick={() => {
        try {
          if (typeof window !== "undefined") window.location.hash = `terrains/${idStade}`;
        } catch {
          /* contexte restreint */
        }
      }}
      title={`Voir ${nom} sur la carte des terrains`}
      style={{
        all: "unset", cursor: "pointer", color: T.chalk,
        borderBottom: `1px solid ${T.clay}`, ...style,
      }}
    >
      {nom}
    </button>
  );
}

/* Panneau de detail : remplace l'infobulle, inutilisable au toucher.
   Il s'ouvre sous la nuit concernee pour rester dans son contexte. */
function DetailMatch({ m, parId, stades, lanceurs, note, spoilers, onFermer, vif, resumes }) {
  const [visionnage, setVisionnage] = useState(null);
  const eqE = parId[m.idExt], eqD = parId[m.idDom];
  const s = stades[m.idStade];
  const fini = m.etat === "Final";
  const ligne = (k, v) =>
    v ? (
      <div style={{ display: "flex", gap: 8, fontSize: 11.5, flexWrap: "wrap" }}>
        <span style={{ color: T.dim, minWidth: 74, flexShrink: 0 }}>{k}</span>
        <span style={{ color: T.chalk, minWidth: 0 }}>{v}</span>
      </div>
    ) : null;

  return (
    <div
      className="alm-rise alm-detail"
      style={{
        background: "rgba(11,36,26,.9)", border: `1px solid ${T.clay}`,
        borderRadius: 3, padding: "12px 14px", margin: "2px 0 10px 74px",
        fontFamily: FF_MONO,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Img src={CAP(m.idExt)} alt="" size={24} />
        <span style={{ fontSize: 12.5, color: T.chalk }}>{eqE?.name || m.ext}</span>
        <span style={{ color: T.dim }}>@</span>
        <Img src={CAP(m.idDom)} alt="" size={24} />
        <span style={{ fontSize: 12.5, color: T.chalk }}>{eqD?.name || m.dom}</span>
        <button
          onClick={onFermer}
          aria-label="Fermer"
          style={{
            all: "unset", cursor: "pointer", marginLeft: "auto",
            color: T.dim, fontSize: 15, padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "grid", gap: 3 }}>
        {ligne("heure", `${m.hhmm} à Paris`)}
        {/* Le stade renvoie vers sa fiche dans l'onglet Terrains. On passe par
            le fragment plutot que par un etat partage : le lien reste
            partageable et le bouton « precedent » fonctionne tout seul. */}
        <div style={{ display: "flex", gap: 8, fontSize: 11.5, flexWrap: "wrap" }}>
          <span style={{ color: T.dim, minWidth: 74, flexShrink: 0 }}>stade</span>
          <span style={{ minWidth: 0 }}>
            <LienStade idStade={m.idStade} nom={m.stade} />
            {s?.ville ? <span style={{ color: T.chalk }}> · {s.ville}</span> : null}
            {m.neutre ? <span style={{ color: T.sodium }}>  ◆ terrain neutre</span> : null}
          </span>
        </div>
        {ligne("série", m.matchSerie && m.totalSerie ? `match ${m.matchSerie} sur ${m.totalSerie}` : null)}
        {ligne("division", m.derby ? "derby : les deux équipes du même groupe" : null)}
        {ligne(
          "cote",
          m.coteDom != null && !fini
            ? `${Math.round(m.coteDom * 100)} % pour ${m.dom}, qui reçoit`
            : null
        )}
        {ligne("suspense", note != null ? `${note}/10 — sans révéler le vainqueur` : null)}
        {ligne("score", fini && spoilers ? `${m.scoreExt} – ${m.scoreDom}` : null)}
        {ligne(
          "en direct",
          vif
            ? `${abregeManche(vif)} · ${vif.retraits ?? 0} retrait${(vif.retraits ?? 0) > 1 ? "s" : ""}` +
              (spoilers ? ` · ${vif.ext} – ${vif.dom}` : " · score masqué")
            : null
        )}
        {ligne(
          "état",
          m.reporte
            ? "reporté — il n'a pas été joué"
            : fini && !spoilers
            ? "terminé — score masqué"
            : m.etat === "Live"
            ? "en cours"
            : null
        )}
      </div>

      {m.idLanceurExt && m.idLanceurDom && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 11 }}>
          <Lanceur id={m.idLanceurExt} nom={m.lanceurExt} st={lanceurs[m.idLanceurExt]} />
          <span style={{ color: T.clay, fontSize: 12, alignSelf: "center" }}>×</span>
          <Lanceur id={m.idLanceurDom} nom={m.lanceurDom} st={lanceurs[m.idLanceurDom]} />
        </div>
      )}

      {/* Les montages officiels du match. Le titre du resume commente
          annonce le vainqueur : on ne l'affiche jamais tant que les scores
          sont masques, et on ne met pas de vignette pour la meme raison. */}
      {m.etat === "Final" && !m.reporte && resumes && (resumes.recap || resumes.condense) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {resumes.condense && (
              <button
                className="alm-btn"
                onClick={() => setVisionnage(visionnage === "condense" ? null : resumes.condense)}
                style={btnStyle(visionnage?.url === resumes.condense.url)}
              >
                Match condensé · {resumes.condense.duree?.replace(/^00:/, "")}
              </button>
            )}
            {resumes.recap && (
              <button
                className="alm-btn"
                onClick={() => setVisionnage(visionnage?.url === resumes.recap.url ? null : resumes.recap)}
                style={btnStyle(false)}
              >
                Résumé commenté · {resumes.recap.duree?.replace(/^00:/, "")}
              </button>
            )}
          </div>

          {visionnage && (
            <div style={{ marginTop: 10 }}>
              <video
                key={visionnage.url}
                src={visionnage.url}
                controls
                autoPlay
                preload="none"
                playsInline
                style={{
                  width: "100%", display: "block", borderRadius: 3,
                  background: "#000", border: "1px solid rgba(239,243,234,.2)",
                }}
              />
              <p style={{ fontSize: 10, color: T.dim, margin: "6px 0 0" }}>
                {visionnage.adaptatif
                  ? "Flux adaptatif : la qualité s'ajuste au débit."
                  : "Fichier unique en 720p — le condensé pèse environ 345 Mo, à éviter en données mobiles."}
              </p>
            </div>
          )}

          {!spoilers && (
            <p style={{ fontSize: 10, color: T.dim, margin: "8px 0 0" }}>
              Le résumé commenté annonce le vainqueur dès les premières secondes. Le match condensé,
              lui, enchaîne les actions sans commentaire.
            </p>
          )}
        </div>
      )}

      {m.etat === "Final" && !m.reporte && resumes === undefined && (
        <p style={{ fontFamily: FF_MONO, fontSize: 10.5, color: T.dim, marginTop: 12 }}>
          Recherche des montages…
        </p>
      )}

      {(lanceurs[m.idLanceurExt] || lanceurs[m.idLanceurDom]) && (
        <p
          style={{
            fontFamily: FF_BODY, fontSize: 12, color: T.dim,
            margin: "9px 0 0", lineHeight: 1.45,
          }}
        >
          ERA : points mérités accordés toutes les neuf manches — la note d'un lanceur. Moyenne de
          ligue autour de 4,10 ; en jaune sous 3,20, en rouge au-dessus de 5,00.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 *  LE MATCH DU JOUR
 *  Pas le meilleur des deux semaines — « A ne pas rater » s'en charge —
 *  mais le meilleur de la prochaine nuit qui contient encore un match a
 *  venir. La question n'est pas la meme : que regarder ce soir ?
 * ---------------------------------------------------------------- */
/* Au-dela de deux jours, ce n'est plus « du jour ». Cette borne sert aussi de
   garde-fou quand on feuillette les semaines suivantes : sans elle, avancer
   d'une semaine proposerait un match dans huit jours avec un compte a rebours
   absurde. « A ne pas rater » est l'outil pour planifier loin, pas celui-ci. */
const HORIZON_JOUR = 48 * 3600e3;

function choisirMatchDuJour(tous, bilans, maintenant = Date.now()) {
  const avenir = tous.filter((m) => {
    if (!m.debut) return false;
    const dans = new Date(m.debut).getTime() - maintenant;
    return dans > 0 && dans <= HORIZON_JOUR;
  });
  if (!avenir.length) return null;

  // La nuit la plus proche qui contienne encore quelque chose.
  const nuit = avenir.map((m) => m.nuit).sort()[0];
  const dedans = avenir.filter((m) => m.nuit === nuit);

  const notes = dedans.map((m) => ({ m, s: indiceEnvie(m, bilans) }));
  const max = Math.max(...notes.map((x) => x.s));
  // Quand plusieurs matchs se tiennent, on laisse la date trancher : la
  // proposition varie d'un jour a l'autre sans jamais bouger dans la journee.
  const exaequo = notes.filter((x) => x.s >= max - 0.08).map((x) => x.m);
  const graine = Number(nuit.replaceAll("-", ""));
  return exaequo[graine % exaequo.length];
}

/* « dans 4 h 12 », « dans 38 min », « c'est maintenant ». */
function compteARebours(debut, maintenant = Date.now()) {
  const ms = new Date(debut).getTime() - maintenant;
  if (ms <= 0) return "c'est maintenant";
  const min = Math.round(ms / 60000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `dans ${h} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
  const j = Math.round(h / 24);
  return j <= 1 ? "demain" : `dans ${j} jours`;
}

/* ---------------------------------------------------------------- *
 *  RESUMES DE MATCH
 *  Deux montages officiels accompagnent chaque match termine :
 *    mlb_recap       ~3 min, commente, et dont LE TITRE SPOILE
 *    condensed_game  ~11 min, toutes les actions, titre neutre
 *  Les mp4 sont enormes (345 Mo pour le condense, 1,3 Go en haute
 *  definition) et il n'existe pas de variante legere. Les flux HLS sont
 *  adaptatifs et bien plus econome : on les prefere quand le navigateur
 *  sait les lire nativement — Safari oui, Chrome demanderait hls.js.
 * ---------------------------------------------------------------- */
function sourceLisible(playbacks = []) {
  const hls = playbacks.find((p) => p.name === "hlsCloud" || p.url?.endsWith(".m3u8"));
  const mp4 = playbacks.find((p) => p.name === "mp4Avc") || playbacks.find((p) => p.url?.endsWith(".mp4"));
  if (hls && typeof document !== "undefined") {
    const v = document.createElement("video");
    if (v.canPlayType("application/vnd.apple.mpegurl")) return { url: hls.url, adaptatif: true };
  }
  return mp4 ? { url: mp4.url, adaptatif: false } : null;
}

function extraireResumes(contenu) {
  const items = contenu?.highlights?.highlights?.items || [];
  const par = (tax) =>
    items.find((it) => (it.keywordsAll || []).some((k) => k.type === "mlbtax" && k.value === tax));
  const monter = (it) => {
    if (!it) return null;
    const s = sourceLisible(it.playbacks);
    return s ? { ...s, duree: it.duration, titre: it.title } : null;
  };
  return { recap: monter(par("mlb_recap")), condense: monter(par("condensed_game")) };
}

/* Un match reporte dont le rattrapage est deja programme apparait deux fois
   sous le meme gamePk. On ne garde alors que celui qui sera reellement joue.
   S'il n'a pas encore de date de rattrapage, on conserve la mention
   « reporte » : elle explique pourquoi la soiree etait vide. */
function purgerReports(liste) {
  const parPk = new Map();
  for (const m of liste) {
    if (!parPk.has(m.id)) parPk.set(m.id, []);
    parPk.get(m.id).push(m);
  }
  const garder = new Set();
  for (const groupe of parPk.values()) {
    const joues = groupe.filter((m) => !m.reporte);
    for (const m of (joues.length ? joues : groupe.slice(0, 1))) garder.add(m.cle);
  }
  return liste.filter((m) => garder.has(m.cle));
}

const GRADUATIONS = [18, 21, 24, 27, 30];
const pos = (h) => ((h - DEBUT) / (FIN - DEBUT)) * 100;

/* « 5e ▲ » : manche en cours et moitie. Sans le score, ce n'est pas un
   spoiler — ca dit seulement que le match est en train de se jouer. */
function abregeManche(v) {
  if (!v?.manche) return "en cours";
  const fleche = /^Top|^Middle/.test(v.moitie || "") ? "▲" : "▼";
  return `${v.manche.replace(/(st|nd|rd|th)$/, "")}e ${fleche}`;
}

function Pastille({ m, spoilers, suivi, largeur, hauteur, note, onOuvrir, ouvert, vif }) {
  const fini = m.etat === "Final";
  const live = m.etat === "Live";
  const p = m.coteDom;
  // Une ligne d'appoint n'apparait que s'il y a quelque chose a dire.
  const appoint =
    // Le direct passe devant tout le reste : c'est la seule information
    // perissable de l'ecran.
    live && vif
      ? spoilers
        ? `${vif.ext}–${vif.dom} · ${abregeManche(vif)}`
        : abregeManche(vif)
      : note != null
      ? `${note}/10`
      : fini && spoilers
      ? `${m.scoreExt}–${m.scoreDom}`
      : null;

  return (
    <button
      className="alm-pill"
      title={m.infobulle}
      onClick={() => onOuvrir(m.cle)}
      aria-label={`Détails : ${m.ext} contre ${m.dom} à ${m.hhmm}`}
      aria-expanded={ouvert}
      style={{
        all: "unset", cursor: "pointer", boxSizing: "border-box",
        position: "absolute",
        left: `${m.pct * 100}%`,
        top: m.voie * hauteur,
        width: `${largeur * 100}%`,
        height: hauteur - 4,
        padding: "3px 4px 0",
        borderRadius: 2,
        background: suivi ? "rgba(194,96,58,.9)" : "rgba(11,36,26,.85)",
        border: `1px solid ${
          ouvert ? T.chalk
            : m.neutre ? T.sodium : live ? T.sodium : suivi ? T.clay : "rgba(239,243,234,.24)"
        }`,
        boxShadow: m.neutre ? `0 0 0 1px ${T.sodium}` : undefined,
        color: suivi ? "#12241B" : T.chalk,
        // Toute la nuit est affichee : on estompe ce qu'on ne suit pas pour
        // que les pastilles en terre battue ressortent.
        opacity: (fini && !spoilers && note == null ? 0.6 : 1) * (suivi ? 1 : 0.55),
        fontFamily: FF_MONO,
        lineHeight: 1,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <Img src={CAP(m.idExt, !suivi)} alt={m.ext} size={14} />
        <span className="alm-mini" style={{ fontSize: 7.5, opacity: .5 }}>@</span>
        <Img src={CAP(m.idDom, !suivi)} alt={m.dom} size={14} />
        {m.neutre && (
          <span style={{ marginLeft: "auto", fontSize: 9, color: suivi ? "#12241B" : T.sodium }}>◆</span>
        )}
      </div>

      {appoint && (
        <div
          style={{
            fontSize: 8.5, marginTop: 2, fontWeight: 700,
            color: note != null ? (suivi ? "#12241B" : T.sodium) : "inherit",
          }}
        >
          {appoint}
        </div>
      )}

      {/* cote de rencontre : la part claire revient a l'equipe qui recoit */}
      {p != null && !fini && (
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0, height: 2,
            background: suivi ? "rgba(18,36,27,.35)" : "rgba(239,243,234,.18)",
          }}
        >
          <div
            style={{
              position: "absolute", right: 0, top: 0, bottom: 0,
              width: `${p * 100}%`,
              background: suivi ? "#12241B" : T.sodium,
              opacity: suivi ? .55 : .7,
            }}
          />
        </div>
      )}
    </button>
  );
}

/* Bilan, serie, retard et nombre magique derivent tous du classement, donc du
   resultat de la nuit precedente : « sur 4 victoires » dit qu'ils ont gagne
   hier. Le bandeau entier est un spoiler et ne s'affiche que sur demande.
   Compose a part pour etre testable : au rendu serveur les effets ne tournent
   pas, donc VueNuits reste en phase de chargement et ne montrerait jamais rien. */
function BandeauSituation({ situation, spoilers, onAfficher }) {
  if (!situation?.length) return null;

  if (!spoilers) {
    return (
      <button
        onClick={onAfficher}
        style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%",
          boxSizing: "border-box", marginBottom: 22, padding: "10px 14px",
          border: "1px dashed rgba(239,243,234,.28)", borderRadius: 3,
          fontFamily: FF_MONO, fontSize: 10.5, color: T.dim, lineHeight: 1.6,
        }}
      >
        <span style={{ color: T.sodium, letterSpacing: ".18em" }}>LA SITUATION</span>
        {" — masquée : bilans, séries et nombre magique révèlent la nuit dernière."}
        <br />
        <span style={{ color: T.clay, borderBottom: "1px solid currentColor" }}>
          afficher quand même
        </span>
      </button>
    );
  }

  return (
<div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em",
            color: T.sodium, marginBottom: 8,
          }}
        >
          LA SITUATION
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {situation.map(({ eq, b }) => {
            const s = libelleSerie(b);
            return (
              <div
                key={eq.id}
                style={{
                  display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
                  background: "rgba(11,36,26,.5)", borderRadius: 3, padding: "7px 11px",
                  fontFamily: FF_MONO, fontSize: 11,
                }}
              >
                <Img src={CAP(eq.id)} alt="" size={22} />
                <span style={{ color: T.chalk }}>{eq.abbreviation}</span>
                <span style={{ color: T.chalk, fontWeight: 700 }}>
                  {b.v}-{b.d}
                </span>
                <span style={{ color: T.dim }}>
                  {RANG_FR(b.rang)} {DIVISION_FR(eq.division?.name || "")}
                  {b.retard ? ` · à ${b.retard.toFixed(1)}` : ""}
                  {b.wc != null && !b.meneur
                    ? ` · wild card ${b.wc <= 0 ? `+${Math.abs(b.wc).toFixed(1)}` : b.wc.toFixed(1)}`
                    : ""}
                </span>
                {s && (
                  <Glose
                    texte={`Série en cours : ${s.texte}. Le triangle pointe vers le haut pour des victoires, vers le bas pour des défaites.`}
                    style={{
                      color: s.chaud ? (s.gagne ? T.sodium : T.clay) : T.dim,
                      fontWeight: s.chaud ? 700 : 400,
                    }}
                  >
                    {s.court}
                  </Glose>
                )}
                {b.clinche && (
                  <span style={{ marginLeft: "auto", color: T.sodium, fontWeight: 700 }}>
                    QUALIFIÉE
                  </span>
                )}
                {!b.clinche && b.magique != null && (
                  <Glose
                    texte="Nombre magique : le total de victoires de cette équipe, ajouté aux défaites de son poursuivant, qui suffit à lui garantir la division. Il baisse d'un cran à chaque victoire, et d'un cran aussi quand le poursuivant perd. À zéro, c'est plié."
                    style={{
                      marginLeft: "auto", background: "rgba(242,206,107,.16)",
                      border: `1px solid ${T.sodium}`, color: T.sodium,
                      borderRadius: 2, padding: "2px 7px", fontWeight: 700,
                      display: "inline-block",
                    }}
                  >
                    magique {b.magique}
                  </Glose>
                )}
                {!b.clinche && b.magique == null && b.elimination != null && (
                  <Glose
                    texte="Nombre d'éliminations : les défaites de cette équipe, ajoutées aux victoires du meneur, qui la sortiraient définitivement de la course à la division. C'est exactement le même calcul que le nombre magique, vu depuis l'autre camp."
                    style={{ marginLeft: "auto", color: T.dim, display: "inline-block" }}
                  >
                    élimination {b.elimination}
                  </Glose>
                )}
              </div>
            );
          })}
        </div>
      </div>
  );
}

function VueNuits({ teams, suivies, setSuivies, stadeHabituel = {}, bilans = {}, stades = {}, saisonBilans = null }) {
  const [ancre, setAncre] = useState(() => decalerJour(jourParis(), -1));
  const [matchs, setMatchs] = useState([]);
  const [phase, setPhase] = useState("load");
  const [erreur, setErreur] = useState("");
  const [spoilers, setSpoilers] = useState(false);
  const [ouvertEquipes, setOuvertEquipes] = useState(false);
  // La largeur d'empilement doit suivre la largeur reelle de la piste :
  // sur mobile, 15 matchs groupes a 01h s'empilent forcement davantage.
  const [choisi, setChoisi] = useState(null); // gamePk ouvert au clic
  const [suspense, setSuspense] = useState({}); // gamePk -> indice brut
  const [jauge, setJauge] = useState({ etat: "repos", fait: 0, total: 0 });
  const pisteRef = useRef(null);
  const [pisteW, setPisteW] = useState(640);
  useEffect(() => {
    const el = pisteRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setPisteW(e.contentRect.width || 640));
    ro.observe(el);
    return () => ro.disconnect();
    // Sans tableau de dependances, l'observateur etait reconstruit et
    // redetache a CHAQUE rendu de la vue. La piste est montee une fois pour
    // toutes : on ne s'abonne donc qu'au montage.
  }, []);
  const largeur = Math.min(0.35, Math.max(0.05, PASTILLE_PX / pisteW));
  // Une ligne d'appoint (score ou note) fait grandir les pastilles.

  const nuits = useMemo(
    () => Array.from({ length: NB_NUITS }, (_, i) => decalerJour(ancre, i)),
    [ancre]
  );

  useEffect(() => {
    let annule = false;
    // Passage en etat « chargement » avant la requete : meme motif que dans
    // le carnet, la regle ne distingue pas un aller-retour reseau d'une
    // synchronisation entre deux etats React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("load");
    setErreur("");
    // On tire une journee MLB de plus : une nuit parisienne deborde sur le
    // lendemain americain. On volontairement PAS `broadcasts` (x3 le poids
    // pour des diffuseurs americains inutiles depuis la France).
    jsonMlb(
      `${API}/schedule?sportId=1&startDate=${ancre}&endDate=${decalerJour(ancre, NB_NUITS)}` +
        `&hydrate=team,probablePitcher`
    )
      .then((d) => {
        if (annule) return;
        const out = [];
        for (const jour of d.dates || []) {
          for (const g of jour.games || []) {
            const { jour: nuit, h, hhmm } = nuitDe(g.gameDate);
            const brut = (h - DEBUT) / (FIN - DEBUT);
            out.push({
              id: g.gamePk,
              // Un report conserve son gamePk et figure sous DEUX dates :
              // l'originale marquee Postponed et celle du rattrapage. Le
              // gamePk ne suffit donc pas a designer une occurrence.
              cle: `${g.gamePk}@${nuit}`,
              debut: g.gameDate,   // instant UTC, pour le compte a rebours
              nuit,
              h,
              hhmm,
              avant: brut < 0,
              brut,
              ext: g.teams.away.team.abbreviation || "?",
              dom: g.teams.home.team.abbreviation || "?",
              idExt: g.teams.away.team.id,
              idDom: g.teams.home.team.id,
              scoreExt: g.teams.away.score,
              scoreDom: g.teams.home.score,
              etat: g.status?.abstractGameState,
              // "F" = vraiment joue, "D" = reporte (pluie le plus souvent).
              reporte: g.status?.codedGameState === "D",
              stade: g.venue?.name || "",
              idStade: g.venue?.id,
              typeMatch: g.gameType,
              matchSerie: g.seriesGameNumber,
              totalSerie: g.gamesInSeries,
              // Annonces environ trois jours a l'avance seulement : 91 % le
              // jour meme, 53 % a J+2, quasi rien au-dela.
              lanceurExt: g.teams.away.probablePitcher?.fullName || null,
              lanceurDom: g.teams.home.probablePitcher?.fullName || null,
              idLanceurExt: g.teams.away.probablePitcher?.id || null,
              idLanceurDom: g.teams.home.probablePitcher?.id || null,
              infobulle:
                `${g.teams.away.team.name} @ ${g.teams.home.team.name} — ${hhmm} (Paris)` +
                (g.seriesGameNumber && g.gamesInSeries
                  ? `\nMatch ${g.seriesGameNumber} sur ${g.gamesInSeries} de la série`
                  : "") +
                (g.venue?.name ? `\n${g.venue.name}` : "") +
                (g.teams.away.probablePitcher || g.teams.home.probablePitcher
                  ? `\nLanceurs annoncés : ${g.teams.away.probablePitcher?.fullName || "?"}` +
                    ` / ${g.teams.home.probablePitcher?.fullName || "?"}`
                  : ""),
            });
          }
        }
        setMatchs(purgerReports(out));
        setPhase("ok");
      })
      .catch((e) => {
        if (annule) return;
        setErreur(String(e?.message || e));
        setPhase("erreur");
      });
    return () => {
      annule = true;
    };
  }, [ancre]); // volontairement pas `stadeHabituel` : il arrive plus tard et
               // relancerait une requete inutile. Le terrain neutre se calcule
               // au rendu, ci-dessous.

  const parId = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const divisionDe = useMemo(
    () => Object.fromEntries(teams.filter((t) => t.division?.id).map((t) => [t.id, t.division.id])),
    [teams]
  );
  const toutes = suivies.length === 0; // aucune selection = tout afficher
  /* Memorise : `aSuivre` en depend, et une fonction recreee a chaque rendu
     aurait vide ce memo de son interet. */
  const estSuivi = useCallback(
    (m) => toutes || suivies.includes(m.idExt) || suivies.includes(m.idDom),
    [toutes, suivies]
  );

  const parNuit = useMemo(() => {
    const carte = new Map(nuits.map((n) => [n, []]));
    for (const m of matchs) {
      if (!carte.has(m.nuit)) continue;
      // La frise montre TOUS les matchs : le filtre ne sert plus qu'a la
      // couleur des pastilles et a ce qui nourrit les recommandations.
      carte.get(m.nuit).push(m);
    }
    for (const [, liste] of carte) {
      liste.sort((a, b) => a.h - b.h);
      for (const m of liste) {
        // Terrain neutre : dix matchs par saison (Mexico, Las Vegas, Field of
        // Dreams, Little League Classic). On exclut le printemps, ou tout le
        // monde joue hors de chez soi.
        const habituel = stadeHabituel[m.idDom];
        m.neutre = !["S", "E"].includes(m.typeMatch) && !!habituel && m.idStade !== habituel;
        m.coteDom = coteDomicile(bilans[m.idDom]?.pct, bilans[m.idExt]?.pct);
        // Derby de division : 32 % des matchs. Contrairement a la finale de
        // serie, aucun biais horaire (0,93x) — c'est donc un vrai enjeu.
        const dA = divisionDe[m.idExt];
        m.derby = !!dA && dA === divisionDe[m.idDom];
        m.finale = !!(m.matchSerie && m.totalSerie && m.matchSerie === m.totalSerie && m.totalSerie > 2);
      }
      for (const m of liste) m.pct = Math.max(0, Math.min(1 - largeur, m.brut));
      repartirEnVoies(liste, largeur);
    }
    return carte;
    // Ni `suivies` ni `toutes` n'interviennent ici : depuis que la frise
    // montre toute la nuit, le suivi ne decide plus que d'une couleur, au
    // rendu. Les garder relancait le calcul a chaque changement de selection.
  }, [matchs, nuits, largeur, stadeHabituel, bilans, divisionDe]);

  // Situation au classement des equipes suivies. Au-dela de cinq, la liste
  // devient un tableau de classement — ce n'est pas le role de cette vue.
  const situation = useMemo(() => {
    if (toutes || suivies.length > 5) return [];
    return suivies
      .map((id) => ({ eq: parId[id], b: bilans[id] }))
      .filter((x) => x.eq && x.b);
  }, [suivies, bilans, parId, toutes]);

  // Horloge du compte a rebours : une minute suffit, personne ne compte
  // les secondes avant un match qui dure trois heures.
  const [instant, setInstant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setInstant(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  /* LE DIRECT
     Hydrater linescore sur toute la fenetre couterait 76 Ko pour une donnee
     qui ne concerne au plus qu'une quinzaine de matchs, et seulement pendant
     qu'ils se jouent. On interroge donc la seule journee en cours, avec un
     filtre de champs : 2 Ko. Le rafraichissement ne tourne que tant qu'un
     match est effectivement en cours. */
  const [direct, setDirect] = useState({});
  const yaDuDirect = useMemo(
    () => [...parNuit.values()].flat().some((m) => m.etat === "Live"),
    [parNuit]
  );
  useEffect(() => {
    if (!yaDuDirect) return;
    let annule = false;
    const tirer = () => {
      const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
      jsonMlb(
        `${API}/schedule?sportId=1&date=${jour}&hydrate=linescore` +
          `&fields=dates,games,gamePk,status,abstractGameState,linescore,` +
          `currentInningOrdinal,inningState,outs,teams,home,away,runs`
      )
        .then((d) => {
          if (annule) return;
          const m = {};
          for (const jr of d.dates || [])
            for (const g of jr.games || []) {
              const l = g.linescore;
              if (!l || g.status?.abstractGameState !== "Live") continue;
              m[g.gamePk] = {
                manche: l.currentInningOrdinal,
                moitie: l.inningState,          // Top / Bottom / Middle / End
                retraits: l.outs,
                ext: l.teams?.away?.runs,
                dom: l.teams?.home?.runs,
              };
            }
          setDirect(m);
        })
        .catch(() => {});
    };
    tirer();
    const id = setInterval(tirer, 60000);
    return () => {
      annule = true;
      clearInterval(id);
    };
  }, [yaDuDirect]);

  const ligneAppoint = spoilers || Object.keys(suspense).length > 0 || yaDuDirect;
  // Sur piste etroite on grossit les voies : une pastille de 18 px est
  // intouchable au doigt, la recommandation courante etant de 44.
  const etroit = pisteW < 420;
  const base = etroit ? VOIE_PX + 8 : VOIE_PX;
  const hauteurVoie = ligneAppoint ? base + 12 : base;

  /* Les recommandations, elles, restent centrees sur tes equipes : la frise
     te montre la nuit entiere, mais on ne te propose pas d'aller regarder
     une affiche que tu n'as pas choisi de suivre. */
  const aSuivre = useMemo(
    () => [...parNuit.values()].flat().filter(estSuivi),
    [parNuit, estSuivi]
  );

  const matchDuJour = useMemo(
    () => choisirMatchDuJour(aSuivre, bilans, instant),
    [aSuivre, bilans, instant]
  );

  // Les trois matchs a venir les plus tentants de la fenetre affichee.
  const aVoir = useMemo(
    () =>
      aSuivre
        .map((m) => ({ m, s: indiceEnvie(m, bilans) }))
        .filter((x) => x.s > 0)
        // Deja mis en avant juste au-dessus : inutile de le redire.
        .filter((x) => x.m.cle !== matchDuJour?.cle)
        .sort((a, b) => b.s - a.s)
        // Une meme affiche revient plusieurs fois dans une serie : on ne
        // garde que sa meilleure occurrence, pour varier le panneau.
        .filter(
          (x, i, tout) =>
            tout.findIndex((y) => y.m.idExt === x.m.idExt && y.m.idDom === x.m.idDom) === i
        )
        .slice(0, 3)
        .map((x) => x.m)
        // Selection sur l'interet, affichage dans l'ordre chronologique :
        // le panneau se lit comme un agenda, pas comme un classement.
        .sort((a, b) => (a.nuit === b.nuit ? a.h - b.h : a.nuit < b.nuit ? -1 : 1)),
    [aSuivre, bilans, matchDuJour]
  );

  /* Le contenu d'un match pese 468 Ko et le filtre `fields` n'y fait rien :
     on ne le charge donc qu'a l'ouverture d'une fiche de match termine. */
  const [resumes, setResumes] = useState({});
  const matchOuvert = useMemo(
    () => (choisi == null ? null : [...parNuit.values()].flat().find((m) => m.cle === choisi) || null),
    [choisi, parNuit]
  );

  /* Statistiques des seuls lanceurs affiches sur les trois cartes : au plus
     six joueurs, une requete d'environ 15 Ko. L'hydratation via /schedule ne
     renvoie rien, il faut passer par /people. */
  const [lanceurs, setLanceurs] = useState({});
  const idsLanceurs = useMemo(
    () =>
      [
        ...new Set(
          [...aVoir, ...(matchOuvert ? [matchOuvert] : []), ...(matchDuJour ? [matchDuJour] : [])]
            .flatMap((m) => [m.idLanceurExt, m.idLanceurDom])
            .filter(Boolean)
        ),
      ]
        .sort()
        .join(","),
    [aVoir, matchOuvert, matchDuJour]
  );
  useEffect(() => {
    if (!idsLanceurs) return;
    let annule = false;
    const saison = new Date().getFullYear();
    jsonMlb(`${API}/people?personIds=${idsLanceurs}&hydrate=stats(group=pitching,type=season,season=${saison})`)
      .then((d) => {
        if (annule) return;
        const m = {};
        for (const p of d.people || []) {
          const s = p.stats?.[0]?.splits?.[0]?.stat;
          if (s) m[p.id] = { era: s.era, v: s.wins, d: s.losses, k: s.strikeOuts, main: p.pitchHand?.code };
        }
        setLanceurs((x) => ({ ...x, ...m }));
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [idsLanceurs]);

  useEffect(() => {
    const m = matchOuvert;
    if (!m || m.etat !== "Final" || m.reporte || resumes[m.id] !== undefined) return;
    let annule = false;
    jsonMlb(`${API}/game/${m.id}/content`)
      .then((c) => !annule && setResumes((x) => ({ ...x, [m.id]: extraireResumes(c) })))
      .catch(() => !annule && setResumes((x) => ({ ...x, [m.id]: null })));
    return () => {
      annule = true;
    };
  }, [matchOuvert, resumes]);

  const total = [...parNuit.values()].reduce((a, l) => a + l.length, 0);
  const soiree = [...parNuit.values()].flat().filter((m) => m.h < 24).length;
  const miens = toutes ? 0 : aSuivre.length;

  // La nuit "en cours" : avant 7h du matin, on est encore dans celle d'hier.
  const nuitCourante = useMemo(() => {
    const n = new Date();
    const h = Number(
      new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" })
        .format(n)
    );
    const auj = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(n);
    return h < AUBE ? decalerJour(auj, -1) : auj;
  }, []);

  /* Interroge winProbability pour les matchs termines actuellement affiches.
     Le filtre `fields` fait tomber la reponse de 1,1 Mo a 9,5 Ko par match ;
     sans lui, la fonctionnalite serait inutilisable. */
  const jauger = async () => {
    // On ne depense pas le budget de 45 requetes sur des matchs qu'on ne suit pas.
    const cibles = aSuivre
      .filter((m) => m.etat === "Final" && !m.reporte && suspense[m.id] == null)
      .map((m) => m.id);
    if (!cibles.length) return;
    const lot = cibles.slice(0, 45); // garde-fou : ~430 Ko maximum
    setJauge({ etat: "cours", fait: 0, total: lot.length });
    const trouve = {};
    for (let i = 0; i < lot.length; i += 6) {
      const paquet = lot.slice(i, i + 6);
      await Promise.all(
        paquet.map(async (pk) => {
          try {
            const w = await jsonMlb(`${API}/game/${pk}/winProbability?${CHAMPS_WP}`);
            trouve[pk] = (Array.isArray(w) ? w : []).reduce(
              (a, x) => a + Math.abs(x.homeTeamWinProbabilityAdded || 0),
              0
            );
          } catch {
            /* un match manquant n'empeche pas les autres */
          }
        })
      );
      setJauge((j) => ({ ...j, fait: Math.min(j.total, i + paquet.length) }));
    }
    setSuspense((s) => ({ ...s, ...trouve }));
    setJauge({ etat: "fini", fait: lot.length, total: lot.length });
  };

  const basculer = (id) =>
    setSuivies(suivies.includes(id) ? suivies.filter((x) => x !== id) : [...suivies, id]);

  return (
    <div className="alm-rise">
      {/* --- barre de controle --- */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button className="alm-btn" onClick={() => setAncre(decalerJour(ancre, -7))} style={btnStyle(false)}>
          ◂ semaine
        </button>
        <button className="alm-btn" onClick={() => setAncre(decalerJour(ancre, 7))} style={btnStyle(false)}>
          semaine ▸
        </button>
        <button
          className="alm-btn"
          onClick={() => setAncre(decalerJour(jourParis(), -1))}
          style={btnStyle(false)}
        >
          aujourd'hui
        </button>
        <button className="alm-btn" onClick={jauger} disabled={jauge.etat === "cours"} style={btnStyle(false)}>
          {jauge.etat === "cours"
            ? `jauge… ${jauge.fait}/${jauge.total}`
            : "Jauger le suspense"}
        </button>
        <label
          style={{
            fontFamily: FF_MONO, fontSize: 10, color: T.dim, letterSpacing: ".08em",
            display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} />
          AFFICHER LES RÉSULTATS
        </label>
      </div>

      {/* --- equipes suivies : toujours visibles, jamais repliees --- */}
      <div
        style={{
          display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          borderTop: "1px solid rgba(239,243,234,.18)", paddingTop: 12, marginBottom: 14,
        }}
      >
        <span
          style={{
            fontFamily: FF_MONO, fontSize: 10, color: T.sodium,
            letterSpacing: ".12em", marginRight: 4,
          }}
        >
          JE SUIS
        </span>

        {toutes ? (
          <span style={{ fontFamily: FF_MONO, fontSize: 11, color: T.chalk }}>
            les 30 équipes
          </span>
        ) : (
          suivies.map((id) => (
            <button
              key={id}
              className="alm-cell"
              onClick={() => basculer(id)}
              title={`Ne plus suivre ${parId[id]?.name || ""}`}
              style={{
                all: "unset", cursor: "pointer", fontFamily: FF_MONO, fontSize: 10,
                fontWeight: 700, padding: "4px 7px", borderRadius: 2,
                background: "rgba(194,96,58,.9)", color: "#12241B",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Img src={CAP(id, false)} alt="" size={16} />
                {parId[id]?.abbreviation || id} ×
              </span>
            </button>
          ))
        )}

        <button
          className="alm-btn"
          onClick={() => setOuvertEquipes(!ouvertEquipes)}
          aria-expanded={ouvertEquipes}
          style={{
            all: "unset", cursor: "pointer", fontFamily: FF_MONO, fontSize: 10,
            color: T.clay, borderBottom: "1px solid currentColor", marginLeft: 4,
          }}
        >
          {ouvertEquipes ? "fermer" : "modifier"}
        </button>
      </div>

      {ouvertEquipes && (
        <div className="alm-rise" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))", gap: 6,
            }}
          >
            {teams.map((t) => {
              const on = suivies.includes(t.id);
              return (
                <button
                  key={t.id}
                  className="alm-cell"
                  onClick={() => basculer(t.id)}
                  title={t.name}
                  aria-pressed={on}
                  style={{
                    all: "unset", cursor: "pointer", display: "block", boxSizing: "border-box",
                    textAlign: "center", padding: "6px 2px", borderRadius: 2,
                    fontFamily: FF_MONO, fontSize: 10, fontWeight: 700,
                    background: on ? "rgba(194,96,58,.9)" : "rgba(11,36,26,.4)",
                    color: on ? "#12241B" : T.dim,
                    border: `1px solid ${on ? T.clay : "rgba(239,243,234,.14)"}`,
                  }}
                >
                  <Img
                    src={ROND(t.id)}
                    alt=""
                    size={34}
                    style={{ margin: "0 auto 3px" }}
                  />
                  {t.abbreviation}
                </button>
              );
            })}
          </div>
          <p style={{ fontFamily: FF_MONO, fontSize: 9.5, color: T.dim, margin: "10px 0 0" }}>
            Ne rien sélectionner affiche les 30 équipes.{" "}
            <button
              className="alm-btn"
              onClick={() => setSuivies([])}
              style={{
                all: "unset", cursor: "pointer", color: T.clay,
                borderBottom: "1px solid currentColor",
              }}
            >
              tout désélectionner
            </button>
          </p>
        </div>
      )}

      {phase === "load" && (
        <p style={{ fontFamily: FF_MONO, fontSize: 12, color: T.dim, animation: "pulse 1.4s infinite" }}>
          Conversion des horaires…
        </p>
      )}

      {phase === "erreur" && (
        <div style={{ border: `1px solid ${T.clay}`, padding: 18, borderRadius: 3 }}>
          <p style={{ margin: 0, fontSize: 15 }}>Le calendrier n'est pas arrivé.</p>
          <p style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim, margin: "8px 0 0" }}>{erreur}</p>
        </div>
      )}

      {phase === "ok" && (
        <>
          {/* --- le match du jour --- */}
          {matchDuJour && (
            <div
              className="alm-rise"
              style={{
                border: `1px solid ${T.sodium}`, borderRadius: 3,
                background: "rgba(242,206,107,.07)", padding: "14px 16px", marginBottom: 22,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between",
                  gap: 10, flexWrap: "wrap", marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em", color: T.sodium,
                  }}
                >
                  LE MATCH DU JOUR
                </span>
                <span style={{ fontFamily: FF_MONO, fontSize: 12, color: T.chalk }}>
                  {compteARebours(matchDuJour.debut, instant)}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Img src={CAP(matchDuJour.idExt)} alt="" size={38} />
                <Img src={CAP(matchDuJour.idDom)} alt="" size={38} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: FF_DISPLAY, fontSize: 26, lineHeight: 1,
                      textTransform: "uppercase", letterSpacing: ".02em",
                    }}
                  >
                    {parId[matchDuJour.idExt]?.name || matchDuJour.ext}
                    <span style={{ color: T.dim }}> @ </span>
                    {parId[matchDuJour.idDom]?.name || matchDuJour.dom}
                  </div>
                  <div style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim, marginTop: 4 }}>
                    {libelleNuit(matchDuJour.nuit).soir}
                    <span style={{ color: matchDuJour.h < 24 ? T.sodium : T.chalk, fontWeight: 700 }}>
                      {" · "}{matchDuJour.hhmm.replace(":", "h")}
                    </span>
                    {" Paris · "}
                    <LienStade
                      idStade={matchDuJour.idStade}
                      nom={matchDuJour.stade}
                      style={{ fontFamily: FF_MONO, fontSize: 11 }}
                    />
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 14, color: T.sodium, fontStyle: "italic", margin: "10px 0 0" }}>
                {raisonEnvie(matchDuJour, bilans, stades, stadeHabituel, spoilers)}
              </p>

              {(matchDuJour.derby || matchDuJour.finale || matchDuJour.neutre) && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                  {matchDuJour.derby && <Etiquette titre="Les deux équipes sont de la même division : une victoire creuse l'écart des deux côtés à la fois.">DERBY</Etiquette>}
                  {matchDuJour.finale && <Etiquette titre={`Match ${matchDuJour.matchSerie} sur ${matchDuJour.totalSerie} : dernier de la série.`}>FINALE</Etiquette>}
                  {matchDuJour.neutre && <Etiquette fort titre={`Joué à ${matchDuJour.stade}, hors du stade habituel.`}>TERRAIN NEUTRE</Etiquette>}
                </div>
              )}

              {matchDuJour.idLanceurExt && matchDuJour.idLanceurDom && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 11 }}>
                  <Lanceur id={matchDuJour.idLanceurExt} nom={matchDuJour.lanceurExt} st={lanceurs[matchDuJour.idLanceurExt]} />
                  <span style={{ color: T.clay, fontSize: 12, alignSelf: "center" }}>×</span>
                  <Lanceur id={matchDuJour.idLanceurDom} nom={matchDuJour.lanceurDom} st={lanceurs[matchDuJour.idLanceurDom]} />
                </div>
              )}
            </div>
          )}

          {/* Hors saison, les bilans viennent de l'annee precedente : le dire,
              sinon les cotes et le classement passent pour l'actualite. */}
          {saisonBilans != null && saisonBilans !== new Date().getFullYear() && (
            <p
              style={{
                fontFamily: FF_MONO, fontSize: 10.5, color: T.sodium,
                border: "1px dashed rgba(242,206,107,.45)", borderRadius: 3,
                padding: "8px 12px", margin: "0 0 18px", lineHeight: 1.5,
              }}
            >
              Hors saison : bilans, cotes et classement sont ceux de {saisonBilans}, à leur
              dernier jour. Ils ne décrivent pas une course en cours.
            </p>
          )}

          {/* --- la situation au classement --- */}
          <BandeauSituation
            situation={situation}
            spoilers={spoilers}
            onAfficher={() => setSpoilers(true)}
          />

          {/* --- a ne pas rater --- */}
          {aVoir.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div
                style={{
                  fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em",
                  color: T.sodium, marginBottom: 8,
                }}
              >
                À NE PAS RATER
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {aVoir.map((m) => {
                  const l = libelleNuit(m.nuit);
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: "rgba(11,36,26,.6)",
                        border: `1px solid ${m.h < 24 ? "rgba(242,206,107,.5)" : "rgba(239,243,234,.18)"}`,
                        borderRadius: 3, padding: "9px 12px",
                      }}
                    >
                      <Img src={CAP(m.idExt)} alt="" size={26} />
                      <Img src={CAP(m.idDom)} alt="" size={26} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: FF_MONO, fontSize: 11.5, color: T.chalk }}>
                          {m.ext} <span style={{ opacity: .5 }}>@</span> {m.dom}
                          <span style={{ color: T.dim }}> · {l.soir} · </span>
                          <span style={{ color: m.h < 24 ? T.sodium : T.chalk, fontWeight: 700 }}>
                            {m.hhmm.replace(":", "h")}
                          </span>
                          <span style={{ color: T.dim, fontSize: 9.5 }}> Paris</span>
                        </div>
                        <div style={{ fontSize: 13, color: T.sodium, fontStyle: "italic" }}>
                          {raisonEnvie(m, bilans, stades, stadeHabituel, spoilers)}
                        </div>
                        <div
                          style={{
                            fontFamily: FF_MONO, fontSize: 9.5, color: T.dim, marginTop: 3,
                          }}
                        >
                          {m.stade}
                          {m.matchSerie && m.totalSerie
                            ? ` · match ${m.matchSerie}/${m.totalSerie}`
                            : ""}
                          {m.coteDom != null ? ` · cote ${Math.round(m.coteDom * 100)} % ${m.dom}` : ""}
                        </div>

                        {/* etiquettes narratives : hors du calcul des raisons,
                            elles ne volent donc la place d'aucune information */}
                        {(m.derby || m.finale || m.neutre) && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                            {m.derby && <Etiquette titre="Les deux équipes sont de la même division : une victoire creuse l'écart des deux côtés à la fois.">DERBY</Etiquette>}
                            {m.finale && <Etiquette titre={`Match ${m.matchSerie} sur ${m.totalSerie} : dernier de la série.`}>FINALE</Etiquette>}
                            {m.neutre && (
                              <Etiquette
                                fort
                                titre={`Ce match ne se joue pas dans le stade habituel de l'équipe qui reçoit, mais à ${m.stade}. Une dizaine de matchs par saison seulement.`}
                              >
                                TERRAIN NEUTRE
                              </Etiquette>
                            )}
                          </div>
                        )}

                        {m.idLanceurExt && m.idLanceurDom && (
                          <div
                            style={{
                              display: "flex", alignItems: "center", gap: 9,
                              flexWrap: "wrap", marginTop: 8,
                            }}
                          >
                            <Lanceur id={m.idLanceurExt} nom={m.lanceurExt} st={lanceurs[m.idLanceurExt]} />
                            <span style={{ color: T.clay, fontSize: 12 }}>×</span>
                            <Lanceur id={m.idLanceurDom} nom={m.lanceurDom} st={lanceurs[m.idLanceurDom]} />
                          </div>
                        )}
                      </div>
                      {m.h < 24 && (
                        <span
                          style={{
                            fontFamily: FF_MONO, fontSize: 9, letterSpacing: ".1em",
                            color: T.sodium, whiteSpace: "nowrap",
                          }}
                        >
                          EN SOIRÉE
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- graduation --- */}
          <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
            <div className="alm-etiquette-nuit" style={{ width: 62, flexShrink: 0 }} />
            <div ref={pisteRef} style={{ position: "relative", flex: 1, height: 14 }}>
              {GRADUATIONS.map((h) => (
                <div
                  key={h}
                  style={{
                    position: "absolute", left: `${pos(h)}%`, transform: "translateX(-50%)",
                    fontFamily: FF_MONO, fontSize: 9, letterSpacing: ".06em",
                    color: h === 24 ? T.sodium : T.dim,
                  }}
                >
                  {String(h % 24).padStart(2, "0")}h
                </div>
              ))}
            </div>
          </div>

          {/* --- les nuits --- */}
          {nuits.map((n) => {
            const liste = parNuit.get(n) || [];
            const voies = liste.length ? Math.max(...liste.map((m) => m.voie)) + 1 : 1;
            const l = libelleNuit(n);
            const ceSoir = n === nuitCourante;
            return (
              <div key={n}>
              <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                <div
                  className="alm-etiquette-nuit"
                  style={{
                    width: 62, flexShrink: 0, fontFamily: FF_MONO, fontSize: 10,
                    color: T.dim, paddingTop: 4, textAlign: "right", lineHeight: 1.35,
                  }}
                >
                  {ceSoir && (
                    <div style={{ color: T.sodium, fontSize: 8, letterSpacing: ".1em" }}>CE SOIR</div>
                  )}
                  <div style={{ color: ceSoir ? T.sodium : T.chalk }}>{l.soir}</div>
                  <div style={{ fontSize: 8.5, opacity: .75 }}>→ {l.matin}</div>
                </div>
                <div
                  style={{
                    position: "relative", flex: 1, minHeight: 30, height: voies * hauteurVoie + 6,
                    borderTop: `1px solid ${ceSoir ? "rgba(242,206,107,.4)" : "rgba(239,243,234,.07)"}`,
                  }}
                >
                  {/* moitie soir / moitie nuit */}
                  <div
                    style={{
                      position: "absolute", left: 0, width: "50%", top: 0, bottom: 0,
                      background: "rgba(242,206,107,.045)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute", left: "50%", top: 0, bottom: 0, width: 1,
                      background: "rgba(242,206,107,.45)",
                    }}
                  />
                  {liste.map((m) => (
                    <Pastille
                      key={m.cle}
                      m={{
                        ...m,
                        infobulle:
                          m.infobulle +
                          (m.coteDom != null && m.etat !== "Final"
                            ? `\nCote : ${Math.round(m.coteDom * 100)} % pour ${m.dom} (à domicile)`
                            : "") +
                          (suspense[m.id] != null
                            ? `\nSuspense : ${noteSuspense(suspense[m.id])}/10 — sans révéler le vainqueur`
                            : ""),
                      }}
                      spoilers={spoilers}
                      suivi={estSuivi(m)}
                      largeur={largeur}
                      hauteur={hauteurVoie}
                      note={suspense[m.id] != null ? noteSuspense(suspense[m.id]) : null}
                      vif={direct[m.id]}
                      ouvert={choisi === m.cle}
                      onOuvrir={(cle) => setChoisi((c) => (c === cle ? null : cle))}
                    />
                  ))}
                  {!liste.length && (
                    <div
                      style={{
                        fontFamily: FF_MONO, fontSize: 9, color: "rgba(147,166,151,.45)",
                        paddingTop: 8, paddingLeft: 4,
                      }}
                    >
                      aucun match
                    </div>
                  )}
                </div>
              </div>
              {matchOuvert && matchOuvert.nuit === n && (
                <DetailMatch
                  m={matchOuvert}
                  parId={parId}
                  stades={stades}
                  lanceurs={lanceurs}
                  note={suspense[matchOuvert.id] != null ? noteSuspense(suspense[matchOuvert.id]) : null}
                  spoilers={spoilers}
                  vif={direct[matchOuvert.id]}
                  resumes={resumes[matchOuvert.id]}
                  onFermer={() => setChoisi(null)}
                />
              )}
              </div>
            );
          })}

          <p
            style={{
              fontFamily: FF_MONO, fontSize: 10, color: T.dim, marginTop: 16, lineHeight: 1.7,
            }}
          >
            {total} match{total > 1 ? "s" : ""} sur {NB_NUITS} nuits — dont{" "}
            <span style={{ color: T.sodium }}>{soiree} en soirée</span>, avant minuit.
            {miens > 0 ? (
              <>
                {" "}
                <span style={{ color: T.clay }}>{miens} concernent tes équipes</span>, en terre battue.
              </>
            ) : null}
            <br />
            Touche une pastille pour ouvrir le détail du match.
            <br />
            Chaque ligne est une nuit : elle court de 17h à 07h, minuit au centre. La zone claire
            à gauche est ce qui se regarde sans réveil. Les termes encadrés s'expliquent au clic.
            <br />
            <span style={{ color: T.sodium }}>◆</span> signale un match hors du stade habituel — dix
            par saison, dont Mexico, Las Vegas et le champ de maïs de l'Iowa.
            <br />
            Le filet sous les matchs à venir donne la cote : la part claire revient à l'équipe qui
            reçoit. Estimation à la louche, à partir des seuls bilans — elle sert surtout à repérer
            les affiches serrées.
            <br />
            « Jauger le suspense » note les matchs terminés de 1 à 10 selon l'ampleur des
            renversements. <strong>La note ne révèle pas le vainqueur</strong> : elle dit seulement
            si le replay vaut les deux heures.
            <br />
            <strong>ERA</strong> : points mérités accordés toutes les neuf manches — la note d'un
            lanceur. Moyenne de ligue autour de 4,10 ; en jaune sous 3,20, en rouge au-dessus de 5,00.
            <br />
            Astuce d'horaires : les <strong>finales de série</strong> sont très souvent des matchs de
            jour aux États-Unis, l'équipe voyageant ensuite. Elles démarrent à 20h heure de Paris en
            médiane, contre 1h du matin pour les autres — c'est là qu'il faut chercher du baseball
            regardable en direct.
            <br />
            Le <strong>nombre magique</strong> compte les victoires restantes à décrocher pour que la
            division soit mathématiquement acquise. Il baisse d'un cran à chaque victoire, et d'un
            cran aussi quand le poursuivant perd. À zéro, c'est fait.
          </p>
        </>
      )}
    </div>
  );
}


/* ================================================================== *
 *  VUE « LES TERRAINS »
 *  Le contour vient du Bureau du recensement americain (domaine public),
 *  decode, projete et simplifie une fois pour toutes : l'application
 *  n'embarque qu'un trace fige de 1 Ko, sans bibliotheque cartographique
 *  ni tuiles a telecharger. Les coordonnees des 30 parcs sont deja
 *  chargees avec le reste, donc aucune requete supplementaire.
 *
 *  Le trace passe par un filtre anti-aiguilles : sur les cotes tres
 *  decoupees — delta du Mississippi, baie de Chesapeake — Douglas-Peucker
 *  conserve les points extremes en jetant les intermediaires, ce qui
 *  produit des pointes en zigzag. On retire iterativement les sommets dont
 *  l'angle est tres aigu et la saillie notable.
 * ================================================================== */

/* Article Wikipedia de chaque parc, resolu une fois pour toutes plutot
   qu'interroge a l'execution : pas de requete, pas de quota, pas d'erreur a
   gerer. Les noms de l'API portent les sponsors — « UNIQLO Field at Dodger
   Stadium » — d'ou la resolution par recherche et non par titre exact.
   Wikipedia maintient des redirections quand un article est renomme, donc
   ces liens survivront aux changements de nom. */

const lienWiki = (idStade) =>
  WIKI_STADES[idStade]
    ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(WIKI_STADES[idStade].replace(/ /g, "_"))}`
    : null;

const PIEDS = 0.3048;
const enM = (p) => (p ? Math.round(p * PIEDS) : null);

/* Le baseball compte en pieds, jamais en yards : c'est l'unite peinte sur les
   murs des stades et annoncee par les commentateurs. L'API la fournit telle
   quelle — les metres sont notre conversion, pas l'inverse. On affiche donc
   les deux, les metres d'abord pour la lecture, les pieds pour reconnaitre le
   chiffre quand il apparait a l'ecran. */
const enPi = (p) => (p ? Math.round(p) : null);

/* « 105 · 124 · 102 m  ·  345 · 407 · 335 ft » */
function distancesCloture(s) {
  const trio = [s?.gauche, s?.centre, s?.droite];
  if (!s?.centre) return null;
  const m = trio.map(enM).filter(Boolean).join(" · ");
  const pi = trio.map(enPi).filter(Boolean).join(" · ");
  return { m: `${m} m`, pi: `${pi} ft` };
}

/* Plan du terrain, trace a partir des trois distances annoncees.
   Les lignes de faute partent du marbre a 45 degres de part et d'autre ;
   le mur relie la ligne gauche, le champ centre et la ligne droite. */
function PlanTerrain({ s, taille = 190 }) {
  if (!s?.centre) return null;
  const cx = taille / 2, cy = taille * 0.92;
  const ech = (taille * 0.82) / Math.max(s.centre, s.gauche || 0, s.droite || 0);
  const pt = (d, deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + d * ech * Math.cos(a), cy - d * ech * Math.sin(a)];
  };
  const G = pt(s.gauche || s.centre * 0.83, 135);
  const C = pt(s.centre, 90);
  const D = pt(s.droite || s.centre * 0.83, 45);
  const craie = { fill: "none", stroke: "rgba(147,166,151,.55)", strokeWidth: 1.5, strokeLinecap: "round" };

  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden="true">
      <path
        d={`M${cx} ${cy} L${G[0].toFixed(1)} ${G[1].toFixed(1)} Q${cx} ${(C[1] - taille * 0.16).toFixed(1)} ${D[0].toFixed(1)} ${D[1].toFixed(1)} Z`}
        fill="rgba(239,243,234,.05)" stroke="none"
      />
      <path {...craie} d={`M${cx} ${cy} L${G[0].toFixed(1)} ${G[1].toFixed(1)}`} />
      <path {...craie} d={`M${cx} ${cy} L${D[0].toFixed(1)} ${D[1].toFixed(1)}`} />
      <path
        {...craie}
        stroke="rgba(194,96,58,.75)"
        strokeWidth="2.5"
        d={`M${G[0].toFixed(1)} ${G[1].toFixed(1)} Q${cx} ${(C[1] - taille * 0.16).toFixed(1)} ${D[0].toFixed(1)} ${D[1].toFixed(1)}`}
      />
      <circle cx={cx} cy={cy} r="2.5" fill="rgba(242,206,107,.9)" />
      {[[G, s.gauche, "start"], [C, s.centre, "middle"], [D, s.droite, "end"]].map(
        ([p, d, anc], i) =>
          d ? (
            <text
              key={i}
              x={p[0]} y={p[1] - 6}
              textAnchor={anc === "middle" ? "middle" : anc === "start" ? "start" : "end"}
              className="ts"
              style={{ fontFamily: FF_MONO, fontSize: 9, fill: T.dim }}
            >
              {enM(d)} m
            </text>
          ) : null
      )}
      {[[G, s.gauche, "start"], [C, s.centre, "middle"], [D, s.droite, "end"]].map(
        ([p, d, anc], i) =>
          d ? (
            <text
              key={`pi${i}`}
              x={p[0]} y={p[1] + 5}
              textAnchor={anc === "middle" ? "middle" : anc === "start" ? "start" : "end"}
              style={{ fontFamily: FF_MONO, fontSize: 8, fill: "rgba(147,166,151,.55)" }}
            >
              {enPi(d)} ft
            </text>
          ) : null
      )}
    </svg>
  );
}

function VueTerrains({ teams, stades, stadeHabituel = {}, suivies = [], cible = null }) {
  const [choisi, setChoisi] = useState(cible ? Number(cible) : null);
  /* Le fragment peut designer un parc (#terrains/5325) et changer sans que la
     vue soit remontee — au bouton « precedent », notamment. On se resynchronise
     pendant le rendu plutot que dans un effet : React reprend aussitot, sans
     valider l'ecran intermediaire ou l'ancienne fiche etait encore ouverte. */
  const [cibleVue, setCibleVue] = useState(cible);
  if (cible !== cibleVue) {
    setCibleVue(cible);
    if (cible) setChoisi(Number(cible));
  }
  const [ceSoir, setCeSoir] = useState([]);

  /* Les matchs de la nuit en cours, pour allumer les parcs concernes et
     tracer les deplacements. Requete minimale : deux journees, champs filtres. */
  useEffect(() => {
    let annule = false;
    jsonMlb(
      `${API}/schedule?sportId=1&startDate=${jourParis(new Date(Date.now() - 864e5))}&endDate=${jourParis()}` +
        `&fields=dates,games,gamePk,gameDate,status,abstractGameState,codedGameState,doubleHeader,teams,home,away,team,id,venue,id`
    )
      .then((d) => {
        if (annule) return;
        const n = new Date();
        const h = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(n));
        const nuit = h < AUBE ? decalerJour(jourParis(n), -1) : jourParis(n);
        const out = [];
        for (const jr of d.dates || [])
          for (const g of jr.games || []) {
            if (g.status?.codedGameState === "D") continue;
            if (nuitDe(g.gameDate).jour !== nuit) continue;
            out.push({
              id: g.gamePk,
              idStade: g.venue?.id,
              idExt: g.teams.away.team.id,
              idDom: g.teams.home.team.id,
              hhmm: nuitDe(g.gameDate).hhmm,
              // "Y" = programme traditionnel, un seul billet ; "S" = deux
              // entrees separees, souvent le rattrapage d'un match reporte.
              double: g.doubleHeader,
            });
          }
        setCeSoir(out);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, []);

  const parEquipe = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const parVenue = useMemo(() => {
    const m = {};
    for (const t of teams) if (t.venue?.id) (m[t.venue.id] ??= []).push(t);
    return m;
  }, [teams]);

  const actifs = useMemo(() => new Set(ceSoir.map((g) => g.idStade)), [ceSoir]);

  const points = useMemo(
    () =>
      Object.entries(stades)
        .filter(([id]) => parVenue[id])
        .map(([id, s]) => ({ id: Number(id), s, eq: parVenue[id], p: projeter(s.lon, s.lat) }))
        .filter((x) => x.p),
    [stades, parVenue]
  );

  /* Un deplacement par match : du parc habituel du visiteur vers le parc du soir. */
  const trajets = useMemo(
    () =>
      ceSoir
        .map((g) => {
          const dep = stades[stadeHabituel[g.idExt]];
          const arr = stades[g.idStade];
          const a = dep && projeter(dep.lon, dep.lat);
          const b = arr && projeter(arr.lon, arr.lat);
          return a && b ? { id: g.id, a, b } : null;
        })
        .filter(Boolean),
    [ceSoir, stades, stadeHabituel]
  );

  const ouvert = choisi != null ? points.find((x) => x.id === choisi) : null;

  return (
    <div className="alm-rise">
      <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 16px" }}>
        Les trente parcs de la ligue. Ceux qui reçoivent cette nuit sont allumés, et un trait relie
        chaque équipe visiteuse à sa destination. Touche un point pour le détail du terrain.
      </p>

      <svg
        viewBox={`-20 -20 ${CARTE_L + 40} ${CARTE_H + 40}`}
        style={{ width: "100%", display: "block", marginBottom: 14 }}
        role="img"
        aria-label="Carte des trente parcs de la Ligue majeure de baseball"
      >
        <path d={CONTOUR_US} fill="rgba(239,243,234,.04)" stroke="rgba(147,166,151,.4)" strokeWidth="2" />

        {trajets.map((t) => (
          <path
            key={t.id}
            d={`M${t.a.x.toFixed(1)} ${t.a.y.toFixed(1)} Q${((t.a.x + t.b.x) / 2).toFixed(1)} ${(Math.min(t.a.y, t.b.y) - 40).toFixed(1)} ${t.b.x.toFixed(1)} ${t.b.y.toFixed(1)}`}
            fill="none"
            stroke="rgba(242,206,107,.35)"
            strokeWidth="1.5"
            strokeDasharray="5 6"
          />
        ))}

        {points.map(({ id, eq, p }) => {
          const actif = actifs.has(id);
          const suivi = eq.some((t) => suivies.includes(t.id));
          const sel = choisi === id;
          return (
            <g key={id} onClick={() => setChoisi(sel ? null : id)} style={{ cursor: "pointer" }}>
              <circle cx={p.x} cy={p.y} r="20" fill="transparent" />
              <circle
                cx={p.x} cy={p.y} r={actif ? 9 : 6}
                fill={actif ? T.sodium : suivi ? T.clay : "rgba(147,166,151,.55)"}
                stroke={sel ? T.chalk : "rgba(18,36,27,.85)"}
                strokeWidth={sel ? 3 : 1.5}
              />
              <text
                x={p.x} y={p.y - (actif ? 15 : 12)} textAnchor="middle"
                style={{
                  fontFamily: FF_MONO, fontSize: 15, fontWeight: 700,
                  fill: actif ? T.sodium : "rgba(239,243,234,.7)", pointerEvents: "none",
                }}
              >
                {eq.map((t) => t.abbreviation).join("/")}
              </text>
            </g>
          );
        })}
      </svg>

      {ouvert && (
        <div
          className="alm-rise"
          style={{
            background: "rgba(11,36,26,.85)", border: `1px solid ${T.clay}`,
            borderRadius: 3, padding: "14px 16px", display: "flex",
            gap: 18, flexWrap: "wrap", alignItems: "flex-start",
          }}
        >
          <PlanTerrain s={ouvert.s} />
          <div style={{ flex: "1 1 240px", minWidth: 0, fontFamily: FF_MONO, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {ouvert.eq.map((t) => (
                <Img key={t.id} src={CAP(t.id)} alt="" size={26} />
              ))}
              <span style={{ fontSize: 13, color: T.chalk }}>{ouvert.s.nom}</span>
              <button
                onClick={() => setChoisi(null)}
                aria-label="Fermer"
                style={{ all: "unset", cursor: "pointer", marginLeft: "auto", color: T.dim, fontSize: 15 }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "grid", gap: 3 }}>
              <Ligne k="ville" v={ouvert.s.ville} />
              <Ligne k="équipes" v={ouvert.eq.map((t) => t.name).join(", ")} />
              <Ligne
                k="altitude"
                v={
                  ouvert.s.alt != null ? (
                    <span>
                      {enM(ouvert.s.alt)} m
                      <span style={{ color: T.dim }}> ({enPi(ouvert.s.alt)} ft)</span>
                      {ouvert.s.alt >= 3000 ? (
                        <span style={{ color: T.sodium }}> — l'air est fin, la balle porte</span>
                      ) : null}
                    </span>
                  ) : null
                }
              />
              <Ligne
                k="clôtures"
                v={(() => {
                  const d = distancesCloture(ouvert.s);
                  if (!d) return null;
                  return (
                    <span
                      title="Gauche · centre · droite. Le baseball compte en pieds (ft) : c'est le chiffre peint sur les murs des stades."
                      style={{ cursor: "help" }}
                    >
                      {d.m}
                      <span style={{ color: T.dim }}> · {d.pi}</span>
                    </span>
                  );
                })()}
              />
              <Ligne k="capacité" v={ouvert.s.places ? `${ouvert.s.places.toLocaleString("fr-FR")} places` : null} />
              <Ligne k="toit" v={ouvert.s.toit && ouvert.s.toit !== "Open" ? ouvert.s.toit : "à ciel ouvert"} />
              <Ligne
                k="en savoir plus"
                v={
                  lienWiki(ouvert.id) ? (
                    <a
                      href={lienWiki(ouvert.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: T.chalk, borderBottom: `1px solid ${T.clay}`, textDecoration: "none" }}
                    >
                      {WIKI_STADES[ouvert.id]} ↗
                    </a>
                  ) : null
                }
              />
              <Ligne k="cette nuit" v={<AffichesDuSoir liste={ceSoir.filter((g) => g.idStade === ouvert.id)} parEquipe={parEquipe} />} />
            </div>
          </div>
        </div>
      )}

      <p style={{ fontFamily: FF_MONO, fontSize: 10, color: T.dim, marginTop: 16, lineHeight: 1.7 }}>
        {actifs.size} parc{actifs.size > 1 ? "s" : ""} en activité cette nuit.
        <br />
        Fond de carte : Bureau du recensement des États-Unis, domaine public. Projection conique
        équivalente d'Albers. Les distances des clôtures sont celles annoncées par la ligue.
      </p>
    </div>
  );
}

/* Un double programme oppose toujours les deux memes equipes : verifie sur
   les 23 cas de la saison, tous a deux matchs. On mutualise donc l'affiche et
   on n'ajoute que le nombre et les horaires. Le cas d'affiches differentes
   n'a jamais ete observe, mais le repli existe : il coute trois lignes. */
function AffichesDuSoir({ liste, parEquipe }) {
  if (!liste?.length) return null;
  const paire = (g) => [g.idExt, g.idDom].join("-");
  const memeAffiche = new Set(liste.map(paire)).size === 1;
  const groupes = memeAffiche ? [liste] : liste.map((g) => [g]);

  return (
    <span style={{ display: "grid", gap: 4 }}>
      {groupes.map((gr) => {
        const g = gr[0];
        return (
          <span key={g.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Img src={CAP(g.idDom)} alt="" size={18} />
            <span>{parEquipe[g.idDom]?.name || "?"}</span>
            <span style={{ color: T.dim }}>reçoit</span>
            <Img src={CAP(g.idExt)} alt="" size={18} />
            <span>{parEquipe[g.idExt]?.name || "?"}</span>
            {gr.length > 1 ? (
              <span
                title={
                  gr[0].double === "S"
                    ? "Double programme à entrées séparées, souvent le rattrapage d'un match reporté."
                    : "Double programme : deux matchs dans la journée, un seul billet."
                }
                style={{ color: T.sodium, cursor: "help" }}
              >
                ×{gr.length} · {gr.map((x) => x.hhmm).join(" et ")}
              </span>
            ) : (
              <span style={{ color: T.sodium }}>{g.hhmm}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function Ligne({ k, v }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span style={{ color: T.dim, minWidth: 74, flexShrink: 0 }}>{k}</span>
      <span style={{ color: T.chalk, minWidth: 0 }}>{v}</span>
    </div>
  );
}


/* ================================================================== *
 *  VUE « LE DIRECT »
 *  Un seul appel filtre suffit : feed/live passe de 625 Ko a 1,6 Ko en
 *  ne demandant que les champs utiles, et ramene manche, score, compte,
 *  coureurs, duel en cours, detail manche par manche et dernier fait de
 *  jeu. contextMetrics ajoute la probabilite de victoire pour 2 Ko.
 *  Rafraichissement toutes les 15 secondes : au baseball, un lancer
 *  toutes les vingt secondes environ.
 * ================================================================== */
const CHAMPS_DIRECT = [
  "liveData", "plays", "currentPlay", "result", "description", "linescore",
  "currentInning", "currentInningOrdinal", "inningState", "balls", "strikes", "outs",
  "teams", "home", "away", "runs", "hits", "errors", "innings", "num", "ordinalNum",
  "offense", "defense", "first", "second", "third", "batter", "pitcher", "onDeck",
  "fullName", "id", "gameData", "status", "abstractGameState", "detailedState",
].join(",");

const CADENCE_DIRECT = 15000;

/* ---------------------------------------------------------------- *
 *  ETAT D'UN MATCH
 *  L'API distingue plus de cas qu'il n'y parait :
 *    Live  | I | In Progress   le jeu est lance
 *    Live  | P | Warmup        echauffement, rien n'a commence
 *    Final | F | Final         homologue
 *    Final | O | Game Over     joue, en attente d'homologation
 *    Final | D | Postponed     reporte, jamais joue
 *  Se fier au seul code « F » faisait disparaitre les matchs en « Game
 *  Over » : ni vivants ni finis, ils tombaient entre les mailles.
 * ---------------------------------------------------------------- */
function classerMatch(status) {
  const abs = status?.abstractGameState;
  const code = status?.codedGameState;
  const reporte = code === "D";
  return {
    reporte,
    echauffement: abs === "Live" && code === "P",
    vif: abs === "Live",
    fini: abs === "Final" && !reporte,
  };
}

/* L'historique complet du match. Filtre, il tombe de 677 Ko a 12 Ko pour
   soixante-dix actions. On le rafraichit plus lentement que l'etat courant :
   une action toutes les deux ou trois minutes en moyenne, 45 secondes suffisent. */
const CHAMPS_HISTOIRE = [
  "liveData", "plays", "allPlays", "result", "description", "eventType", "isScoringPlay",
  // atBatIndex est l'identifiant stable de chaque action. Sans lui, les cles
  // React reposaient sur l'index de position : chaque nouvelle action inseree
  // en tete decalait toutes les autres, et React reutilisait les mauvais
  // noeuds — d'ou des lignes qui semblaient disparaitre ou changer.
  "atBatIndex", "about", "inning", "halfInning", "isComplete", "playEvents", "type", "details",
].join(",");

/* Chaque action recoit le code du marqueur — celui-la meme que le carnet
   enseigne. Plus precis qu'un pictogramme, et il ne cree pas un second
   langage a apprendre. La couleur donne le balayage rapide, le code la
   precision. On reutilise les tables de correspondance de la detection. */
const TON_ACTION = {
  point: T.sodium,   // a produit un point
  coup: T.clay,      // coup sur
  cadeau: T.chalk,   // but offert : balles, atteint, interference
  course: "#8FB3C9",  // jeu de coureurs
  retrait: T.dim,    // tout le reste
};

const CATEGORIE = {
  single: "coup", double: "coup", triple: "coup", home_run: "coup", grand_slam: "coup",
  walk: "cadeau", intent_walk: "cadeau", hit_by_pitch: "cadeau", catcher_interf: "cadeau",
  field_error: "cadeau", fielders_choice: "cadeau",
  stolen_base_2b: "course", stolen_base_3b: "course", stolen_base_home: "course",
  caught_stealing: "course", pickoff: "course", balk: "course",
  wild_pitch: "course", passed_ball: "course", defensive_indiff: "course",
};

/* Renvoie le code du marqueur et sa couleur pour une action du deroule. */
function codeAction(a) {
  const et = a?.result?.eventType;
  let id = null;
  if (et === "field_out") id = classifyFieldOut(a.result.description);
  else if (AT_BAT_MAP[et]) id = AT_BAT_MAP[et];
  else {
    for (const ev of a?.playEvents || []) {
      const x = ev?.type === "action" && ACTION_MAP[ev?.details?.eventType];
      if (x) { id = x; break; }
    }
  }
  if (et === "home_run" && (a.result.rbi || 0) >= 4) id = "grand_slam";
  const c = id && BY_ID[id];
  const cat = a?.about?.isScoringPlay ? "point" : (CATEGORIE[id] || "retrait");
  return { code: c ? c.code : "—", titre: c ? c.titre : "", ton: TON_ACTION[cat], concept: id };
}
const CADENCE_HISTOIRE = 45000;

/* Les entrees d'intendance — changements de joueur, visites au monticule,
   avis divers — ne sont pas des actions de jeu. Surtout, l'API les fait
   TRANSITER : elles occupent la place de l'action en cours, puis sont
   absorbees dans les playEvents du duel suivant et disparaissent de la liste.
   Une ligne apparaissait donc puis s'effacait toute seule. */
const INTENDANCE = /substitution|switch|advisory|visit|timeout|injury|ejection/i;
const estIntendance = (a) => INTENDANCE.test(a?.result?.eventType || "");

/* Regroupe les actions par demi-manche, la plus recente en tete. */
function grouperParManche(actions = []) {
  const groupes = [];
  for (const a of actions) {
    if (!a?.result?.description) continue;
    if (estIntendance(a)) continue;
    const cle = `${a.about?.inning}-${a.about?.halfInning}`;
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.cle === cle) dernier.actions.push(a);
    else groupes.push({ cle, manche: a.about?.inning, demi: a.about?.halfInning, actions: [a] });
  }
  return groupes.reverse().map((g) => ({ ...g, actions: g.actions.slice().reverse() }));
}

/* Tronque a un nombre d'ACTIONS, pas de demi-manches. Couper par manche
   faisait disparaitre quatre ou cinq lignes d'un coup au changement de
   manche ; en coupant par action, la liste se decale d'une ligne a la fois. */
function limiterActions(groupes, max) {
  const out = [];
  let reste = max;
  for (const g of groupes) {
    if (reste <= 0) break;
    const gardees = g.actions.slice(0, reste);
    reste -= gardees.length;
    out.push({ ...g, actions: gardees, tronque: gardees.length < g.actions.length });
  }
  return out;
}

const ACTIONS_VISIBLES = 12;

/* Le losange du direct : les buts occupes s'allument. C'est l'affichage
   canonique de tous les tableaux de stade. */
function BasesOccupees({ off, taille = 76 }) {
  const c = taille / 2, r = taille * 0.3, s = taille * 0.11;
  const buts = [
    [c + r, c, !!off?.first],
    [c, c - r, !!off?.second],
    [c - r, c, !!off?.third],
  ];
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden="true">
      {buts.map(([x, y, occupe], i) => (
        <rect
          key={i} x={x - s / 2} y={y - s / 2} width={s} height={s}
          transform={`rotate(45 ${x} ${y})`}
          fill={occupe ? T.sodium : "transparent"}
          stroke={occupe ? T.sodium : "rgba(147,166,151,.5)"}
          strokeWidth="1.6"
        />
      ))}
      <rect
        x={c - s / 2.6} y={c + r - s / 2.6} width={s / 1.3} height={s / 1.3}
        transform={`rotate(45 ${c} ${c + r})`}
        fill="rgba(147,166,151,.4)"
      />
    </svg>
  );
}

/* Retraits et compte, comme sur un tableau d'affichage. */
function Compteurs({ balles, prises, retraits }) {
  const pastille = (plein, couleur) => (
    <span
      style={{
        width: 9, height: 9, borderRadius: "50%", display: "inline-block",
        background: plein ? couleur : "transparent",
        border: `1px solid ${plein ? couleur : "rgba(147,166,151,.45)"}`,
      }}
    />
  );
  const ligne = (lib, n, total, couleur) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {/* Largeur calee sur le plus long libelle — « retraits », huit
          caracteres — sinon il deborde sur les pastilles. Aligne a droite
          pour que les trois rangees soient a la meme distance des points. */}
      <span
        style={{
          fontFamily: FF_MONO, fontSize: 9, color: T.dim,
          width: 48, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap",
        }}
      >
        {lib}
      </span>
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>{pastille(i < (n || 0), couleur)}</React.Fragment>
      ))}
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 5 }}>
      {ligne("balles", balles, 3, T.chalk)}
      {ligne("prises", prises, 2, T.clay)}
      {ligne("retraits", retraits, 2, T.sodium)}
    </div>
  );
}

/* Le tableau R-H-E manche par manche. */
function TableauManches({ innings, teams, ab }) {
  if (!innings?.length) return null;
  const cell = { padding: "2px 6px", fontFamily: FF_MONO, fontSize: 10.5, textAlign: "center" };
  const ligne = (cote, nom) => (
    <tr>
      <td style={{ ...cell, textAlign: "left", color: T.chalk }}>{nom}</td>
      {innings.map((m) => (
        <td key={m.num} style={{ ...cell, color: T.dim }}>
          {m[cote]?.runs ?? "-"}
        </td>
      ))}
      {["runs", "hits", "errors"].map((k) => (
        <td key={k} style={{ ...cell, color: T.chalk, fontWeight: 700 }}>
          {teams?.[cote]?.[k] ?? 0}
        </td>
      ))}
    </tr>
  );
  return (
    <div style={{ overflowX: "auto", marginTop: 14 }}>
      <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: "left", color: T.dim }} />
            {innings.map((m) => (
              <th key={m.num} style={{ ...cell, color: T.dim }}>{m.num}</th>
            ))}
            {["R", "H", "E"].map((k) => (
              <th key={k} style={{ ...cell, color: T.sodium }}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ligne("away", ab.ext)}
          {ligne("home", ab.dom)}
        </tbody>
      </table>
    </div>
  );
}

function VueDirect({ teams, suivies = [] }) {
  const [enCours, setEnCours] = useState([]);
  const [choisi, setChoisi] = useState(null);
  const [etat, setEtat] = useState(null);
  const [proba, setProba] = useState(null);
  const [phase, setPhase] = useState("load");
  const [spoilers, setSpoilers] = useState(false);
  const [histoire, setHistoire] = useState([]);
  const [toutVoir, setToutVoir] = useState(false);

  /* Changer de match vide le deroule : celui du match precedent n'a plus rien
     a y faire. Fait pendant le rendu et non dans un effet, sinon l'ecran
     affiche brievement l'historique de l'ancien match sous l'en-tete du
     nouveau — un vrai melange, pas seulement un rendu de trop. */
  const [jeuVu, setJeuVu] = useState(choisi);
  if (choisi !== jeuVu) {
    setJeuVu(choisi);
    setHistoire([]);
    setToutVoir(false);
  }

  const parId = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

  /* La liste des matchs en cours, rafraichie a la meme cadence : un match
     peut commencer ou se terminer pendant qu'on regarde. */
  useEffect(() => {
    let annule = false;
    const tirer = () => {
      const auj = jourParis();
      const veille = jourParis(new Date(Date.now() - 864e5));
      jsonMlb(`${API}/schedule?sportId=1&startDate=${veille}&endDate=${auj}&hydrate=team`)
        .then((d) => {
          if (annule) return;
          // On garde les matchs en cours ET ceux de la nuit ecoulee : le cas
          // le plus frequent depuis la France est de se lever apres coup.
          const n = new Date();
          const h = Number(
            new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(n)
          );
          const jour = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(n);
          const nuit = h < AUBE ? decalerJour(jour, -1) : jour;

          const l = (d.dates || [])
            .flatMap((x) => x.games || [])
            .filter((g) => {
              const e = classerMatch(g.status);
              if (e.reporte || (!e.vif && !e.fini)) return false;
              return e.vif || nuitDe(g.gameDate).jour === nuit;
            })
            .map((g) => {
              const e = classerMatch(g.status);
              return {
                id: g.gamePk,
                idExt: g.teams.away.team.id,
                idDom: g.teams.home.team.id,
                ext: g.teams.away.team.abbreviation,
                dom: g.teams.home.team.abbreviation,
                stade: g.venue?.name,
                fini: e.fini,
                echauffement: e.echauffement,
                debut: g.gameDate,
              };
            })
            // Les matchs en cours d'abord, puis les plus recemment termines.
            .sort((a, b) =>
              a.fini !== b.fini ? (a.fini ? 1 : -1) : new Date(b.debut) - new Date(a.debut)
            );
          setEnCours(l);
          setPhase("ok");
        })
        .catch(() => !annule && setPhase("erreur"));
    };
    tirer();
    const id = setInterval(tirer, CADENCE_DIRECT * 4);
    return () => {
      annule = true;
      clearInterval(id);
    };
  }, []);

  /* Le match suivi. Un appel filtre a 1,6 Ko, plus 2 Ko de probabilite. */
  useEffect(() => {
    if (!choisi) return;
    let annule = false;
    const tirer = () => {
      Promise.all([
        jsonMlb(`https://statsapi.mlb.com/api/v1.1/game/${choisi}/feed/live?fields=${CHAMPS_DIRECT}`),
        jsonMlb(`${API}/game/${choisi}/contextMetrics`).catch(() => null),
      ])
        .then(([f, c]) => {
          if (annule) return;
          setEtat({
            l: f?.liveData?.linescore || null,
            fait: f?.liveData?.plays?.currentPlay?.result?.description || null,
            statut: f?.gameData?.status?.detailedState || null,
          });
          setProba(c?.homeWinProbability ?? null);
        })
        .catch(() => {});
    };
    tirer();
    // Inutile de sonder un match termine : son etat ne bougera plus.
    const fini = enCours.find((g) => g.id === choisi)?.fini;
    const id = fini ? null : setInterval(tirer, CADENCE_DIRECT);
    return () => {
      annule = true;
      if (id) clearInterval(id);
    };
  }, [choisi, enCours]);

  /* Charge seulement si le deroule est demande : il revele tout le match. */
  useEffect(() => {
    if (!choisi || !spoilers) return;
    let annule = false;
    const tirer = () =>
      jsonMlb(`https://statsapi.mlb.com/api/v1.1/game/${choisi}/feed/live?fields=${CHAMPS_HISTOIRE}`)
        .then((d) => !annule && setHistoire(d?.liveData?.plays?.allPlays || []))
        .catch(() => {});
    tirer();
    const id = setInterval(tirer, CADENCE_HISTOIRE);
    return () => {
      annule = true;
      clearInterval(id);
    };
  }, [choisi, spoilers]);

  const groupes = useMemo(() => grouperParManche(histoire), [histoire]);
  const totalActions = useMemo(
    () => groupes.reduce((n, g) => n + g.actions.length, 0),
    [groupes]
  );

  const jeu = enCours.find((g) => g.id === choisi) || null;
  const L = etat?.l;

  return (
    <div className="alm-rise">
      {phase === "load" && (
        <p style={{ fontFamily: FF_MONO, fontSize: 12, color: T.dim, animation: "pulse 1.4s infinite" }}>
          Recherche des matchs en cours…
        </p>
      )}

      {phase === "ok" && !enCours.length && (
        <p style={{ fontSize: 16 }}>
          Aucun match en cours. La ligue joue surtout entre minuit et 6 h, heure de Paris — reviens
          plus tard, ou consulte le programme pour savoir quand.
        </p>
      )}

      {phase === "ok" && enCours.length > 0 && (
        <>
          <div
            style={{
              fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em",
              color: T.sodium, marginBottom: 8,
            }}
          >
            {(() => {
              const vifs = enCours.filter((g) => !g.fini && !g.echauffement).length;
              const finis = enCours.length - vifs;
              if (vifs && finis) return `${vifs} EN COURS · ${finis} TERMINÉ${finis > 1 ? "S" : ""} CETTE NUIT`;
              if (vifs) return `${vifs} MATCH${vifs > 1 ? "S" : ""} EN COURS`;
              return `${finis} MATCH${finis > 1 ? "S" : ""} TERMINÉ${finis > 1 ? "S" : ""} CETTE NUIT`;
            })()}
          </div>

          <div
            style={{
              display: "grid", gap: 6, marginBottom: 20,
              gridTemplateColumns: "repeat(auto-fill, minmax(146px, 1fr))",
            }}
          >
            {enCours.map((g) => {
              const suivi = suivies.includes(g.idExt) || suivies.includes(g.idDom) || !suivies.length;
              const sel = choisi === g.id;
              return (
                <button
                  key={g.id}
                  className="alm-cell"
                  onClick={() => setChoisi(sel ? null : g.id)}
                  style={{
                    all: "unset", cursor: "pointer", display: "flex", alignItems: "center",
                    gap: 6, boxSizing: "border-box", padding: "8px 10px", borderRadius: 2,
                    background: sel ? "rgba(194,96,58,.22)" : "rgba(11,36,26,.5)",
                    border: `1px solid ${sel ? T.chalk : suivi ? T.clay : "rgba(239,243,234,.18)"}`,
                    // Un match en cours reste a pleine opacite, meme hors de tes
                    // equipes : dans cet onglet, le fait qu'il se joue prime sur
                    // le fait que tu le suives. On n'estompe que les matchs finis.
                    opacity: !g.fini || suivi ? 1 : 0.6,
                    // Les marqueurs d'etat sont poses hors du flux : dans le flux,
                    // ils volaient la largeur et renvoyaient « AZ @ PIT » a la ligne.
                    position: "relative", overflow: "hidden",
                  }}
                >
                  <Img src={CAP(g.idExt)} alt="" size={20} />
                  <Img src={CAP(g.idDom)} alt="" size={20} />
                  <span
                    style={{
                      fontFamily: FF_MONO, fontSize: 11, color: T.chalk,
                      whiteSpace: "nowrap", position: "relative",
                    }}
                  >
                    {g.ext} @ {g.dom}
                  </span>
                  {g.fini ? (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute", right: -10, top: "50%",
                        transform: "translateY(-50%) rotate(-24deg)",
                        transformOrigin: "center",
                        fontFamily: FF_MONO, fontSize: 15, fontWeight: 700,
                        letterSpacing: ".22em", color: "rgba(147,166,151,.28)",
                        pointerEvents: "none", whiteSpace: "nowrap",
                      }}
                    >
                      FINI
                    </span>
                  ) : g.echauffement ? (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute", right: -6, top: "50%",
                        transform: "translateY(-50%) rotate(-24deg)",
                        fontFamily: FF_MONO, fontSize: 10, fontWeight: 700,
                        letterSpacing: ".16em", color: "rgba(242,206,107,.3)",
                        pointerEvents: "none", whiteSpace: "nowrap",
                      }}
                    >
                      ÉCHAUFFEMENT
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute", top: 6, right: 6, width: 7, height: 7,
                        borderRadius: "50%", background: T.sodium,
                        animation: "pulse 1.6s infinite", pointerEvents: "none",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {jeu && L && (
        <div
          className="alm-rise"
          style={{
            background: "rgba(11,36,26,.85)", border: `1px solid ${T.sodium}`,
            borderRadius: 3, padding: "16px 18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Img src={CAP(jeu.idExt)} alt="" size={30} />
            <span style={{ fontFamily: FF_DISPLAY, fontSize: 24, textTransform: "uppercase" }}>
              {parId[jeu.idExt]?.name || jeu.ext}
            </span>
            <span style={{ color: T.dim }}>@</span>
            <Img src={CAP(jeu.idDom)} alt="" size={30} />
            <span style={{ fontFamily: FF_DISPLAY, fontSize: 24, textTransform: "uppercase" }}>
              {parId[jeu.idDom]?.name || jeu.dom}
            </span>
            <span
              style={{
                marginLeft: "auto", fontFamily: FF_MONO, fontSize: 11,
                color: jeu.fini ? T.dim : T.sodium, letterSpacing: ".1em",
              }}
            >
              {jeu.fini
                ? `TERMINÉ · ${L.currentInningOrdinal || ""} manches`
                : `${L.currentInningOrdinal} ${L.inningState === "Top" ? "▲" : L.inningState === "Bottom" ? "▼" : ""}`}
            </span>
          </div>

          {!jeu.fini && (
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
            <BasesOccupees off={L.offense} />
            <Compteurs balles={L.balls} prises={L.strikes} retraits={L.outs} />

            <div style={{ fontFamily: FF_MONO, fontSize: 11, display: "grid", gap: 4, minWidth: 0 }}>
              <div>
                <span style={{ color: T.dim }}>au bâton </span>
                <span style={{ color: T.chalk }}>{L.offense?.batter?.fullName || "—"}</span>
              </div>
              <div>
                <span style={{ color: T.dim }}>au monticule </span>
                <span style={{ color: T.chalk }}>{L.defense?.pitcher?.fullName || "—"}</span>
              </div>
              {L.offense?.onDeck?.fullName && (
                <div>
                  <span style={{ color: T.dim }}>à suivre </span>
                  <span style={{ color: T.chalk }}>{L.offense.onDeck.fullName}</span>
                </div>
              )}
            </div>

            {/* Sur un match termine, cette probabilite vaut 0 ou 100 : elle
                annoncerait le vainqueur. */}
            {proba != null && !jeu.fini && (
              <div style={{ marginLeft: "auto", textAlign: "right", fontFamily: FF_MONO }}>
                <div style={{ fontSize: 22, color: T.sodium, fontWeight: 700 }}>{Math.round(proba)} %</div>
                <div style={{ fontSize: 9, color: T.dim, letterSpacing: ".08em" }}>
                  POUR {jeu.dom}
                </div>
              </div>
            )}
          </div>
          )}

          {etat.fait && !jeu.fini && (
            <p style={{ fontSize: 14.5, lineHeight: 1.5, margin: "16px 0 0", color: "rgba(239,243,234,.9)" }}>
              {etat.fait}
            </p>
          )}

          {jeu.fini && !spoilers && (
            <p style={{ fontSize: 14.5, lineHeight: 1.5, margin: "4px 0 0", color: "rgba(239,243,234,.8)" }}>
              Ce match est joué. Rien n'est révélé tant que tu ne le demandes pas.
            </p>
          )}

          {spoilers ? (
            <>
              <TableauManches innings={L.innings} teams={L.teams} ab={{ ext: jeu.ext, dom: jeu.dom }} />

              {groupes.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div
                    style={{
                      fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".18em",
                      color: T.sodium, marginBottom: 8,
                    }}
                  >
                    DÉROULÉ DU MATCH
                  </div>

                  {(toutVoir ? groupes : limiterActions(groupes, ACTIONS_VISIBLES)).map((g) => (
                    <div key={g.cle} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontFamily: FF_MONO, fontSize: 10, color: T.dim,
                          letterSpacing: ".08em", marginBottom: 4,
                        }}
                      >
                        {ordinal(g.manche)} MANCHE · {g.demi === "top" ? "HAUT" : "BAS"}
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {g.actions.map((a, i) => {
                          const c = codeAction(a);
                          return (
                            <div
                              key={a.about?.atBatIndex ?? `${g.cle}-${i}`}
                              style={{ display: "flex", gap: 9, alignItems: "baseline" }}
                            >
                              <span
                                title={c.titre}
                                style={{
                                  fontFamily: FF_MONO, fontSize: 10, fontWeight: 700,
                                  color: c.ton, flexShrink: 0, width: 42, textAlign: "right",
                                  cursor: c.titre ? "help" : "default",
                                }}
                              >
                                {c.code}
                              </span>
                              <p
                                style={{
                                  margin: 0, fontSize: 13.5, lineHeight: 1.45, paddingLeft: 9,
                                  borderLeft: `2px solid ${a.about?.isScoringPlay ? T.sodium : "rgba(147,166,151,.22)"}`,
                                  color: a.about?.isScoringPlay ? T.chalk : "rgba(239,243,234,.72)",
                                }}
                              >
                                {a.result.description}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <p style={{ fontFamily: FF_MONO, fontSize: 9.5, color: T.dim, margin: "0 0 10px" }}>
                    Codes du carnet de marque. Jaune : point marqué. Terre battue : coup sûr.
                    Blanc : but offert. Bleu : jeu de coureurs. Gris : retrait.
                  </p>

                  {totalActions > ACTIONS_VISIBLES && (
                    <button
                      onClick={() => setToutVoir(!toutVoir)}
                      style={{
                        all: "unset", cursor: "pointer", fontFamily: FF_MONO, fontSize: 10.5,
                        color: T.clay, borderBottom: "1px solid currentColor",
                      }}
                    >
                      {toutVoir
                        ? `ne montrer que les ${ACTIONS_VISIBLES} dernières actions`
                        : `tout le déroulé — ${totalActions} actions sur ${groupes.length} demi-manches`}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => setSpoilers(true)}
              style={{
                all: "unset", cursor: "pointer", marginTop: 14, fontFamily: FF_MONO,
                fontSize: 10.5, color: T.clay, borderBottom: "1px solid currentColor",
              }}
            >
              afficher le score, le détail par manche et le déroulé
            </button>
          )}

          <p style={{ fontFamily: FF_MONO, fontSize: 9.5, color: T.dim, marginTop: 14 }}>
            {etat.statut}
            {jeu.fini ? "" : ` · mise à jour toutes les ${CADENCE_DIRECT / 1000} secondes`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 *  COQUILLE : etat partage, onglets, chrome commun
 * ================================================================== */
/* ------------------------------------------------------------------ *
 *  ADRESSAGE PAR FRAGMENT
 *  Sur GitHub Pages il n'y a aucun serveur pour reecrire les chemins :
 *  « /programme » renverrait un 404. Le fragment (#programme) reste
 *  cote navigateur et fonctionne partout, y compris hors ligne.
 *  Plusieurs alias sont acceptes pour qu'un lien tape a la main tombe juste.
 * ------------------------------------------------------------------ */
const ALIAS = {
  programme: "nuits", nuits: "nuits", calendrier: "nuits",
  carnet: "carnet", almanach: "carnet", notions: "carnet",
  terrains: "terrains", stades: "terrains", parcs: "terrains", carte: "terrains",
  direct: "direct", live: "direct", "en-cours": "direct",
};
const FRAGMENT = { nuits: "programme", carnet: "carnet", terrains: "terrains", direct: "direct" };

/* La consultation passe par hasOwn : sans lui, « #constructor » ou
   « #toString » remontent la chaine de prototypes et renvoient une fonction
   en guise d'onglet. */
function ongletDepuisFragment(brut) {
  const h = String(brut || "").replace(/^#\/?/, "").trim().toLowerCase().split("/")[0];
  return Object.hasOwn(ALIAS, h) ? ALIAS[h] : "carnet";
}

/* Un fragment peut designer une cible dans l'onglet : #terrains/5325 ouvre
   directement la fiche du parc 5325. Le lien reste partageable et le bouton
   « precedent » du navigateur fonctionne sans effort. */
function cibleDepuisFragment(brut) {
  const bouts = String(brut || "").replace(/^#\/?/, "").trim().split("/");
  return bouts.length > 1 && bouts[1] ? bouts[1] : null;
}

/* ------------------------------------------------------------------ *
 *  GARDE-FOU DE RENDU
 *  Sans elle, une seule exception dans n'importe quelle vue vide la page :
 *  React 16+ demonte tout l'arbre plutot que de laisser une interface a
 *  moitie fausse. Les donnees viennent d'une API non contractuelle, donc un
 *  champ disparu suffit. On perd l'onglet fautif, pas l'application.
 *  Une classe, obligatoirement : c'est la seule forme qui capte les erreurs
 *  de rendu — il n'existe pas d'equivalent avec les hooks.
 * ------------------------------------------------------------------ */
class Garde extends React.Component {
  constructor(p) {
    super(p);
    this.state = { erreur: null };
  }
  static getDerivedStateFromError(erreur) {
    return { erreur };
  }
  componentDidUpdate(avant) {
    // Changer d'onglet doit reessayer : sinon l'erreur d'une vue condamne
    // toutes les autres jusqu'au rechargement.
    if (avant.cle !== this.props.cle && this.state.erreur) this.setState({ erreur: null });
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div style={{ border: `1px solid ${T.clay}`, borderRadius: 3, padding: 18 }}>
        <p style={{ margin: 0, fontSize: 15 }}>
          Cette vue s'est interrompue. Les autres onglets fonctionnent toujours.
        </p>
        <p style={{ fontFamily: FF_MONO, fontSize: 11, color: T.dim, margin: "8px 0 14px" }}>
          {String(this.state.erreur?.message || this.state.erreur)}
        </p>
        <button
          className="alm-btn"
          onClick={() => this.setState({ erreur: null })}
          style={btnStyle(true)}
        >
          Réessayer
        </button>
      </div>
    );
  }
}

/* Declare hors de App : un composant defini dans le corps du rendu est une
   NOUVELLE fonction a chaque passage, donc un type d'element different pour
   React, qui demonte et remonte le sous-arbre au lieu de le mettre a jour.
   Sans etat interne ici, cela ne coutait que du travail inutile — mais c'est
   la meme erreur qui fait perdre son contenu a un champ de saisie. */
function Onglet({ id, actif, onChoisir, children }) {
  return (
    <button
      className="alm-tab"
      onClick={() => onChoisir(id)}
      aria-current={actif ? "page" : undefined}
      style={{
        all: "unset", cursor: "pointer",
        fontFamily: FF_DISPLAY, fontSize: 22, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: ".04em",
        padding: "8px 0", marginRight: 24,
        color: actif ? T.chalk : "rgba(147,166,151,.7)",
        borderBottom: `2px solid ${actif ? T.clay : "transparent"}`,
      }}
    >
      {children}
    </button>
  );
}

export default function App() {
  // Lu une seule fois a l'initialisation : un lien partage ouvre directement
  // la bonne vue. En rendu serveur, `location` n'existe pas.
  const [onglet, setOnglet] = useState(() =>
    typeof window === "undefined" ? "carnet" : ongletDepuisFragment(window.location.hash)
  );
  const [cible, setCible] = useState(() =>
    typeof window === "undefined" ? null : cibleDepuisFragment(window.location.hash)
  );

  // Boutons precedent/suivant du navigateur.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const maj = () => {
      setOnglet(ongletDepuisFragment(window.location.hash));
      setCible(cibleDepuisFragment(window.location.hash));
    };
    window.addEventListener("hashchange", maj);
    return () => window.removeEventListener("hashchange", maj);
  }, []);

  const changerOnglet = (id) => {
    setOnglet(id);
    setCible(null);
    // Affecter location.hash cree une entree d'historique : le bouton
    // « precedent » revient donc a l'onglet d'avant, comme on l'attend.
    try {
      if (typeof window !== "undefined") window.location.hash = FRAGMENT[id] || id;
    } catch {
      /* contexte restreint : l'onglet change quand meme */
    }
  };
  const [teams, setTeams] = useState([]);
  const [appris, setAppris] = useState([]);
  const [suivies, setSuivies] = useState([119]);
  const [resetArme, setResetArme] = useState(false);

  useEffect(() => {
    loadState().then((s) => {
      setAppris(s.appris || []);
      setSuivies(s.suivies || [119]);
    });
  }, []);

  // Bilans victoires/defaites : une seule requete pour les 30 equipes,
  // base de la cote de rencontre (log5).
  const [bilans, setBilans] = useState({});
  const [saisonBilans, setSaisonBilans] = useState(null);
  useEffect(() => {
    let annule = false;

    const lire = (d) => {
      const m = {};
      for (const rec of d.records || []) {
        for (const tr of rec.teamRecords || []) {
          const n = (tr.wins || 0) + (tr.losses || 0);
          if (n <= 0) continue;
          // L'API renvoie "-" plutot que null quand la valeur ne s'applique pas.
          const nb = (x) => (x == null || x === "-" ? null : Number(x));
          m[tr.team.id] = {
            v: tr.wins,
            d: tr.losses,
            pct: tr.wins / n,
            rang: tr.divisionRank ? Number(tr.divisionRank) : null,
            meneur: !!tr.divisionLeader,
            retard: nb(tr.gamesBack),
            wc: nb(tr.wildCardGamesBack),
            magique: nb(tr.magicNumber),
            elimination: nb(tr.eliminationNumber),
            clinche: !!tr.clinched,
            serieType: tr.streak?.streakType,
            serieNb: tr.streak?.streakNumber || 0,
          };
        }
      }
      return m;
    };

    const tirer = (saison) =>
      jsonMlb(
        `${API}/standings?leagueId=103,104&season=${saison}&standingsTypes=regularSeason` +
          `&fields=records,teamRecords,team,id,wins,losses,gamesBack,wildCardGamesBack,` +
          `divisionRank,divisionLeader,magicNumber,eliminationNumber,clinched,` +
          `streak,streakCode,streakNumber,streakType`
      ).then(lire);

    /* De fin octobre a fin mars, la saison en cours n'a aucun match joue :
       l'API repond, mais tous les bilans sont a 0-0 et `lire` les ecarte.
       Sans repli, cotes, classement et enjeux disparaissaient tout l'hiver
       sans un mot d'explication. On retombe sur la derniere saison jouee — et
       on le DIT a l'ecran : un classement final n'est pas un classement du
       jour, le laisser croire serait pire que de ne rien montrer. */
    const saison = new Date().getFullYear();
    tirer(saison)
      .then((m) =>
        Object.keys(m).length
          ? { m, saison }
          : tirer(saison - 1).then((v) => ({ m: v, saison: saison - 1 }))
      )
      .then(({ m, saison: s }) => {
        if (annule || !Object.keys(m).length) return;
        setBilans(m);
        setSaisonBilans(s);
      })
      .catch(() => {});
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    jsonMlb(`${API}/teams?sportId=1&fields=teams,id,name,abbreviation,venue,division`)
      .then((d) => setTeams((d.teams || []).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  // Stade habituel de chaque franchise : sert a reperer les terrains neutres.
  const stadeHabituel = useMemo(
    () => Object.fromEntries(teams.filter((t) => t.venue?.id).map((t) => [t.id, t.venue.id])),
    [teams]
  );

  /* Stades : altitude, dimensions des clotures, capacite, toit, coordonnees.
     Une requete de 33 Ko pour les 59 parcs, qui alimente les anecdotes. */
  const [stades, setStades] = useState({});
  useEffect(() => {
    jsonMlb(`${API}/venues?sportId=1&hydrate=location,fieldInfo`)
      .then((d) => {
        const m = {};
        for (const v of d.venues || []) {
          const f = v.fieldInfo || {};
          const l = v.location || {};
          m[v.id] = {
            nom: v.name,
            ville: l.city,
            alt: l.elevation,               // en pieds
            lat: l.defaultCoordinates?.latitude,
            lon: l.defaultCoordinates?.longitude,
            gauche: f.leftLine, centre: f.center, droite: f.rightLine,
            places: f.capacity, toit: f.roofType,
          };
        }
        setStades(m);
      })
      .catch(() => {});
  }, []);

  const majSuivies = (v) => {
    setSuivies(v);
    saveState({ suivies: v });
  };

  const vider = async () => {
    if (!resetArme) {
      setResetArme(true);
      return;
    }
    setAppris([]);
    await saveState({ appris: [] });
    setResetArme(false);
  };

  const css = `
${POLICES}
    @keyframes trace { to { stroke-dashoffset: 0; } }
    @keyframes rise { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:none;} }
    @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
    .alm-rise { animation: rise 460ms cubic-bezier(.4,0,.2,1) both; }
    .alm-btn { transition: background-color .18s, color .18s, border-color .18s; }

    /* Anneau de focus, au clavier uniquement.
       Le « !important » n'est pas une precaution : la plupart de ces boutons
       portent « all: unset » en style INLINE, ce qui remet outline a zero — et
       une declaration inline l'emporte sur la feuille de style. Sans lui la
       regle s'appliquait bien (le selecteur matche) mais l'outline calcule
       restait « none » : aucun repere visible au clavier, nulle part.
       La regle vise le conteneur plutot qu'une liste de classes, pour couvrir
       aussi les boutons qui n'en portent aucune. */
    .alm-page :is(button, select, input, a):focus-visible {
      outline: 2px solid ${T.sodium} !important;
      outline-offset: 2px !important;
    }
    select.alm-sel { -webkit-appearance:none; appearance:none; }

    /* Zone tactile etendue sans toucher a la mise en page : le pseudo-element
       agrandit la cible de clic du bouton sans deplacer quoi que ce soit. */
    .alm-pill::before { content: ""; position: absolute; inset: -3px -2px; }

    /* Ecrans etroits : on recupere de la largeur partout ou elle est gaspillee. */
    @media (max-width: 560px) {
      .alm-page { padding-left: 12px !important; padding-right: 12px !important; }
      .alm-titre { font-size: 32px !important; }
      .alm-etiquette-nuit { width: 44px !important; }
      .alm-detail { margin-left: 0 !important; }
      .alm-mini { font-size: 9.5px !important; }
    }
    @media (prefers-reduced-motion: reduce) {
      .alm-rise { animation: none; }
      svg line { animation: none !important; stroke-dashoffset: 0 !important; }
    }
  `;

  const mow = `repeating-linear-gradient(115deg, ${T.turf} 0 46px, ${T.turfLit} 46px 92px)`;

  return (
    <div style={{ background: mow, minHeight: "100%", color: T.chalk, fontFamily: FF_BODY }}>
      <style>{css}</style>
      <div className="alm-page" style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 56px" }}>

        <header
          style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            gap: 16, flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FF_MONO, fontSize: 10, letterSpacing: ".22em",
                color: T.sodium, textTransform: "uppercase",
              }}
            >
              Carnet de marque
            </div>
            <h1
              className="alm-titre"
              style={{
                fontFamily: FF_DISPLAY, fontWeight: 800, fontSize: 42, lineHeight: .92,
                margin: "4px 0 0", letterSpacing: ".01em", textTransform: "uppercase",
              }}
            >
              L'almanach
            </h1>
          </div>
          <div style={{ textAlign: "right", fontFamily: FF_MONO, fontSize: 12, color: T.dim }}>
            <div style={{ color: T.chalk, fontSize: 20, fontWeight: 700 }}>
              {String(appris.length).padStart(2, "0")}
              <span style={{ color: T.dim, fontSize: 13 }}> / {CONCEPTS.length}</span>
            </div>
            <div style={{ fontSize: 10, letterSpacing: ".12em" }}>NOTIONS NOTÉES</div>
          </div>
        </header>

        <nav
          style={{
            display: "flex", alignItems: "center", flexWrap: "wrap",
            borderBottom: "1px solid rgba(239,243,234,.22)", margin: "16px 0 22px",
          }}
        >
          {[
            ["carnet", "Le carnet"],
            ["nuits", "Le programme"],
            ["terrains", "Les terrains"],
            ["direct", "Le direct"],
          ].map(([id, libelle]) => (
            <Onglet key={id} id={id} actif={onglet === id} onChoisir={changerOnglet}>
              {libelle}
            </Onglet>
          ))}
        </nav>

        {/* `cle` remet la garde a zero au changement d'onglet. */}
        <Garde cle={onglet}>
        {onglet === "direct" ? (
          <VueDirect teams={teams} suivies={suivies} />
        ) : onglet === "terrains" ? (
          <VueTerrains
            teams={teams}
            stades={stades}
            stadeHabituel={stadeHabituel}
            suivies={suivies}
            cible={cible}
          />
        ) : onglet === "carnet" ? (
          <VueAlmanach teams={teams} appris={appris} setAppris={setAppris} suivies={suivies} />
        ) : (
          <VueNuits
            teams={teams}
            suivies={suivies}
            setSuivies={majSuivies}
            stadeHabituel={stadeHabituel}
            bilans={bilans}
            saisonBilans={saisonBilans}
            stades={stades}
          />
        )}
        </Garde>

        <footer
          style={{
            marginTop: 40, paddingTop: 14, borderTop: "1px solid rgba(239,243,234,.14)",
            fontFamily: FF_MONO, fontSize: 10, color: "rgba(147,166,151,.7)", lineHeight: 1.7,
          }}
        >
          {appris.length > 0 && (
            <>
              <button
                className="alm-btn"
                onClick={vider}
                onBlur={() => setResetArme(false)}
                style={{
                  all: "unset", cursor: "pointer", display: "inline-block",
                  fontFamily: FF_MONO, fontSize: 10, marginBottom: 12,
                  color: resetArme ? T.sodium : T.clay,
                  borderBottom: "1px solid currentColor",
                }}
              >
                {resetArme ? `Confirmer — effacer ${appris.length} notions` : "Vider le carnet"}
              </button>
              <br />
            </>
          )}
          Données : statsapi.mlb.com — usage personnel et éducatif. Horaires convertis en heure de Paris.
          <br />
          Les notions sont piochées dans le vrai déroulé du match ; les plus rares passent en premier,
          parce qu'un simple reviendra demain et pas un balk.
        </footer>
      </div>
    </div>
  );
}

function btnStyle(primaire) {
  return {
    fontFamily: FF_MONO, fontSize: 11.5, letterSpacing: ".1em", textTransform: "uppercase",
    padding: "11px 18px", cursor: "pointer", borderRadius: 2,
    border: `1px solid ${primaire ? T.clay : "rgba(239,243,234,.3)"}`,
    background: primaire ? T.clay : "transparent",
    color: primaire ? "#12241B" : T.chalk,
    fontWeight: 700,
  };
}

/* --------------------------------------------------------------------- *
 *  Exports destines aux tests. Ils n'alourdissent pas le bundle : Rollup
 *  elimine ce qui n'est pas atteint depuis le point d'entree de l'app.
 * --------------------------------------------------------------------- */
export {
  ongletDepuisFragment, choisirMatchDuJour, compteARebours, abregeManche, purgerReports, HORIZON_JOUR, extraireResumes, sourceLisible,
  VueTerrains, projeter, enM, CONTOUR_US, CARTE_L, CARTE_H,
  cibleDepuisFragment, AffichesDuSoir, LienStade, enPi, distancesCloture, BandeauSituation,
  WIKI_STADES, lienWiki,
  VueDirect, BasesOccupees, Compteurs, TableauManches, CHAMPS_DIRECT, CADENCE_DIRECT, classerMatch,
  CHAMPS_HISTOIRE, CADENCE_HISTOIRE, grouperParManche, codeAction, CATEGORIE, TON_ACTION, limiterActions, ACTIONS_VISIBLES,
  estIntendance, INTENDANCE,
  // vue « le programme »
  VueNuits, nuitDe, decalerJour, libelleNuit, repartirEnVoies,
  coteDomicile, noteSuspense, indiceEnvie, raisonEnvie, anecdote,
  libelleSerie, enjeuEquipe, blagueDeNoms, distanceKm, couleurEra,
  DIVISION_FR, RANG_FR, LIMITE_TENABLE, DEBUT, FIN, AUBE, PASTILLE_PX, VOIE_PX,
  // vue « le carnet »
  VueAlmanach, fabriquerQuestion, melanger, detectSightings, indexerClips, classifyFieldOut, CONCEPTS, BY_ID,
  texteAvecKInverse, ordinal, dateFR,
  // garde-fous transverses
  Garde, jourParis, jsonMlb, TZ,
};
