// PshatGPT — pure-static frontend. No backend. Calls Sefaria + Anthropic directly.
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ────────────────────────────────────────────────────────
// Daily learning cycles — computed client-side (deterministic)
// ────────────────────────────────────────────────────────

// Daf Yomi Bavli — Cycle 14 began 2020-01-05 with Berakhot 2a.
// "dafim" = number of daily slots in that masechta (daf 2 through last).
// Names match our Sefaria refs; Shekalim is Yerushalmi (notInApp).
const DAF_YOMI_MASECHTOS = [
  { name: "Berakhot", dafim: 63 },
  { name: "Shabbat", dafim: 156 },
  { name: "Eruvin", dafim: 104 },
  { name: "Pesachim", dafim: 120 },
  { name: "Shekalim", dafim: 21, notInApp: true },
  { name: "Yoma", dafim: 87 },
  { name: "Sukkah", dafim: 55 },
  { name: "Beitzah", dafim: 39 },
  { name: "Rosh Hashanah", dafim: 34 },
  { name: "Taanit", dafim: 30 },
  { name: "Megillah", dafim: 31 },
  { name: "Moed Katan", dafim: 28 },
  { name: "Chagigah", dafim: 26 },
  { name: "Yevamot", dafim: 121 },
  { name: "Ketubot", dafim: 111 },
  { name: "Nedarim", dafim: 90 },
  { name: "Nazir", dafim: 65 },
  { name: "Sotah", dafim: 48 },
  { name: "Gittin", dafim: 89 },
  { name: "Kiddushin", dafim: 81 },
  { name: "Bava Kamma", dafim: 118 },
  { name: "Bava Metzia", dafim: 118 },
  { name: "Bava Batra", dafim: 175 },
  { name: "Sanhedrin", dafim: 112 },
  { name: "Makkot", dafim: 23 },
  { name: "Shevuot", dafim: 48 },
  { name: "Avodah Zarah", dafim: 75 },
  { name: "Horayot", dafim: 13 },
  { name: "Zevachim", dafim: 119 },
  { name: "Menachot", dafim: 109 },
  { name: "Chullin", dafim: 141 },
  { name: "Bekhorot", dafim: 60 },
  { name: "Arakhin", dafim: 33 },
  { name: "Temurah", dafim: 33 },
  { name: "Keritot", dafim: 27 },
  { name: "Meilah", dafim: 36 },
  { name: "Niddah", dafim: 72 },
];
const DAF_YOMI_CYCLE_START = new Date("2020-01-05T00:00:00");

function daysBetween(a, b) {
  const msPerDay = 86400000;
  const d1 = new Date(a); d1.setHours(0,0,0,0);
  const d2 = new Date(b); d2.setHours(0,0,0,0);
  return Math.floor((d2 - d1) / msPerDay);
}

function dafYomiToday() {
  const elapsed = daysBetween(DAF_YOMI_CYCLE_START, new Date());
  const total = DAF_YOMI_MASECHTOS.reduce((s, m) => s + m.dafim, 0);
  const idx = ((elapsed % total) + total) % total;
  let cum = 0;
  for (const m of DAF_YOMI_MASECHTOS) {
    if (idx < cum + m.dafim) {
      const daf = 2 + (idx - cum);
      return {
        masechta: m.name,
        daf,
        ref: `${m.name} ${daf}a`,
        notInApp: !!m.notInApp,
      };
    }
    cum += m.dafim;
  }
  return null;
}

// Chabad/Lubavitcher minhag: one daf of Sotah per day of Sefiras HaOmer.
// Day N of sefirah → Sotah daf N (with day 1 starting at daf 2).
// Dates are hardcoded per year window; add more as needed.
const SEFIRAH_WINDOWS = [
  { year: 5786, start: "2026-04-03", end: "2026-05-21" }, // Pesach II → Erev Shavuos
  { year: 5787, start: "2027-04-22", end: "2027-06-10" },
];

function sefirahSotahToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const w of SEFIRAH_WINDOWS) {
    const start = new Date(w.start + "T00:00:00");
    const end = new Date(w.end + "T23:59:59");
    if (today < start || today > end) continue;
    const dayNum = daysBetween(start, today) + 1;  // 1..49
    const daf = Math.max(dayNum, 2);                // day 1 → daf 2
    return {
      day: dayNum,
      totalDays: 49,
      daf,
      ref: `Sotah ${daf}a`,
    };
  }
  return null;
}

// Render the "Today" shortcut strip into the landing.
function renderTodayShortcuts() {
  const container = $("#today-shortcuts");
  if (!container) return;
  container.innerHTML = "";

  const dy = dafYomiToday();
  if (dy) {
    const card = document.createElement("button");
    card.className = "ed-today-card";
    card.dataset.ref = dy.notInApp ? "" : dy.ref;
    if (dy.notInApp) card.classList.add("ed-today-disabled");
    card.innerHTML = `
      <div class="ed-today-tag">Daf Yomi</div>
      <div class="ed-today-main">${escapeHtml(dy.masechta)} <span class="ed-today-daf">${dy.daf}a</span></div>
      <div class="ed-today-meta">${dy.notInApp ? "Yerushalmi — open on Sefaria" : "open today's daf"} →</div>
    `;
    container.appendChild(card);
  }

  const ss = sefirahSotahToday();
  if (ss) {
    const card = document.createElement("button");
    card.className = "ed-today-card";
    card.dataset.ref = ss.ref;
    card.innerHTML = `
      <div class="ed-today-tag">Sefirah · Sotah <span class="ed-today-day">day ${ss.day}/${ss.totalDays}</span></div>
      <div class="ed-today-main">Sotah <span class="ed-today-daf">${ss.daf}a</span></div>
      <div class="ed-today-meta">open today's daf →</div>
    `;
    container.appendChild(card);
  }
}

const SEFARIA = "https://www.sefaria.org/api/v3/texts";
const SEFARIA_RELATED = "https://www.sefaria.org/api/related";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

// Tools Claude can call mid-conversation.
const TOOLS = [
  {
    name: "fetch_sefaria_text",
    description: "Fetch the Hebrew (and English if available) text of any Sefaria reference. Use this when you need to quote or verify a text you don't currently have in context — for example, a Tosafot in a different sugya, a Rashi on a different daf, a Rambam, a cross-reference the gemara or meforshim cite, or a pasuk. Use the exact Sefaria ref format: 'Tosafot on Bava Metzia 21a:3', 'Bava Batra 28b:4', 'Chiddushei Ramban on Bava Batra 33b:5', 'Mishneh Torah, Robbery and Lost Property 4:14'. Don't fetch things you already have in context, and don't fetch the same ref twice.",
    input_schema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "The Sefaria reference to fetch, e.g. 'Tosafot on Bava Metzia 21a:3'"
        }
      },
      required: ["ref"]
    }
  }
];
const MAX_TOOL_ROUNDS = 5; // safety cap per user turn

// Free-tier proxy: Cloudflare Worker that forwards to Anthropic using the
// owner's API key, rate-limited per IP. Leave empty string to disable.
// Replace with your worker URL after deploying worker/ (see worker/README.md).
const PROXY_URL = "https://pshatgpt-proxy.ysilberstein13.workers.dev";

const KEY_STORAGE = "pshatgpt_api_key";
const CLIENT_ID_KEY = "pshatgpt_client_id";

// Stable per-browser UUID so each device gets its own free-tier budget,
// not shared across a household WiFi. Generated on first visit.
function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
         (Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

let INDEX = null;
let currentAmud = "a";
let currentDaf = null;  // {base_ref, segments, meforshim_by_seg}
let currentStream = null;
let conversation = [];       // [{role, content}, ...] within one modal session
let currentSystem = "";
let currentUserPrefix = "";
let currentMaxTokens = 2048;
let currentMode = "normal";  // "normal" | "iyun"

// ---------- Sefaria fetching ----------
const TAG_RE = /<[^>]+>/g;
const clean = (s) => (s || "").replace(TAG_RE, "").trim();

async function sefariaText(ref) {
  const url = `${SEFARIA}/${ref.replace(/ /g, "_")}?version=hebrew&version=english`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sefaria ${r.status}: ${ref}`);
  return r.json();
}

// Tool implementation: fetch a Sefaria text for Claude.
async function execFetchSefariaText(ref) {
  try {
    const data = await sefariaText(ref);
    let hebrew = "", english = "";
    for (const v of data.versions || []) {
      if (v.language === "he") hebrew = flattenText(v.text);
      else if (v.language === "en") english = clean(flattenText(v.text));
    }
    if (!hebrew && !english) {
      return { error: `No text found at ref: ${ref}` };
    }
    return {
      ref: data.ref || ref,
      hebrew: hebrew.slice(0, 3000),
      english: english.slice(0, 3000),
    };
  } catch (e) {
    return { error: `Failed to fetch '${ref}': ${e.message}. Verify the ref format.` };
  }
}

function flattenText(t) {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map(flattenText).filter(Boolean).join(" ");
  return "";
}

async function fetchDafSegments(baseRef) {
  const data = await sefariaText(baseRef);
  let hebrew = [], english = [];
  for (const v of data.versions || []) {
    if (v.language === "he") hebrew = v.text || [];
    else if (v.language === "en") english = v.text || [];
  }
  const segments = [];
  for (let i = 0; i < Math.max(hebrew.length, english.length); i++) {
    segments.push({
      ref: `${baseRef}:${i+1}`,
      index: i+1,
      hebrew: (hebrew[i] || "").trim(),
      english: clean(english[i] || ""),
      commentaries: [],
    });
  }
  return segments;
}

async function fetchCommentator(commentator, tractate, daf) {
  // Returns nested [segIdx][subIdx] = hebrew string.
  const ref = `${commentator} on ${tractate} ${daf}`.replace(/ /g, "_");
  const url = `${SEFARIA}/${ref}?version=hebrew`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    const v = (data.versions || [])[0];
    if (!v) return [];
    const text = v.text || [];
    return text.map(item => {
      if (Array.isArray(item)) return item.filter(s => s);
      if (typeof item === "string" && item) return [item];
      return [];
    });
  } catch { return []; }
}

const COMMENTATOR_HEBREW = {
  "Rashi": "רש״י",
  "Rashbam": "רשב״ם",
  "Tosafot": "תוספות",
  "Ran": "ר״ן",
  "Ran on Nedarim": "ר״ן",
  "Chiddushei Ramban": "חידושי רמב״ן",
  "Ramban": "רמב״ן",
  "Rashba": "רשב״א",
  "Ritva": "ריטב״א",
  "Meiri": "מאירי",
  "Rif": "רי״ף",
  "Rosh": "רא״ש",
  "Yad Ramah": "יד רמ״ה",
  "Shita Mekubetzet": "שיטה מקובצת",
  "Tosafot Rid": "תוספות רי״ד",
  "Nimukei Yosef": "נמוקי יוסף",
  "Rabbeinu Chananel": "רבנו חננאל",
  "Rabbeinu Gershom": "רבנו גרשום",
  "Mordechai": "מרדכי",
  "Steinsaltz": "שטיינזלץ",
  "Piskei Tosafot": "פסקי תוספות",
  "Chidushei Halachot": "מהרש״א",
  "Chokhmat Shlomo": "מהרש״ל",
  "Pnei Yehoshua": "פני יהושע",
  "Chidushei Chatam Sofer": "חתם סופר",
  "Rashash": "רש״ש",
  "Chiddushei HaRim": "חידושי הרי״ם",
  "Haggahot Ya'avetz": "הגהות יעב״ץ",
};

// Priority order for displaying meforshim. Higher = shows first.
const COMMENTATOR_PRIORITY = {
  "Rashi": 100, "Rashbam": 100,
  "Tosafot": 95,
  "Ramban": 90, "Chiddushei Ramban": 90, "Rashba": 89, "Ritva": 88, "Ran": 87,
  "Meiri": 85, "Yad Ramah": 84, "Shita Mekubetzet": 83, "Nimukei Yosef": 82,
  "Tosafot Rid": 81, "Rabbeinu Chananel": 80, "Rabbeinu Gershom": 79,
  "Rif": 70, "Rosh": 69, "Mordechai": 68,
  "Piskei Tosafot": 60, "Steinsaltz": 55,
  "Chidushei Halachot": 50, "Chokhmat Shlomo": 49, "Pnei Yehoshua": 48,
  "Chidushei Chatam Sofer": 47, "Rashash": 46, "Chiddushei HaRim": 45,
  "Haggahot Ya'avetz": 40,
};

// (refineCommentators removed — dynamic discovery handles this now)

// Primary meforshim loaded eagerly with the daf; rest on-demand.
const PRIMARY_COMMENTATORS = new Set(["Rashi", "Rashbam", "Tosafot", "Ran"]);

// Discover all commentaries Sefaria has for a daf, with counts per commentator.
async function discoverCommentatorsFull(baseRef) {
  const url = `${SEFARIA_RELATED}/${baseRef.replace(/ /g, "_")}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const data = await r.json();
  const commentaries = (data.links || []).filter(l => l.category === "Commentary");
  const byTitle = new Map();
  for (const l of commentaries) {
    const t = l.index_title;
    if (!byTitle.has(t)) byTitle.set(t, { indexTitle: t, count: 0 });
    byTitle.get(t).count += 1;
  }
  const tractate = baseRef.replace(/\s+\d+[ab]$/, "");
  return [...byTitle.values()].map(c => {
    const displayName = extractDisplayName(c.indexTitle, tractate);
    return {
      ...c,
      displayName,
      heName: COMMENTATOR_HEBREW[displayName] || "",
    };
  });
}

// Given "Chiddushei Ramban on Bava Batra" + tractate → "Chiddushei Ramban"
function extractDisplayName(indexTitle, tractate) {
  let name = indexTitle;
  const patterns = [` on ${tractate}`, ` ${tractate}`];
  for (const p of patterns) {
    if (name.endsWith(p)) { name = name.slice(0, -p.length); break; }
  }
  return name.trim();
}

async function fetchDaf(baseRef, _unused) {
  const m = baseRef.match(/^(.+)\s+(\d+[ab])$/);
  if (!m) throw new Error(`bad ref: ${baseRef}`);
  const [_, tractate, daf] = m;

  // Parallel: daf text + discovery (counts only, no commentary text yet)
  const [segments, discovered] = await Promise.all([
    fetchDafSegments(baseRef),
    discoverCommentatorsFull(baseRef),
  ]);

  // Filter to commentaries that match this tractate.
  const relevant = discovered.filter(c => {
    return c.displayName !== c.indexTitle || c.indexTitle.includes(tractate);
  });

  // Partition: primary (load now) vs secondary (lazy).
  const primary = relevant.filter(c => PRIMARY_COMMENTATORS.has(c.displayName));
  const secondary = relevant
    .filter(c => !PRIMARY_COMMENTATORS.has(c.displayName))
    .sort((a, b) => (COMMENTATOR_PRIORITY[b.displayName] ?? 0) - (COMMENTATOR_PRIORITY[a.displayName] ?? 0));

  // Eager-fetch primary commentators only.
  const primaryResults = await Promise.all(
    primary.map(c => fetchCommentatorByIndexTitle(c.indexTitle.replace(/ /g, "_"), tractate, daf))
  );
  for (let i = 0; i < primary.length; i++) {
    distributeCommentary(segments, primary[i], primaryResults[i], daf);
  }

  return {
    base_ref: baseRef,
    segments,
    secondaryAvailable: secondary, // metadata only (name, count, heName, indexTitle)
    secondaryLoaded: new Set(),    // displayNames already lazy-loaded
  };
}

function distributeCommentary(segments, meta, nested, daf) {
  const priority = COMMENTATOR_PRIORITY[meta.displayName] ?? 0;
  for (let segIdxZero = 0; segIdxZero < nested.length; segIdxZero++) {
    const segIdx = segIdxZero + 1;
    const seg = segments[segIdxZero];
    if (!seg) continue;
    for (let subIdxZero = 0; subIdxZero < nested[segIdxZero].length; subIdxZero++) {
      seg.commentaries.push({
        commentator: meta.displayName,
        index_title: meta.indexTitle,
        hebrew_name: meta.heName,
        priority,
        ref: `${meta.indexTitle} ${daf}:${segIdx}:${subIdxZero+1}`,
        sub_index: subIdxZero + 1,
        hebrew: clean(nested[segIdxZero][subIdxZero]),
      });
    }
  }
}

// On-demand loader for a secondary mefaresh; mutates currentDaf.segments.
async function loadSecondaryMefaresh(meta) {
  if (!currentDaf || currentDaf.secondaryLoaded.has(meta.displayName)) return;
  const m = currentDaf.base_ref.match(/^(.+)\s+(\d+[ab])$/);
  if (!m) return;
  const [_, tractate, daf] = m;
  const slug = meta.indexTitle.replace(/ /g, "_");
  const nested = await fetchCommentatorByIndexTitle(slug, tractate, daf);
  distributeCommentary(currentDaf.segments, meta, nested, daf);
  currentDaf.secondaryLoaded.add(meta.displayName);
}

// Fetch by any index_title directly.
async function fetchCommentatorByIndexTitle(indexTitleSlug, tractate, daf) {
  // indexTitleSlug might be "Chiddushei_Ramban_on_Bava_Batra" or "Rif_Bava_Batra"
  // Append the daf.
  const url = `${SEFARIA}/${indexTitleSlug}.${daf}?version=hebrew`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    const v = (data.versions || [])[0];
    if (!v) return [];
    const text = v.text || [];
    return text.map(item => {
      if (Array.isArray(item)) return item.filter(s => s);
      if (typeof item === "string" && item) return [item];
      return [];
    });
  } catch { return []; }
}

// ---------- Index (tractates) ----------
async function loadIndex() {
  const r = await fetch("shas.json");
  INDEX = await r.json();
  // Populate both the header picker and the landing chooser.
  populateTractateSelect($("#tractate-select"));
  populateTractateSelect($("#landing-tractate"));
  $("#tractate-select").value = "Bava Batra";
  $("#landing-tractate").value = "Bava Batra";
  updateDafHint();
  updateLandingHint();
}

function populateTractateSelect(sel) {
  sel.innerHTML = "";
  for (const seder of INDEX.sederim) {
    const group = document.createElement("optgroup");
    group.label = seder.seder;
    for (const t of seder.tractates) {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = `${t.name} · ${t.hebrew}`;
      opt.dataset.lastDaf = t.last_daf;
      opt.dataset.lastAmud = t.last_amud;
      opt.dataset.meforshim = JSON.stringify(t.meforshim);
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }
}

function currentTractate() {
  const opt = $("#tractate-select").selectedOptions[0];
  if (!opt) return null;
  return {
    name: opt.value,
    last_daf: parseInt(opt.dataset.lastDaf, 10),
    last_amud: opt.dataset.lastAmud,
    meforshim: JSON.parse(opt.dataset.meforshim),
  };
}

function updateDafHint() {
  const t = currentTractate();
  if (!t) return;
  $("#daf-hint").textContent = `(2a–${t.last_daf}${t.last_amud})`;
  const inp = $("#daf-number");
  inp.max = t.last_daf;
  if (!inp.value || parseInt(inp.value) > t.last_daf) {
    inp.value = t.name === "Bava Batra" ? "33" : "2";
  }
}

function loadCurrentDaf() {
  const t = currentTractate();
  if (!t) return;
  let daf = parseInt($("#daf-number").value, 10);
  if (isNaN(daf) || daf < 2) daf = 2;
  if (daf > t.last_daf) daf = t.last_daf;
  let amud = currentAmud;
  if (daf === t.last_daf && t.last_amud === "a" && amud === "b") amud = "a";
  loadDaf(`${t.name} ${daf}${amud}`, t.meforshim);
}

async function loadDaf(ref, meforshim) {
  $("#daf-title").textContent = "Loading…";
  $("#daf").innerHTML = "";
  syncPickerToRef(ref);
  updateDafNav(ref);
  try {
    // Figure out meforshim if not passed.
    if (!meforshim) {
      const t = currentTractate();
      meforshim = (t && t.meforshim) || ["Rashi", "Tosafot"];
    }
    const daf = await fetchDaf(ref, meforshim);
    currentDaf = daf;
    renderDaf(daf);
    applyColVisibility();
  } catch (e) {
    $("#daf-title").textContent = `Error: ${e.message}`;
  }
}

// ---------- Mobile column toggles ----------
const COL_VISIBILITY_KEY = "pshatgpt_col_visibility";

function getColVisibility() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_VISIBILITY_KEY) || "{}");
    return {
      gemara: saved.gemara !== false,
      rashi: saved.rashi !== false,
      tosafot: saved.tosafot !== false,
    };
  } catch { return { gemara: true, rashi: true, tosafot: true }; }
}

function setColVisibility(vis) {
  localStorage.setItem(COL_VISIBILITY_KEY, JSON.stringify(vis));
  applyColVisibility();
}

function applyColVisibility() {
  const vis = getColVisibility();
  // Update the pill states
  $$(".col-toggle").forEach(b => b.classList.toggle("active", vis[b.dataset.col]));
  // Update the daf-page class flags
  const page = document.querySelector(".daf-page");
  if (page) {
    page.classList.toggle("hide-gemara", !vis.gemara);
    page.classList.toggle("hide-rashi", !vis.rashi);
    page.classList.toggle("hide-tosafot", !vis.tosafot);
  }
  // If all three off, turn gemara back on — can't have nothing visible.
  if (!vis.gemara && !vis.rashi && !vis.tosafot) {
    setColVisibility({ ...vis, gemara: true });
  }
}

$$(".col-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const col = btn.dataset.col;
    const vis = getColVisibility();
    vis[col] = !vis[col];
    setColVisibility(vis);
  });
});

// Prev/next navigation within a masechta.
function neighborRef(ref, direction) {
  const m = ref.match(/^(.+?)\s+(\d+)([ab])$/);
  if (!m) return null;
  const tractate = m[1];
  let daf = parseInt(m[2], 10);
  let amud = m[3];
  // Look up tractate bounds.
  if (!INDEX) return null;
  let tractateInfo = null;
  for (const s of INDEX.sederim) {
    tractateInfo = s.tractates.find(t => t.name === tractate);
    if (tractateInfo) break;
  }
  if (!tractateInfo) return null;
  if (direction === "next") {
    if (amud === "a") amud = "b";
    else { daf += 1; amud = "a"; }
  } else {
    if (amud === "b") amud = "a";
    else { daf -= 1; amud = "b"; }
  }
  // Clamp to valid range: daf 2a through last_daf + last_amud.
  if (daf < 2) return null;
  if (daf > tractateInfo.last_daf) return null;
  if (daf === tractateInfo.last_daf && tractateInfo.last_amud === "a" && amud === "b") return null;
  return { ref: `${tractate} ${daf}${amud}`, meforshim: tractateInfo.meforshim };
}

function updateDafNav(ref) {
  const prev = neighborRef(ref, "prev");
  const next = neighborRef(ref, "next");
  for (const id of ["#daf-prev", "#daf-prev-bottom"]) {
    const btn = $(id);
    if (btn) {
      btn.disabled = !prev;
      btn.dataset.target = prev ? prev.ref : "";
    }
  }
  for (const id of ["#daf-next", "#daf-next-bottom"]) {
    const btn = $(id);
    if (btn) {
      btn.disabled = !next;
      btn.dataset.target = next ? next.ref : "";
    }
  }
}

function syncPickerToRef(ref) {
  const m = ref.match(/^(.+?)\s+(\d+)([ab])$/);
  if (!m) return;
  const [_, tractate, daf, amud] = m;
  if (INDEX) { $("#tractate-select").value = tractate; updateDafHint(); }
  $("#daf-number").value = daf;
  setAmud(amud);
}

function setAmud(amud) {
  currentAmud = amud;
  $$(".amud-btn").forEach(b => b.classList.toggle("active", b.dataset.amud === amud));
}

// ---------- Render ----------
const MOBILE_QUERY = window.matchMedia("(max-width: 900px)");

function renderDaf(daf) {
  $("#daf-title").textContent = daf.base_ref;
  const container = $("#daf");
  container.innerHTML = "";

  if (MOBILE_QUERY.matches) {
    container.appendChild(renderDafMobile(daf));
  } else {
    container.appendChild(renderDafDesktop(daf));
  }
}

function renderDafDesktop(daf) {
  const allCommentaries = daf.segments.flatMap(s => s.commentaries);
  const byName = groupBy(allCommentaries, c => c.commentator);

  const rashiSideName = byName.has("Rashi") ? "Rashi"
                      : byName.has("Rashbam") ? "Rashbam"
                      : byName.has("Ran") ? "Ran"
                      : null;

  const wrapper = document.createElement("div");

  const page = document.createElement("div");
  page.className = "daf-page";
  if (rashiSideName) {
    page.appendChild(renderMargin("rashi-margin", rashiSideName, byName.get(rashiSideName)));
  }
  if (byName.has("Tosafot")) {
    page.appendChild(renderMargin("tosafot-margin", "Tosafot", byName.get("Tosafot")));
  }
  page.appendChild(renderGemaraBody(daf.segments));
  wrapper.appendChild(page);

  // Secondary meforshim: lazy-loaded, shown as placeholder cards.
  if (daf.secondaryAvailable && daf.secondaryAvailable.length) {
    wrapper.appendChild(renderMoreMeforshim(daf.secondaryAvailable));
  }

  return wrapper;
}

function renderMoreMeforshim(secondaryMeta) {
  const section = document.createElement("section");
  section.className = "more-meforshim";
  const title = document.createElement("div");
  title.className = "more-mef-title";
  title.textContent = "More meforshim on this daf — click to load";
  section.appendChild(title);

  for (const meta of secondaryMeta) {
    const details = document.createElement("details");
    details.className = "more-mef-card";
    const summary = document.createElement("summary");
    summary.innerHTML = `
      <span class="more-mef-name">${escapeHtml(meta.displayName)}</span>
      <span class="more-mef-he">${escapeHtml(meta.heName)}</span>
      <span class="more-mef-count">${meta.count}</span>
    `;
    details.appendChild(summary);

    // Lazy-load on first open.
    const body = document.createElement("div");
    body.className = "more-mef-body";
    body.innerHTML = '<div class="more-mef-loading">loading…</div>';
    details.appendChild(body);

    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loaded) return;
      details.dataset.loaded = "pending";
      await loadSecondaryMefaresh(meta);
      // Pull the now-loaded diburim for this commentator out of segments.
      const items = currentDaf.segments
        .flatMap(s => s.commentaries.filter(c => c.commentator === meta.displayName))
        .sort((a, b) => {
          // Re-sort by segment then sub-index
          const ai = parseInt((a.ref.match(/:(\d+):/) || [])[1] || "0", 10);
          const bi = parseInt((b.ref.match(/:(\d+):/) || [])[1] || "0", 10);
          return ai - bi || a.sub_index - b.sub_index;
        });
      body.innerHTML = "";
      for (const c of items) {
        const d = document.createElement("div");
        d.className = "dibur hebrew-text clickable";
        d.appendChild(withHeadword(c.hebrew));
        d.onclick = () => openExplain(c.ref, c.commentator, c.hebrew, null, {
          kind: "commentary",
          commentator: c.commentator,
          text: c.hebrew,
        });
        body.appendChild(d);
      }
      details.dataset.loaded = "done";
    });

    section.appendChild(details);
  }
  return section;
}

function renderDafMobile(daf) {
  const wrapper = document.createElement("div");
  const page = document.createElement("div");
  page.className = "daf-page daf-mobile";

  for (const seg of daf.segments) {
    const article = document.createElement("article");
    article.className = "mseg";

    // Gemara segment
    const gem = document.createElement("div");
    gem.className = "mseg-gemara hebrew-text";
    const segSpan = document.createElement("span");
    segSpan.className = "seg";
    segSpan.dataset.ref = seg.ref;
    segSpan.textContent = seg.hebrew;
    segSpan.onclick = (e) => {
      e.stopPropagation();
      openExplain(seg.ref, "gemara", seg.hebrew, seg.english, {
        kind: "gemara", text: seg.hebrew, english: seg.english,
      });
    };
    gem.appendChild(segSpan);
    const label = document.createElement("div");
    label.className = "mseg-label";
    label.textContent = `[${seg.index}] ${seg.ref}`;
    article.appendChild(label);
    article.appendChild(gem);

    // Group this segment's commentaries by commentator, sorted by priority.
    const byName = groupBy(seg.commentaries, c => c.commentator);
    const sorted = [...byName.entries()].sort((a, b) => {
      const pa = COMMENTATOR_PRIORITY[a[0]] ?? 0;
      const pb = COMMENTATOR_PRIORITY[b[0]] ?? 0;
      return pb - pa;
    });
    for (const [name, items] of sorted) {
      const colKind =
        ["Rashi", "Rashbam", "Ran"].includes(name) ? "rashi" :
        name === "Tosafot" ? "tosafot" :
        "other";
      article.appendChild(renderMobileCommBlock(colKind, name, items));
    }

    page.appendChild(article);
  }
  wrapper.appendChild(page);
  if (daf.secondaryAvailable && daf.secondaryAvailable.length) {
    wrapper.appendChild(renderMoreMeforshim(daf.secondaryAvailable));
  }
  return wrapper;
}

function renderMobileCommBlock(colKind, name, items) {
  // colKind: "rashi" or "tosafot" — used to hook into column-toggle classes
  const block = document.createElement("div");
  block.className = `mseg-comm mseg-${colKind}`;
  const label = document.createElement("div");
  label.className = "mseg-comm-label";
  label.innerHTML = `<span class="mseg-comm-name">${name}</span><span class="mseg-comm-he">${COMMENTATOR_HEBREW[name] || ""}</span>`;
  block.appendChild(label);
  for (const c of items) {
    const d = document.createElement("div");
    d.className = "dibur hebrew-text";
    d.appendChild(withHeadword(c.hebrew));
    d.onclick = () => openExplain(c.ref, c.commentator, c.hebrew, null, {
      kind: "commentary",
      commentator: c.commentator,
      text: c.hebrew,
    });
    block.appendChild(d);
  }
  return block;
}

// Re-render on crossing the mobile/desktop breakpoint.
MOBILE_QUERY.addEventListener("change", () => {
  if (currentDaf) renderDaf(currentDaf);
  applyColVisibility();
});

function renderMargin(cls, name, items) {
  const div = document.createElement("aside");
  div.className = cls;
  const label = document.createElement("div");
  label.className = "margin-label";
  label.innerHTML = `${name}<span class="he">${COMMENTATOR_HEBREW[name] || ""}</span>`;
  div.appendChild(label);
  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:var(--muted);font-style:italic;font-size:.8rem;";
    empty.textContent = "(none on this daf)";
    div.appendChild(empty);
    return div;
  }
  for (const c of items) {
    const d = document.createElement("span");
    d.className = "dibur";
    d.appendChild(withHeadword(c.hebrew));
    d.onclick = () => openExplain(c.ref, c.commentator, c.hebrew, null, {
      kind: "commentary",
      commentator: c.commentator,
      text: c.hebrew,
    });
    div.appendChild(d);
  }
  return div;
}

function renderGemaraBody(segments) {
  const body = document.createElement("div");
  body.className = "gemara-body";
  for (const seg of segments) {
    const span = document.createElement("span");
    span.className = "seg";
    span.textContent = seg.hebrew + " ";
    span.onclick = (e) => {
      e.stopPropagation();
      openExplain(seg.ref, "gemara", seg.hebrew, seg.english, {
        kind: "gemara", text: seg.hebrew, english: seg.english,
      });
    };
    body.appendChild(span);
  }
  return body;
}

function withHeadword(text) {
  const frag = document.createDocumentFragment();
  const m = text.match(/^(.+?)\s*[–—-]\s*(.*)$/s);
  if (m) {
    const h = document.createElement("span"); h.className = "dibur-head"; h.textContent = m[1];
    frag.appendChild(h);
    frag.appendChild(document.createTextNode(" — " + m[2]));
  } else {
    const words = text.split(/\s+/);
    const h = document.createElement("span"); h.className = "dibur-head";
    h.textContent = words.slice(0, Math.min(4, words.length)).join(" ");
    frag.appendChild(h);
    if (words.length > 4) frag.appendChild(document.createTextNode(" " + words.slice(4).join(" ")));
  }
  return frag;
}

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// ---------- Modal + Anthropic streaming ----------
function getApiKey() { return localStorage.getItem(KEY_STORAGE) || ""; }

// Track page scroll position across modal open/close so we can restore it.
let _modalSavedScrollY = 0;

function lockBodyScroll() {
  _modalSavedScrollY = window.scrollY;
  document.body.style.top = `-${_modalSavedScrollY}px`;
  document.body.classList.add("modal-open");
}
function unlockBodyScroll() {
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, _modalSavedScrollY);
}
function anyModalOpen() {
  return !$("#modal").classList.contains("modal-hidden") ||
         !$("#settings-modal").classList.contains("modal-hidden");
}

function resetMode() {
  currentMode = "normal";
  $("#modal-kind").classList.remove("modal-kind-iyun");
}

function openExplain(ref, kind, hebrewText, englishText, context) {
  resetMode();
  $("#modal-kind").textContent = kind;
  $("#modal-ref").textContent = ref;
  const src = $("#modal-source");
  src.innerHTML = "";
  const he = document.createElement("div");
  he.className = "hebrew-text";
  he.textContent = hebrewText;
  src.appendChild(he);
  // Deep-analysis mode: any commentary ≥ DEEP_THRESHOLD Hebrew chars.
  const isDeep = context?.kind === "commentary"
    && (context?.text?.length || 0) >= DEEP_THRESHOLD;

  const kindEl = $("#modal-kind");
  if (isDeep) {
    kindEl.textContent = `deep ${kind.toLowerCase()}`;
    kindEl.classList.add("modal-kind-deep");
  } else {
    kindEl.classList.remove("modal-kind-deep");
  }

  $("#modal-body").innerHTML = '<span class="cursor"></span>';
  // Reset conversation for the new segment.
  conversation = [];
  currentSystem = isDeep ? DEEP_TOSAFOT_PROMPT : SYSTEM_PROMPT;
  currentMaxTokens = isDeep ? DEEP_MAX_TOKENS : 2048;
  currentUserPrefix = buildUserMessage(ref, context, currentDaf);
  $("#followup-input").value = "";
  $("#modal").classList.remove("modal-hidden");
  lockBodyScroll();
  startExplain(ref, context);
}

function closeModal() {
  $("#modal").classList.add("modal-hidden");
  if (currentStream) { currentStream.abort(); currentStream = null; }
  conversation = [];
  if (!anyModalOpen()) unlockBodyScroll();
}

// A commentary longer than this triggers the deep-analysis system prompt.
const DEEP_THRESHOLD = 400;
const DEEP_MAX_TOKENS = 4096;

const IYUN_MODE_PROMPT = `You are a rosh yeshiva doing **iyun** — deep, comprehensive research on a sugya. The learner has activated research mode (this is expensive so use your tools thoughtfully). Produce a structured, thorough analysis.

## What to cover

1. **Sugya overview** (2-3 sentences on the central question)

2. **Key halachic/lomdus concepts**
   List every core concept the sugya invokes (migo, chazaka, lo chatzif, ho'il, shevuah, mah li l'shaker, tefisah, etc.). For each:
   - Define it in plain English
   - Name its source sugya if known
   - Note its limits and exceptions
   - USE THE fetch_sefaria_text TOOL to pull the foundational source when useful

3. **The logical flow of the sugya**
   Step by step: what each voice contributes, how the dialectic builds, what's resolved vs left open.

4. **Parallels and applications**
   - Fetch 1-3 relevant parallel sugyot the gemara/meforshim cite
   - Fetch the halachic application in Rambam / Tur / Shulchan Aruch if relevant
   - Show how this sugya's principles apply in those parallels

5. **Rishonim machlokes**
   Where the rishonim (Rashi/Rashbam, Tosafot, Ramban, Rashba, etc.) genuinely diverge. What's at stake in each machlokes?

6. **Open questions for further iyun**
   Kushyas that would be worth pursuing; sugyas that would deepen this one.

## How to use tools

Be aggressive with fetch_sefaria_text:
- When the sugya references another sugya, FETCH it
- When meforshim cite a parallel case, FETCH it
- When you want to show the halachic l'maaseh, FETCH Rambam/SA
- When you describe a concept's source sugya, FETCH a line or two to show it
- Aim for 3-8 tool calls in a single iyun session

But: each fetch must be a specific ref. Don't fetch generic searches. Don't fetch the same ref twice. After fetching, quote and analyze what you got.

## Output style

Long-form (1500-3000 words). Structured with markdown headers. Hebrew+English quotes inline. This is iyun, not a summary — the learner expects depth. Think "shiur klali" quality, not "daf summary."

All anti-hallucination rules still apply: don't fabricate anything, ground claims in what you actually fetched or were given.`;

const LOGIC_CHAIN_PROMPT = `You are mapping the **logic chain** of a sugya for a learner — showing every named voice, what they hold, and how they relate to each other.

Use the gemara + meforshim you've been given to trace the dialectic. Produce a structured markdown document:

## Setup
Two sentences max: what's the sugya asking, what's at stake. Don't re-translate the whole daf.

## Voices
Include these as voices in their own right:

1. **Every named amora/tanna** in the gemara text itself (Rav Nachman, R' Abba, etc.)
2. **The stam** — the anonymous Gemara narrator, when it raises questions or resolves them
3. **Rashi / Rashbam** — their READING of the sugya is a position. What do they understand the amora to mean? Where do they resolve ambiguity?
4. **Tosafot** — their kushya + tirutz is a position. What bothered them? What did they answer?
5. Any other loaded mefaresh (Ramban, Rashba, Meiri, etc.) who takes a distinct position worth mapping

For each voice, a labeled card:

### [Speaker name] — [one-line position]
**Claim**: what they hold, in natural English
**Reasoning** (if explicit): the logic they rely on
**Based on**: [ref or segment]

## Dialectic (the give-and-take)
Show how the voices connect, in the order they appear. Use these relation labels:
- **→ challenges**: B disputes A
- **→ qualifies**: B narrows/refines A
- **→ resolves**: B answers a challenge against A
- **→ extends**: B generalizes A
- **→ parallels**: B cites a similar case
- **→ rejects**: B discards A outright
- **→ reads as**: a mefaresh offering an interpretation of an amora's position
- **→ disagrees with**: when two rishonim (e.g. Rashi vs Tosafot) read the same amora differently

Format:
> **Stam** → challenges **Rav Zevid** — "if we believe him for produce, why not land?"
> **Rashi** → reads as **Rav Zevid** — takes the principle to mean X
> **Tosafot** → disagrees with **Rashi** — argues the principle is actually Y

## Unresolved / Open
Machlokes never settled, kushya without a tirutz, Rashi/Tosafot disagreements that the gemara doesn't resolve — note them here.

## Bottom line
What the sugya establishes + any rishonim chiddush that emerges.

---

**Rules:**
- Only include voices actually present in the provided gemara + meforshim
- If a voice isn't in your context, don't invent them
- Keep positions concise — this is a MAP, not a re-explanation
- When a mefaresh takes a distinct position, include them as a voice; when they just translate/paraphrase, you can skip them
- The dialectic order should match the gemara's flow (segment by segment); mefarshim come right after the line they're explaining
- Anti-hallucination rules from before still apply`;

const DEEP_TOSAFOT_PROMPT = `You are a talmid chacham doing a DEEP, STRUCTURED analysis of a long mefaresh for a serious learner. This is iyun-level — do NOT summarize. Break the Hebrew text into labeled parts, then walk through each.

## PHASE 1 — STRUCTURAL BREAKDOWN (start here)

Before explaining anything, identify the distinct parts of this mefaresh. Quote the opening Hebrew words of each part verbatim (2-5 words is enough), and label what kind of move it is. Present it as a short numbered list:

\`\`\`
## Breakdown
1. **דיבור המתחיל** — "כיון דאודי..." — the headword
2. **Kushya** — "וקשה לי..." — the problem being raised
3. **First answer (rejected)** — "וי״ל..." — an attempt
4. **Challenge to first answer** — "ודוחק לומר..." — why it doesn't work
5. **Second answer (chosen)** — "ואור״י..." — the accepted tirutz
6. **Chiddush** — "והא דתנן..." — the new principle
\`\`\`

This breakdown orients the learner before you dive in.

## PHASE 2 — WALK THROUGH EACH PART

For each numbered part from Phase 1:

### Part N: [label]
> **Hebrew**: [quote the full Hebrew segment, not just the opening]
> **Translation**: [natural English, not word-for-word]
> **What's happening**: explain the move — what's being asked, what's being argued, what assumption is in play. Go slow. This is where the iyun happens.

Use these guides based on what you're analyzing:

**Tosafot-specific**: identify dibur hamatchil → kushya → each attempted tirutz (including rejected ones, WITH reasons for rejection) → chosen tirutz → chiddush. Never skip rejected answers — the dialectic IS the argument.

**Ramban / Rashba / Ritva**: often start with the gemara's question, then give their framing. Identify: (a) what easy read are they disturbing? (b) what's their sharper framing? (c) how does this differ from how Rashi/Rashbam read it?

**Meiri**: usually opens with "אמר המאירי", gives halachic summary + peshat. Identify both layers.

**Rif / Rosh**: halachic extraction. Identify what they preserved from the sugya and what they dropped. What halachic conclusion are they reaching?

**Maharsha / Pnei Yehoshua / Maharshal**: these are super-commentaries on Tosafot/Rashi. Identify which Tosafot or Rashi they're commenting on and what move they're making (sharpening, challenging, reframing).

## PHASE 3 — TECHNICAL TERMS

At the end, if the mefaresh used any of these signal-phrases, briefly explain what each one is doing in the argument: "וקשה", "ותירץ", "וא״ת", "ואומר ר״י", "ואור״י", "וי״ל", "מיהו", "תימה", "הקשה", "ותדע", "ודוחק", "וז״ל", "עכ״ל". These aren't filler — they signal the structure.

---

Stay close to the Hebrew. Quote verbatim as you go. Typical length: 500–900 words. Don't rush.

All anti-hallucination rules still apply: don't fabricate quotes from sources you don't have in context.

## HOW TO USE OTHER MEFORSHIM (critical)

You'll have many rishonim + acharonim on this daf available to you (Ramban, Rashba, Meiri, Maharsha, Pnei Yehoshua, etc.). In deep Tosafot mode, these are ESPECIALLY valuable — Maharsha and Pnei Yehoshua often comment directly on the Tosafot you're analyzing.

But don't enumerate them. Bring them in AT THE MOMENT their voice advances the analysis:
- When walking through Tosafot's first kushya, if Maharsha sharpens that kushya — use Maharsha there
- When explaining why Tosafot rejected an answer, if Pnei Yehoshua clarifies the rejection — use him there
- When the chosen tirutz involves a chiddush, if Ramban frames the chiddush differently — that's when to mention Ramban

The structure of your answer follows TOSAFOT'S argument; meforshim are brought in to clarify stages of it, not given their own sections. Teach the way a rebbi teaches a long Tosafot: you're walking through Tosafot, pulling in Maharsha/Ramban/etc. when they illuminate a specific move.`;

const SYSTEM_PROMPT = `You are a patient chavrusa explaining Gemara to a learner.

You'll receive ONE unit to explain — a Gemara line, a Rashi/Rashbam dibur
hamatchil, or a Tosafot dibur hamatchil — plus the full daf (gemara + all
meforshim) as context. The learner may ask follow-up questions afterward.

## How to explain (first response)

1. **Translate** the Hebrew/Aramaic into natural English (not word-for-word).
2. **Locate** it: what is the gemara doing here? What question or claim is
   being made, and how does this advance it?
3. **Unpack** the reasoning: what's the logical move? What's the chiddush?
4. **For Rashi/Rashbam**: what problem in the text is the mefaresh solving?
5. **For Tosafot**: what kushya is being asked, from where, and what's the tirutz?

Keep it conversational but precise. Use Hebrew/Aramaic terms with
transliteration and English ("chazaka — presumptive ownership"). Typically
150-400 words for an initial explanation.

## ANTI-HALLUCINATION RULES (critical)

These rules apply to every response, especially follow-ups:

- **Never fabricate quotes.** If you don't have the exact Hebrew text of a
  Rashi/Tosafot/source in your context, DO NOT quote it. Say "I don't have
  that Rashi loaded — click on it and I can explain it directly."
- **Never invent cross-references.** Don't say "the Gemara in Bava Metzia 21a
  says X" unless you're very confident and even then frame it as "I believe"
  or "if memory serves, though you should verify."
- **Cite what you have.** When you reference a specific claim, say which
  segment/commentator it's from (e.g., "as Tosafot on 33b:8 raises"). If the
  user can't verify it against what's on screen, be very cautious.
- **Say "I don't know."** For obscure questions or things outside the daf
  you've been given, it's better to say "I'm not sure" than to guess.
- **Halacha l'maaseh**: ALWAYS defer to the learner's rav. Never rule on
  practical halacha.
- **Stay grounded in the provided text.** The daf + its meforshim are your
  entire source of truth. If asked about something outside that scope,
  acknowledge the limit.

## SCOPE AND RESPECT (also critical)

You are a teacher, not an entertainer. Keep the focus on learning.

- **Creative pedagogy YES, entertainment theater NO.** Modern analogies, a
  fresh angle, occasional light humor — fine when they genuinely help the
  learner understand the sugya. But pure-entertainment requests that don't
  serve comprehension should be declined with a gentle redirect back to the
  text.
- **Once is enough.** If a learner asks for a creative format (e.g., "explain
  like I'm 10," or a single playful rewrite), do it once if it fits. If they
  then chain more silly transformations ("now rhyme it," "now backwards,"
  "now as a joke"), politely decline and steer back: *"I'd rather help you
  actually understand this sugya. What about the reasoning is still unclear?"*
- **Never present Torah content in ways that are vulgar, profane, mocking,
  or disrespectful** of the text, the Tannaim/Amoraim, rabbinic tradition,
  or Jewish practice. This includes reading Torah backwards, comedic
  inversions that trivialize the content, or fictional framings that
  denigrate the sources.
- **Off-topic questions**: gently redirect. "That's outside this sugya — if
  it's on another daf, open it and I can help there."
- **When declining**, be kind and offer a real learning alternative. You're
  a chavrusa, not a judge.

The tone: a warm, serious talmid chacham who meets the learner where they
are but keeps the learning real.

## TOOL USE — fetch_sefaria_text

You have a tool called \`fetch_sefaria_text\` that pulls any Sefaria reference.
Use it PROACTIVELY when:
- The learner references a text you don't have in context (a Tosafot in a
  different sugya, a Rashi on a different daf, a cross-reference cited in
  this sugya, a Rambam, Shulchan Aruch, a pasuk)
- You want to VERIFY a quote before stating it — if you're tempted to
  paraphrase "and the gemara in BM 21a says X", fetch BM 21a first
- You want to check a parallel sugya that Tosafot or Rashba cites

Don't abuse it:
- Don't fetch things you already have (check the full-daf context first)
- Don't fetch the same ref twice
- Max ~3 lookups per turn; don't loop

After fetching, ground your answer in the actual text you got back. If the
fetch failed or returned empty, tell the learner and ask them to verify the
ref.

## HOW TO USE MULTIPLE MEFORSHIM (critical)

You will be given many meforshim on this daf — Rashi/Rashbam, Tosafot, often
Ramban, Rashba, Ritva, Meiri, Rif, Rosh, and others. **Do NOT enumerate them
mechanically.** "Rashbam says A, Ramban says B, Meiri says C" is a listing,
not teaching. A student leaves that confused about what to actually think.

Instead, teach the way a good rebbi teaches:

- **Start with the core question or tension** — what's the gemara doing,
  what's unclear, what's the machlokes (if any).
- **Build toward understanding.** Bring in a mefaresh at the moment their
  point advances the explanation. Their name comes as a credit for the
  insight, not as a header.
- **Synthesize into ONE coherent read** when possible. Only split into
  "Ramban thinks this, Rashba thinks that" when the disagreement matters
  and is relevant to the learner's question.
- **Name a specific mefaresh only when their voice is necessary.** If three
  meforshim say the same thing, pick the clearest one and quote that.
- **If there's a genuine machlokes that matters**, explain WHY the
  disagreement matters and what's at stake. Don't flatten it, but also
  don't force it.
- **Don't drag in a mefaresh that doesn't serve the current point.** Having
  them in your context doesn't mean they all have to appear in the answer.

Good answer: "The question here is X. Tosafot is bothered because Y, and
proposes Z. Ramban pushes back: he argues that Z doesn't work when W,
and offers a sharper framing — that the real move is V." (flows as one
argument)

Bad answer: "Rashbam explains A. Tosafot says B. Ramban says C. Meiri
says D." (listing, not teaching)`;

function buildLogicChainMessage(daf) {
  const lines = [];
  lines.push(`# Daf: ${daf.base_ref}`);
  lines.push(`\n## Gemara text (all segments):`);
  for (const s of daf.segments) {
    lines.push(`[${s.index}] ${s.hebrew}`);
    if (s.english) lines.push(`   (${s.english})`);
  }
  // Include loaded commentaries for extra grounding.
  const allComms = daf.segments.flatMap(s => s.commentaries.map(c => ({ ...c, segIndex: s.index })));
  const byName = groupBy(allComms, c => c.commentator);
  for (const [name, items] of byName) {
    lines.push(`\n## ${name} on ${daf.base_ref}:`);
    for (const c of items.slice(0, 20)) {
      lines.push(`[seg ${c.segIndex}] ${c.hebrew.slice(0, 400)}`);
    }
  }
  lines.push(`\n---\n`);
  lines.push(`Map the logic chain of this daf: all named voices, their positions, and how they connect.`);
  return lines.join("\n");
}

function openIyunMode() {
  if (!currentDaf) return;
  const remaining = getIyunRemaining();
  if (remaining <= 0) {
    alert("You've used your 2 free Iyun sessions on this device. Add your own API key in Settings for unlimited access.");
    return;
  }
  if (!confirm(`Iyun (research) mode does deep analysis with multiple source lookups.\n\nYou have ${remaining}/2 Iyun sessions remaining on this device (lifetime, no reset).\n\nProceed?`)) return;
  $("#modal-kind").textContent = "iyun";
  $("#modal-kind").classList.remove("modal-kind-deep");
  $("#modal-kind").classList.add("modal-kind-iyun");
  $("#modal-ref").textContent = currentDaf.base_ref;
  const src = $("#modal-source");
  src.innerHTML = `<div style="font-family: Georgia, serif; font-size: 0.85rem; color: var(--muted); font-style: italic;">Deep research on this sugya — fetching parallels, halachic applications, concept sources…</div>`;
  $("#modal-body").innerHTML = '<span class="cursor"></span>';
  conversation = [];
  currentSystem = IYUN_MODE_PROMPT;
  currentMaxTokens = 8192;
  currentMode = "iyun";
  currentUserPrefix = buildLogicChainMessage(currentDaf); // reuses the rich daf context builder
  $("#followup-input").value = "";
  $("#modal").classList.remove("modal-hidden");
  lockBodyScroll();
  conversation = [{ role: "user", content: currentUserPrefix }];
  streamTurn();
}

function openLogicChain() {
  if (!currentDaf) return;
  resetMode();
  $("#modal-kind").textContent = "logic chain";
  $("#modal-kind").classList.remove("modal-kind-deep");
  $("#modal-ref").textContent = currentDaf.base_ref;
  const src = $("#modal-source");
  src.innerHTML = `<div style="font-family: Georgia, serif; font-size: 0.85rem; color: var(--muted);">Mapping all voices in the dialectic…</div>`;
  $("#modal-body").innerHTML = '<span class="cursor"></span>';
  conversation = [];
  currentSystem = LOGIC_CHAIN_PROMPT;
  currentMaxTokens = DEEP_MAX_TOKENS;
  currentUserPrefix = buildLogicChainMessage(currentDaf);
  $("#followup-input").value = "";
  $("#modal").classList.remove("modal-hidden");
  lockBodyScroll();
  // Seed conversation with the first user turn and stream.
  conversation = [{ role: "user", content: currentUserPrefix }];
  streamTurn();
}

function buildUserMessage(ref, ctx, currentDaf) {
  const lines = [];

  // Always provide the full daf (gemara + all meforshim) as grounding
  // context so follow-up questions can be answered without hallucination.
  lines.push(`# Full daf context: ${currentDaf.base_ref}`);
  lines.push(`\n## Gemara text (all segments):`);
  for (const s of currentDaf.segments) {
    lines.push(`[${s.index}] ${s.hebrew}`);
    if (s.english) lines.push(`   (${s.english})`);
  }

  // Group commentaries by commentator, all segments
  const allComms = currentDaf.segments.flatMap(s => s.commentaries.map(c => ({ ...c, segIndex: s.index })));
  const byName = groupBy(allComms, c => c.commentator);
  for (const [name, items] of byName) {
    lines.push(`\n## ${name} on ${currentDaf.base_ref}:`);
    for (const c of items) {
      lines.push(`[seg ${c.segIndex} · ${c.ref}] ${c.hebrew}`);
    }
  }

  // Now the specific clicked item.
  lines.push(`\n---\n`);
  if (ctx.kind === "gemara") {
    lines.push(`**The learner clicked on Gemara segment ${ref}:**`);
    lines.push(`Hebrew/Aramaic: ${ctx.text}`);
    if (ctx.english) lines.push(`English translation: ${ctx.english}`);
    lines.push(`\nExplain this gemara line.`);
  } else if (ctx.kind === "commentary") {
    const m = ref.match(/:(\d+):/);
    const segIdx = m ? parseInt(m[1]) : null;
    const seg = currentDaf.segments.find(s => s.index === segIdx);
    lines.push(`**The learner clicked on ${ctx.commentator} (${ref}):**`);
    if (seg) {
      lines.push(`This comments on gemara segment [${seg.index}]: ${seg.hebrew}`);
    }
    lines.push(`\n${ctx.commentator}'s comment: ${ctx.text}`);
    lines.push(`\nExplain this ${ctx.commentator}.`);
  }
  return lines.join("\n");
}

async function startExplain(ref, ctx) {
  // Initial explanation: seed conversation with the first user turn.
  conversation = [{ role: "user", content: currentUserPrefix }];
  await streamTurn();
}

async function sendFollowup(question) {
  if (!question.trim()) return;
  // Append user turn visually + to state.
  appendUserTurn(question);
  conversation.push({ role: "user", content: question });
  await streamTurn();
}

function appendUserTurn(text) {
  const body = $("#modal-body");
  const div = document.createElement("div");
  div.className = "turn-user";
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

async function streamTurn(toolRound = 0) {
  if (toolRound === 0 && currentStream) currentStream.abort();
  const body = $("#modal-body");

  // Only create a new assistant container for the first API round of a turn.
  let assistantDiv;
  if (toolRound === 0) {
    assistantDiv = document.createElement("div");
    assistantDiv.className = "turn-assistant";
    assistantDiv.innerHTML = '<span class="cursor"></span>';
    if (conversation.length === 1) {
      body.innerHTML = "";
    }
    body.appendChild(assistantDiv);
    body.scrollTop = body.scrollHeight;
  } else {
    // Subsequent rounds reuse the last assistantDiv
    assistantDiv = body.querySelector(".turn-assistant:last-child");
  }

  // Disable input during streaming.
  const input = $("#followup-input");
  const sendBtn = $("#followup-send");
  input.disabled = true; sendBtn.disabled = true;

  const apiKey = getApiKey();
  const useProxy = !apiKey && PROXY_URL;

  if (!apiKey && !PROXY_URL) {
    assistantDiv.innerHTML = `<em>No API key saved. Click ⚙ Settings to add one.</em>`;
    input.disabled = false; sendBtn.disabled = false;
    return;
  }

  const controller = new AbortController();
  currentStream = controller;

  const endpoint = useProxy ? `${PROXY_URL}/v1/messages` : ANTHROPIC;
  const headers = { "content-type": "application/json" };
  if (useProxy) {
    headers["x-client-id"] = getClientId();
    headers["x-mode"] = currentMode;
  } else {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: currentMaxTokens,
        temperature: 0.3,
        system: currentSystem,
        messages: conversation,
        tools: TOOLS,
        stream: true,
      }),
    });
  } catch (err) {
    if (err.name !== "AbortError") assistantDiv.innerHTML = `<em>Network error: ${escapeHtml(err.message)}</em>`;
    input.disabled = false; sendBtn.disabled = false;
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text();
    if (resp.status === 429 && useProxy) {
      assistantDiv.innerHTML = `
        <strong>Free-tier daily limit reached.</strong><br><br>
        You've used your 10 free explanations for today. For unlimited,
        add your own Anthropic API key in
        <a href="#" onclick="openSettings();return false;" style="color:var(--accent)">⚙ Settings</a>.
      `;
      input.disabled = false; sendBtn.disabled = false;
      return;
    }
    let msg = txt.slice(0, 400);
    try { const j = JSON.parse(txt); if (j.message) msg = j.message; else if (j.error?.message) msg = j.error.message; } catch {}
    assistantDiv.innerHTML = `<em>Error ${resp.status}: ${escapeHtml(msg)}</em>`;
    input.disabled = false; sendBtn.disabled = false;
    return;
  }
  if (useProxy) {
    const remaining = resp.headers.get("x-pshatgpt-remaining");
    const limit = resp.headers.get("x-pshatgpt-limit");
    const respMode = resp.headers.get("x-pshatgpt-mode");
    if (remaining !== null && toolRound === 0) {
      if (respMode === "iyun") {
        updateIyunBadge(parseInt(remaining, 10), limit ? parseInt(limit, 10) : null);
      } else {
        updateFreeTierBadge(parseInt(remaining, 10), limit ? parseInt(limit, 10) : null);
      }
    }
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Accumulate both text and tool_use blocks as they stream in.
  let accumulatedText = "";
  let stopReason = null;
  const contentBlocks = []; // [{type:'text',text:'...'}, {type:'tool_use',id,name,input}]
  const toolInputAccumulators = {}; // index → partial JSON string

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_start") {
            const b = evt.content_block;
            contentBlocks[evt.index] = b.type === "tool_use"
              ? { type: "tool_use", id: b.id, name: b.name, input: {} }
              : { type: "text", text: "" };
            if (b.type === "tool_use") {
              toolInputAccumulators[evt.index] = "";
              // Show a subtle "looking up" indicator
              const toolNote = document.createElement("div");
              toolNote.className = "tool-use-note";
              toolNote.dataset.toolIdx = evt.index;
              toolNote.innerHTML = `<span class="tool-icon">📖</span> <span class="tool-text">looking up…</span>`;
              assistantDiv.appendChild(toolNote);
            }
          } else if (evt.type === "content_block_delta") {
            if (evt.delta?.type === "text_delta") {
              accumulatedText += evt.delta.text;
              contentBlocks[evt.index].text += evt.delta.text;
              // Render just the text blocks accumulated so far
              updateAssistantText(assistantDiv, accumulatedText);
              body.scrollTop = body.scrollHeight;
            } else if (evt.delta?.type === "input_json_delta") {
              toolInputAccumulators[evt.index] += evt.delta.partial_json || "";
            }
          } else if (evt.type === "content_block_stop") {
            const block = contentBlocks[evt.index];
            if (block?.type === "tool_use") {
              try { block.input = JSON.parse(toolInputAccumulators[evt.index] || "{}"); }
              catch { block.input = {}; }
              // Update the indicator with the actual ref
              const note = assistantDiv.querySelector(`[data-tool-idx="${evt.index}"] .tool-text`);
              if (note && block.input.ref) note.textContent = `looking up ${block.input.ref}…`;
            }
          } else if (evt.type === "message_delta") {
            if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          }
        } catch (e) { /* partial frame */ }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  }

  updateAssistantText(assistantDiv, accumulatedText);

  // If Claude wanted to call tools, execute them and loop.
  if (stopReason === "tool_use" && toolRound < MAX_TOOL_ROUNDS) {
    // Save assistant turn (text + tool_use blocks) to conversation
    conversation.push({ role: "assistant", content: contentBlocks.filter(Boolean) });
    // Execute each tool call and collect results
    const toolResults = [];
    for (const block of contentBlocks) {
      if (block?.type !== "tool_use") continue;
      let result;
      if (block.name === "fetch_sefaria_text") {
        result = await execFetchSefariaText(block.input?.ref || "");
      } else {
        result = { error: `Unknown tool: ${block.name}` };
      }
      // Update the UI indicator to show it's done
      const note = assistantDiv.querySelector(`[data-tool-idx="${contentBlocks.indexOf(block)}"]`);
      if (note) {
        const text = note.querySelector(".tool-text");
        if (text) {
          if (result.error) text.textContent = `couldn't find ${block.input?.ref || "text"}`;
          else text.textContent = `fetched ${result.ref || block.input?.ref}`;
        }
        note.classList.add("tool-use-done");
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    // Push tool results as a user turn
    conversation.push({ role: "user", content: toolResults });
    // Recurse
    return streamTurn(toolRound + 1);
  }

  // Final: save the complete assistant turn
  if (contentBlocks.some(Boolean)) {
    conversation.push({ role: "assistant", content: contentBlocks.filter(Boolean) });
  }
  currentStream = null;
  input.disabled = false; sendBtn.disabled = false;
  if (!$("#modal").classList.contains("modal-hidden")) input.focus();
}

function updateAssistantText(assistantDiv, text) {
  // Preserve tool-use notes inside the div, replace/update the markdown section.
  let mdDiv = assistantDiv.querySelector(".md-content");
  if (!mdDiv) {
    // Clear the initial cursor
    assistantDiv.innerHTML = "";
    mdDiv = document.createElement("div");
    mdDiv.className = "md-content";
    assistantDiv.appendChild(mdDiv);
  }
  mdDiv.innerHTML = renderMarkdownish(text) + (text ? '<span class="cursor"></span>' : '<span class="cursor"></span>');
}

function renderMarkdownish(text) {
  // Line-based: headers, lists, then inline (bold, italic, code).
  const lines = text.split("\n");
  const out = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw; // keep original
    const mH3 = line.match(/^###\s+(.+)$/);
    const mH2 = line.match(/^##\s+(.+)$/);
    const mH1 = line.match(/^#\s+(.+)$/);
    const mLi = line.match(/^[-*]\s+(.+)$/);

    if (!mLi && inList) { out.push("</ul>"); inList = false; }

    if (mH3) {
      out.push(`<h4>${inlineFmt(mH3[1])}</h4>`);
    } else if (mH2) {
      out.push(`<h3>${inlineFmt(mH2[1])}</h3>`);
    } else if (mH1) {
      out.push(`<h3>${inlineFmt(mH1[1])}</h3>`);
    } else if (mLi) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineFmt(mLi[1])}</li>`);
    } else if (line.trim() === "") {
      out.push("");
    } else {
      out.push(`<p>${inlineFmt(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function inlineFmt(s) {
  s = escapeHtml(s);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // single-asterisk italic — only if NOT preceded/followed by another *
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  return s;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ---------- Free-tier badge ----------
// Shows remaining daily explanations. Initial display uses DEVICE_CAP; after
// each request we use whatever the worker reports. Persists per UTC day.
const DEVICE_CAP = 10;
const REMAINING_KEY = "pshatgpt_remaining";
const LIMIT_KEY = "pshatgpt_limit";
const REMAINING_DAY_KEY = "pshatgpt_remaining_day";

function currentUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

function getRemaining() {
  const savedDay = localStorage.getItem(REMAINING_DAY_KEY);
  if (savedDay !== currentUtcDay()) {
    localStorage.removeItem(REMAINING_KEY);
    localStorage.removeItem(LIMIT_KEY);
    localStorage.setItem(REMAINING_DAY_KEY, currentUtcDay());
    return DEVICE_CAP;
  }
  const n = localStorage.getItem(REMAINING_KEY);
  return n === null ? DEVICE_CAP : parseInt(n, 10);
}

function getLimit() {
  const n = localStorage.getItem(LIMIT_KEY);
  return n === null ? DEVICE_CAP : parseInt(n, 10);
}

function setRemaining(remaining, limit) {
  localStorage.setItem(REMAINING_KEY, String(remaining));
  if (limit) localStorage.setItem(LIMIT_KEY, String(limit));
  localStorage.setItem(REMAINING_DAY_KEY, currentUtcDay());
  renderBadge();
}

function renderBadge() {
  const hasKey = !!getApiKey();
  let badge = $("#free-tier-badge");
  if (hasKey || !PROXY_URL) {
    if (badge) badge.style.display = "none";
    return;
  }
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "free-tier-badge";
    badge.className = "free-tier-badge";
    badge.title = "Click to add your own API key for unlimited explanations";
    badge.onclick = () => openSettings();
    document.body.appendChild(badge);
  }
  const rem = getRemaining();
  const total = getLimit();
  const iyunRem = getIyunRemaining();
  const denominator = Math.max(total, rem);
  badge.innerHTML = `<span class="badge-num">${rem}</span> / ${denominator} today · <span class="badge-iyun">${iyunRem}/${IYUN_CAP} iyun ever</span>`;
  badge.style.display = "block";
  badge.classList.toggle("low", rem <= 2);
  badge.classList.toggle("empty", rem <= 0);
}

function updateFreeTierBadge(remaining, limit) {
  setRemaining(remaining, limit);
}

// Separate tracking for Iyun mode (LIFETIME cap per device — no daily reset).
const IYUN_REMAINING_KEY = "pshatgpt_iyun_remaining";
const IYUN_LIMIT_KEY = "pshatgpt_iyun_limit";
const IYUN_CAP = 2;

function getIyunRemaining() {
  const n = localStorage.getItem(IYUN_REMAINING_KEY);
  return n === null ? IYUN_CAP : parseInt(n, 10);
}
function updateIyunBadge(remaining, limit) {
  localStorage.setItem(IYUN_REMAINING_KEY, String(remaining));
  if (limit) localStorage.setItem(IYUN_LIMIT_KEY, String(limit));
  renderBadge();
}

// ---------- Settings ----------
function setApiKeyStatus() {
  const status = $("#api-key-status");
  if (!status) return;
  const k = getApiKey();
  if (k) {
    status.textContent = `Saved (…${k.slice(-4)}) — unlimited`;
  } else if (PROXY_URL) {
    status.textContent = `Using free tier (10/day). Add a key for unlimited.`;
  } else {
    status.textContent = "No key saved";
  }
}
function openSettings() {
  $("#api-key-input").value = getApiKey();
  setApiKeyStatus();
  $("#settings-modal").classList.remove("modal-hidden");
  lockBodyScroll();
}
function closeSettings() {
  $("#settings-modal").classList.add("modal-hidden");
  if (!anyModalOpen()) unlockBodyScroll();
}

// ---------- Event wiring ----------
$("#settings-btn").onclick = openSettings;
$$("[data-close-settings]").forEach(el => el.addEventListener("click", closeSettings));
$("#api-key-save").onclick = () => {
  const v = $("#api-key-input").value.trim();
  if (v) localStorage.setItem(KEY_STORAGE, v);
  setApiKeyStatus();
  renderBadge();
};
$("#api-key-clear").onclick = () => {
  localStorage.removeItem(KEY_STORAGE);
  $("#api-key-input").value = "";
  setApiKeyStatus();
  renderBadge();
};

$("#load-btn").onclick = loadCurrentDaf;
function wireNav(btnId) {
  const btn = $(btnId);
  if (btn) btn.onclick = () => { const t = btn.dataset.target; if (t) { loadDaf(t); window.scrollTo({top: 0, behavior: "smooth"}); } };
}
wireNav("#daf-prev"); wireNav("#daf-prev-bottom");
wireNav("#daf-next"); wireNav("#daf-next-bottom");
$("#logic-chain-btn").onclick = openLogicChain;
$("#iyun-btn").onclick = openIyunMode;
// Keyboard shortcuts for prev/next when the daf is showing
document.addEventListener("keydown", (e) => {
  if ($("#app-main").classList.contains("app-hidden")) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.key === "ArrowLeft" || e.key === "j") { const b = $("#daf-prev"); if (b && !b.disabled) b.click(); }
  else if (e.key === "ArrowRight" || e.key === "k") { const b = $("#daf-next"); if (b && !b.disabled) b.click(); }
});
$("#tractate-select").addEventListener("change", () => { updateDafHint(); loadCurrentDaf(); });
$("#daf-number").addEventListener("keydown", e => { if (e.key === "Enter") loadCurrentDaf(); });
$$(".amud-btn").forEach(b => {
  b.addEventListener("click", () => { setAmud(b.dataset.amud); loadCurrentDaf(); });
});
$$("[data-close]").forEach(el => el.addEventListener("click", closeModal));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); closeSettings(); }
});

// Follow-up form
$("#followup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#followup-input");
  const q = input.value.trim();
  if (!q || input.disabled) return;
  input.value = "";
  input.style.height = "auto";
  sendFollowup(q);
});
$("#followup-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#followup-form").requestSubmit();
  }
});
// Auto-grow textarea
$("#followup-input").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
});

// ---------- Landing screen ----------
let landingAmud = "a";

function getLandingTractate() {
  const opt = $("#landing-tractate").selectedOptions[0];
  if (!opt) return null;
  return {
    name: opt.value,
    last_daf: parseInt(opt.dataset.lastDaf, 10),
    last_amud: opt.dataset.lastAmud,
    meforshim: JSON.parse(opt.dataset.meforshim),
  };
}

function updateLandingHint() {
  const t = getLandingTractate();
  if (!t) return;
  $("#landing-hint").textContent = `${t.name}: 2a – ${t.last_daf}${t.last_amud}`;
  const inp = $("#landing-daf");
  inp.max = t.last_daf;
  if (!inp.value) inp.value = t.name === "Bava Batra" ? "33" : "2";
}

function setLandingAmud(amud) {
  landingAmud = amud;
  $$("[data-landing-amud]").forEach(b =>
    b.classList.toggle("active", b.dataset.landingAmud === amud));
}

function beginFromLanding() {
  const t = getLandingTractate();
  if (!t) return;
  let daf = parseInt($("#landing-daf").value, 10);
  if (isNaN(daf) || daf < 2) daf = 2;
  if (daf > t.last_daf) daf = t.last_daf;
  let amud = landingAmud;
  if (daf === t.last_daf && t.last_amud === "a" && amud === "b") amud = "a";
  const ref = `${t.name} ${daf}${amud}`;
  exitLanding();
  loadDaf(ref, t.meforshim);
}

function exitLanding() {
  $("#landing").classList.add("app-hidden");
  $("#app-main").classList.remove("app-hidden");
  $("#app-header").classList.remove("header-minimal");
}

$("#landing-tractate").addEventListener("change", updateLandingHint);
$("#landing-daf").addEventListener("keydown", e => { if (e.key === "Enter") beginFromLanding(); });
$("#landing-begin").addEventListener("click", beginFromLanding);
$$("[data-landing-amud]").forEach(b =>
  b.addEventListener("click", () => setLandingAmud(b.dataset.landingAmud)));
$("#landing-settings-link").addEventListener("click", e => { e.preventDefault(); openSettings(); });

// Featured sugya items + Today shortcuts — event delegation.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-ref]");
  if (!el) return;
  const isFeature = el.classList.contains("ed-feature") || el.classList.contains("featured-card");
  const isTodayCard = el.classList.contains("ed-today-card") && !el.classList.contains("ed-today-disabled");
  if (!isFeature && !isTodayCard) return;
  const ref = el.dataset.ref;
  if (!ref || !INDEX) return;
  const m = ref.match(/^(.+?)\s+(\d+)([ab])$/);
  if (!m) return;
  const tractate = m[1];
  let meforshim = ["Rashi", "Tosafot"];
  for (const s of INDEX.sederim) {
    const t = s.tractates.find(t => t.name === tractate);
    if (t) { meforshim = t.meforshim; break; }
  }
  exitLanding();
  loadDaf(ref, meforshim);
});

// Random daf — pick a random tractate, random daf, random amud
$("#random-daf-btn").addEventListener("click", () => {
  if (!INDEX) return;
  const allTractates = INDEX.sederim.flatMap(s => s.tractates);
  const t = allTractates[Math.floor(Math.random() * allTractates.length)];
  const daf = 2 + Math.floor(Math.random() * (t.last_daf - 1));
  let amud = Math.random() < 0.5 ? "a" : "b";
  if (daf === t.last_daf && t.last_amud === "a") amud = "a";
  const ref = `${t.name} ${daf}${amud}`;
  exitLanding();
  loadDaf(ref, t.meforshim);
});

// ---------- Init ----------
(async () => {
  await loadIndex();
  renderTodayShortcuts();
  renderBadge();
  // With a free-tier proxy, don't nag users for a key on first visit.
  // They can upgrade in Settings if/when they hit the limit.
  if (!getApiKey() && !PROXY_URL) setTimeout(openSettings, 300);
})();
