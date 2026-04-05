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

// ---------- Sefaria fetching ----------
const TAG_RE = /<[^>]+>/g;
const clean = (s) => (s || "").replace(TAG_RE, "").trim();

async function sefariaText(ref) {
  const url = `${SEFARIA}/${ref.replace(/ /g, "_")}?version=hebrew&version=english`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sefaria ${r.status}: ${ref}`);
  return r.json();
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
  "Rashi": "רש״י", "Rashbam": "רשב״ם", "Tosafot": "תוספות", "Ran": "ר״ן",
  "Ran on Nedarim": "ר״ן",
};

// Refine commentators by daf: e.g. on Bava Batra, Rashi covers 2a-28b
// and Rashbam covers 29a onward — they don't overlap, so only one exists
// per daf. Filtering here prevents 404s from hitting the Network tab.
function refineCommentators(baseRef, commentators) {
  const mm = baseRef.match(/^(.+?)\s+(\d+)([ab])$/);
  if (!mm) return commentators;
  const [_, tractate, dafStr] = mm;
  const daf = parseInt(dafStr, 10);
  if (tractate === "Bava Batra") {
    // Rashi ends at 28b; Rashbam begins at 29a.
    if (daf >= 29) return commentators.filter(c => c !== "Rashi");
    return commentators.filter(c => c !== "Rashbam");
  }
  return commentators;
}

async function fetchDaf(baseRef, commentators) {
  // Split "Bava Batra 33b" → tractate + daf part.
  const m = baseRef.match(/^(.+)\s+(\d+[ab])$/);
  if (!m) throw new Error(`bad ref: ${baseRef}`);
  const [_, tractate, daf] = m;

  commentators = refineCommentators(baseRef, commentators);
  const segments = await fetchDafSegments(baseRef);

  // Fetch each commentator's whole daf in parallel.
  const nested = await Promise.all(
    commentators.map(c => fetchCommentator(c, tractate, daf))
  );

  // Distribute to segments.
  for (let ci = 0; ci < commentators.length; ci++) {
    const name = commentators[ci];
    // Normalize display name: "Ran on Nedarim" → "Ran"
    const display = name.split(" on ")[0];
    const heName = COMMENTATOR_HEBREW[display] || COMMENTATOR_HEBREW[name] || "";
    const items = nested[ci];
    for (let segIdxZero = 0; segIdxZero < items.length; segIdxZero++) {
      const segIdx = segIdxZero + 1;
      const seg = segments[segIdxZero];
      if (!seg) continue;
      for (let subIdxZero = 0; subIdxZero < items[segIdxZero].length; subIdxZero++) {
        seg.commentaries.push({
          commentator: display,
          hebrew_name: heName,
          ref: `${name} on ${baseRef}:${segIdx}:${subIdxZero+1}`,
          sub_index: subIdxZero + 1,
          hebrew: clean(items[segIdxZero][subIdxZero]),
        });
      }
    }
  }
  return { base_ref: baseRef, segments };
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

  const page = document.createElement("div");
  page.className = "daf-page";

  if (rashiSideName) {
    page.appendChild(renderMargin("rashi-margin", rashiSideName, byName.get(rashiSideName)));
  }
  if (byName.has("Tosafot")) {
    page.appendChild(renderMargin("tosafot-margin", "Tosafot", byName.get("Tosafot")));
  }
  page.appendChild(renderGemaraBody(daf.segments));
  return page;
}

function renderDafMobile(daf) {
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

    // Group this segment's commentaries by commentator
    const byName = groupBy(seg.commentaries, c => c.commentator);
    const rashiSideName = byName.has("Rashi") ? "Rashi"
                        : byName.has("Rashbam") ? "Rashbam"
                        : byName.has("Ran") ? "Ran"
                        : null;
    if (rashiSideName) {
      article.appendChild(renderMobileCommBlock("rashi", rashiSideName, byName.get(rashiSideName)));
    }
    if (byName.has("Tosafot")) {
      article.appendChild(renderMobileCommBlock("tosafot", "Tosafot", byName.get("Tosafot")));
    }

    page.appendChild(article);
  }
  return page;
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

function openExplain(ref, kind, hebrewText, englishText, context) {
  $("#modal-kind").textContent = kind;
  $("#modal-ref").textContent = ref;
  const src = $("#modal-source");
  src.innerHTML = "";
  const he = document.createElement("div");
  he.className = "hebrew-text";
  he.textContent = hebrewText;
  src.appendChild(he);
  $("#modal-body").innerHTML = '<span class="cursor"></span>';
  $("#modal").classList.remove("modal-hidden");
  startExplain(ref, context);
}

function closeModal() {
  $("#modal").classList.add("modal-hidden");
  if (currentStream) { currentStream.abort(); currentStream = null; }
}

const SYSTEM_PROMPT = `You are a patient chavrusa explaining one small piece of Gemara to a learner.

You'll receive ONE unit — either a Gemara line, a Rashi/Rashbam dibur hamatchil,
or a Tosafot dibur hamatchil — together with relevant context from the daf.

Explain it clearly and contextually:

1. **Translate** the Hebrew/Aramaic into natural English (not a word-for-word gloss).
2. **Locate** it: what is the gemara doing at this point? What question or claim
   is being made, and how does this unit advance it?
3. **Unpack** the reasoning: what's the logical move? What assumption does it
   rely on? What's the chiddush?
4. **For Rashi/Rashbam**: what problem in the text is the mefaresh solving?
5. **For Tosafot**: what kushya is being asked, from where, and what's the tirutz?

Keep it conversational but precise. Use Hebrew/Aramaic terms with transliteration
and English (e.g. "chazaka — presumptive ownership"). Stop when the explanation is
complete — usually 150-400 words.`;

function buildUserMessage(ref, ctx, currentDaf) {
  const lines = [];
  if (ctx.kind === "gemara") {
    lines.push(`**Clicked: Gemara segment ${ref}**\n`);
    lines.push(`Hebrew/Aramaic: ${ctx.text}\n`);
    if (ctx.english) lines.push(`Existing English translation: ${ctx.english}\n`);
    lines.push(`\nFor context, here is the surrounding daf (${currentDaf.base_ref}):\n`);
    for (const s of currentDaf.segments) {
      lines.push(`[${s.index}] ${s.hebrew}`);
    }
    lines.push(`\nExplain this gemara line.`);
  } else if (ctx.kind === "commentary") {
    // Find the parent gemara segment for context.
    const m = ref.match(/:(\d+):/);
    const segIdx = m ? parseInt(m[1]) : null;
    const seg = currentDaf.segments.find(s => s.index === segIdx);
    lines.push(`**Clicked: ${ctx.commentator} on ${ref}**\n`);
    if (seg) {
      lines.push(`The gemara line this comments on:`);
      lines.push(`  Hebrew: ${seg.hebrew}`);
      if (seg.english) lines.push(`  English: ${seg.english}`);
      lines.push("");
    }
    lines.push(`${ctx.commentator}'s comment (Hebrew):`);
    lines.push(`  ${ctx.text}\n`);
    lines.push(`Explain this ${ctx.commentator}.`);
  }
  return lines.join("\n");
}

async function startExplain(ref, ctx) {
  if (currentStream) currentStream.abort();
  const body = $("#modal-body");
  body.innerHTML = '<span class="cursor"></span>';

  const apiKey = getApiKey();
  const useProxy = !apiKey && PROXY_URL;

  if (!apiKey && !PROXY_URL) {
    body.innerHTML = `<em>No API key saved. Click ⚙ Settings to add one.</em>`;
    return;
  }

  const userMsg = buildUserMessage(ref, ctx, currentDaf);
  const controller = new AbortController();
  currentStream = controller;

  const endpoint = useProxy ? `${PROXY_URL}/v1/messages` : ANTHROPIC;
  const headers = { "content-type": "application/json" };
  if (useProxy) {
    headers["x-client-id"] = getClientId();
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
        max_tokens: 2048,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
        stream: true,
      }),
    });
  } catch (err) {
    if (err.name !== "AbortError") body.innerHTML = `<em>Network error: ${escapeHtml(err.message)}</em>`;
    return;
  }
  if (!resp.ok) {
    const txt = await resp.text();
    // Rate limit reached on the free tier: give a clear upgrade message.
    if (resp.status === 429 && useProxy) {
      body.innerHTML = `
        <strong>Free-tier daily limit reached.</strong><br><br>
        You've used your 10 free explanations for today. For unlimited,
        add your own Anthropic API key in
        <a href="#" onclick="openSettings();return false;" style="color:var(--accent)">⚙ Settings</a>
        — get one at
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style="color:var(--accent)">console.anthropic.com</a>.
      `;
      return;
    }
    let msg = txt.slice(0, 400);
    try { const j = JSON.parse(txt); if (j.message) msg = j.message; else if (j.error?.message) msg = j.error.message; } catch {}
    body.innerHTML = `<em>Error ${resp.status}: ${escapeHtml(msg)}</em>`;
    return;
  }
  // Track remaining free-tier quota if the proxy reported it.
  if (useProxy) {
    const remaining = resp.headers.get("x-pshatgpt-remaining");
    const limit = resp.headers.get("x-pshatgpt-limit");
    if (remaining !== null) {
      updateFreeTierBadge(parseInt(remaining, 10), limit ? parseInt(limit, 10) : null);
    }
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

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
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            accumulated += evt.delta.text;
            body.innerHTML = renderMarkdownish(accumulated) + '<span class="cursor"></span>';
            body.scrollTop = body.scrollHeight;
          }
        } catch (e) { /* partial */ }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  }
  body.innerHTML = renderMarkdownish(accumulated);
  currentStream = null;
}

function renderMarkdownish(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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
  // Clamp display: if remaining > total, just show remaining.
  const denominator = Math.max(total, rem);
  badge.innerHTML = `<span class="badge-num">${rem}</span> / ${denominator} free explanations left today`;
  badge.style.display = "block";
  badge.classList.toggle("low", rem <= 2);
  badge.classList.toggle("empty", rem <= 0);
}

function updateFreeTierBadge(remaining, limit) {
  setRemaining(remaining, limit);
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
}
function closeSettings() { $("#settings-modal").classList.add("modal-hidden"); }

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
