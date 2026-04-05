const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let INDEX = null; // {sederim: [{seder, tractates: [...]}]}
let currentAmud = "a";

// ---------- Load index + build tractate picker ----------
async function loadIndex() {
  const r = await fetch("/api/index");
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
  };
}

function updateDafHint() {
  const t = currentTractate();
  if (!t) return;
  $("#daf-hint").textContent = `(2a–${t.last_daf}${t.last_amud})`;
  const dafInput = $("#daf-number");
  dafInput.max = t.last_daf;
  if (!dafInput.value || parseInt(dafInput.value) > t.last_daf) {
    dafInput.value = t.name === "Bava Batra" ? "33" : "2";
  }
}

function loadCurrentDaf() {
  const t = currentTractate();
  if (!t) return;
  let daf = parseInt($("#daf-number").value, 10);
  if (isNaN(daf) || daf < 2) daf = 2;
  if (daf > t.last_daf) daf = t.last_daf;
  let amud = currentAmud;
  // Don't allow 'b' if the tractate ends on 'a' of the last daf.
  if (daf === t.last_daf && t.last_amud === "a" && amud === "b") amud = "a";
  const ref = `${t.name} ${daf}${amud}`;
  loadDaf(ref);
}

// ---------- Load + render daf ----------
async function loadDaf(ref) {
  $("#daf-title").textContent = "Loading…";
  $("#daf").innerHTML = "";
  // Sync picker to the loaded ref.
  syncPickerToRef(ref);
  const r = await fetch(`/api/daf?ref=${encodeURIComponent(ref)}`);
  if (!r.ok) {
    $("#daf-title").textContent = "Error loading " + ref;
    return;
  }
  const daf = await r.json();
  renderDaf(daf);
}

function renderDaf(daf) {
  $("#daf-title").textContent = daf.base_ref;
  const container = $("#daf");
  container.innerHTML = "";

  // Collect all commentaries across segments, grouped by commentator.
  const allCommentaries = daf.segments.flatMap(s => s.commentaries);
  const byName = groupBy(allCommentaries, c => c.commentator);

  // Pick the "Rashi-side" commentator for this daf (Rashbam takes over BB).
  const rashiSideName = byName.has("Rashi") ? "Rashi"
                      : byName.has("Rashbam") ? "Rashbam"
                      : null;

  const page = document.createElement("div");
  page.className = "daf-page";

  // Margins are floated first so the gemara-body wraps around them.
  if (rashiSideName) {
    page.appendChild(renderMargin(
      "rashi-margin", rashiSideName, byName.get(rashiSideName) || []
    ));
  }
  if (byName.has("Tosafot")) {
    page.appendChild(renderMargin(
      "tosafot-margin", "Tosafot", byName.get("Tosafot") || []
    ));
  }

  // Then the gemara flows as one continuous block.
  page.appendChild(renderGemaraBody(daf.segments));

  container.appendChild(page);
}

function renderMargin(cls, name, items) {
  const div = document.createElement("aside");
  div.className = cls;

  const label = document.createElement("div");
  label.className = "margin-label";
  label.innerHTML = `${name}<span class="he">${hebrewNameFor(name)}</span>`;
  div.appendChild(label);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.style.color = "var(--muted)";
    empty.style.fontStyle = "italic";
    empty.style.fontSize = "0.8rem";
    empty.textContent = "(none on this daf)";
    div.appendChild(empty);
    return div;
  }

  for (const c of items) {
    const d = document.createElement("span");
    d.className = "dibur";
    d.appendChild(withHeadword(c.hebrew));
    d.onclick = () => openExplain(c.ref, c.commentator, c.hebrew, null);
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
      openExplain(seg.ref, "gemara", seg.hebrew, seg.english);
    };
    body.appendChild(span);
  }
  return body;
}

function withHeadword(text) {
  // Extract the headword (dibur hamatchil) — everything up to the first hyphen
  // or dash, which is the classical separator in printed editions. Fallback:
  // first 5-6 words.
  const frag = document.createDocumentFragment();
  const dashMatch = text.match(/^(.+?)\s*[–—-]\s*(.*)$/s);
  if (dashMatch) {
    const head = document.createElement("span");
    head.className = "dibur-head";
    head.textContent = dashMatch[1];
    frag.appendChild(head);
    frag.appendChild(document.createTextNode(" — " + dashMatch[2]));
  } else {
    const words = text.split(/\s+/);
    const head = document.createElement("span");
    head.className = "dibur-head";
    head.textContent = words.slice(0, Math.min(4, words.length)).join(" ");
    frag.appendChild(head);
    if (words.length > 4) {
      frag.appendChild(document.createTextNode(" " + words.slice(4).join(" ")));
    }
  }
  return frag;
}

function hebrewNameFor(name) {
  return {
    "Rashi": "רש״י",
    "Rashbam": "רשב״ם",
    "Tosafot": "תוספות",
    "Ran": "ר״ן",
  }[name] || "";
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

// ---------- Modal + streaming explain ----------
let currentStream = null;

function openExplain(ref, kind, hebrewText, englishText) {
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
  startStream(ref);
}

function closeModal() {
  $("#modal").classList.add("modal-hidden");
  if (currentStream) {
    currentStream.abort();
    currentStream = null;
  }
}

async function startStream(ref) {
  if (currentStream) currentStream.abort();
  const body = $("#modal-body");
  body.innerHTML = '<span class="cursor"></span>';
  let accumulated = "";

  const key = getApiKey();
  const headers = {};
  if (key) headers["X-Anthropic-Key"] = key;

  const controller = new AbortController();
  currentStream = controller;

  let resp;
  try {
    resp = await fetch(`/api/explain?ref=${encodeURIComponent(ref)}`, {
      headers, signal: controller.signal,
    });
  } catch (err) {
    if (err.name !== "AbortError") body.innerHTML = `<em>Network error: ${escapeHtml(err.message)}</em>`;
    return;
  }
  if (!resp.ok) {
    body.innerHTML = `<em>Error ${resp.status}</em>`;
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames end with \n\n.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const line = frame.startsWith("data: ") ? frame.slice(6) : frame;
        if (line === "[DONE]") continue;
        try {
          const d = JSON.parse(line);
          if (d.error) {
            body.innerHTML = `<em>Error: ${escapeHtml(d.error)}</em>`;
            controller.abort();
            return;
          }
          if (d.text) {
            accumulated += d.text;
            body.innerHTML = renderMarkdownish(accumulated) + '<span class="cursor"></span>';
            body.scrollTop = body.scrollHeight;
          }
        } catch (err) { /* partial frame; ignore */ }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  }
  body.innerHTML = renderMarkdownish(accumulated);
  currentStream = null;
}

function renderMarkdownish(text) {
  // Very light markdown: **bold** and paragraph breaks. Safe escape first.
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return s;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]
  ));
}

function syncPickerToRef(ref) {
  // Parse "Tractate Name 33b" → set picker fields.
  const m = ref.match(/^(.+?)\s+(\d+)([ab])$/);
  if (!m) return;
  const [_, tractate, daf, amud] = m;
  if (INDEX) {
    $("#tractate-select").value = tractate;
    updateDafHint();
  }
  $("#daf-number").value = daf;
  setAmud(amud);
}

function setAmud(amud) {
  currentAmud = amud;
  $$(".amud-btn").forEach(b => b.classList.toggle("active", b.dataset.amud === amud));
}

// ---------- Event wiring ----------
$("#load-btn").onclick = loadCurrentDaf;
$("#tractate-select").addEventListener("change", () => {
  updateDafHint();
  loadCurrentDaf();
});
$("#daf-number").addEventListener("keydown", e => {
  if (e.key === "Enter") loadCurrentDaf();
});
$$(".amud-btn").forEach(b => {
  b.addEventListener("click", () => { setAmud(b.dataset.amud); loadCurrentDaf(); });
});
document.querySelectorAll("[data-close]").forEach(el => {
  el.addEventListener("click", closeModal);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

// ---------- API Key Settings ----------
const KEY_STORAGE = "pshatgpt_api_key";

function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) || "";
}

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

function closeSettings() {
  $("#settings-modal").classList.add("modal-hidden");
}

$("#settings-btn").onclick = openSettings;
document.querySelectorAll("[data-close-settings]").forEach(el =>
  el.addEventListener("click", closeSettings)
);
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

// ---------- Init ----------
(async () => {
  await loadIndex();
  loadDaf("Bava Batra 33b");
  // Prompt for API key on first run if not set.
  if (!getApiKey()) {
    setTimeout(() => openSettings(), 500);
  }
})();
