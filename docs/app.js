// PshatGPT — pure-static frontend. No backend. Calls Sefaria + Anthropic directly.
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const SEFARIA = "https://www.sefaria.org/api/v3/texts";
const SEFARIA_RELATED = "https://www.sefaria.org/api/related";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const KEY_STORAGE = "pshatgpt_api_key";

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
  const sel = $("#tractate-select");
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
  sel.value = "Bava Batra";
  updateDafHint();
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
  try {
    // Figure out meforshim if not passed.
    if (!meforshim) {
      const t = currentTractate();
      meforshim = (t && t.meforshim) || ["Rashi", "Tosafot"];
    }
    const daf = await fetchDaf(ref, meforshim);
    currentDaf = daf;
    renderDaf(daf);
  } catch (e) {
    $("#daf-title").textContent = `Error: ${e.message}`;
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
function renderDaf(daf) {
  $("#daf-title").textContent = daf.base_ref;
  const container = $("#daf");
  container.innerHTML = "";

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

  container.appendChild(page);
}

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
  if (!apiKey) {
    body.innerHTML = `<em>No API key saved. Click ⚙ Settings to add one.</em>`;
    return;
  }

  const userMsg = buildUserMessage(ref, ctx, currentDaf);
  const controller = new AbortController();
  currentStream = controller;

  let resp;
  try {
    resp = await fetch(ANTHROPIC, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
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
    body.innerHTML = `<em>Anthropic error ${resp.status}: ${escapeHtml(txt.slice(0,300))}</em>`;
    return;
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

// ---------- Settings ----------
function setApiKeyStatus() {
  const status = $("#api-key-status");
  if (!status) return;
  const k = getApiKey();
  status.textContent = k ? `Saved (…${k.slice(-4)})` : "No key saved";
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
};
$("#api-key-clear").onclick = () => {
  localStorage.removeItem(KEY_STORAGE);
  $("#api-key-input").value = "";
  setApiKeyStatus();
};

$("#load-btn").onclick = loadCurrentDaf;
$("#tractate-select").addEventListener("change", () => { updateDafHint(); loadCurrentDaf(); });
$("#daf-number").addEventListener("keydown", e => { if (e.key === "Enter") loadCurrentDaf(); });
$$(".amud-btn").forEach(b => {
  b.addEventListener("click", () => { setAmud(b.dataset.amud); loadCurrentDaf(); });
});
$$("[data-close]").forEach(el => el.addEventListener("click", closeModal));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); closeSettings(); }
});

// ---------- Init ----------
(async () => {
  await loadIndex();
  loadDaf("Bava Batra 33b");
  if (!getApiKey()) setTimeout(openSettings, 500);
})();
