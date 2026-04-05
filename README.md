# PshatGPT

**Live: [ys770.github.io/pshatgpt](https://ys770.github.io/pshatgpt/)**

AI-assisted tzuras hadaf. Click any line of Gemara, Rashi/Rashbam, or Tosafot — get a contextual explanation streamed to you.

Pshat (פשט) = the plain-meaning reading. This tool gives you that first layer, fast, with the commentary structure intact.

## Quick start

1. Open [ys770.github.io/pshatgpt](https://ys770.github.io/pshatgpt/)
2. Click ⚙ Settings → paste your Anthropic API key ([get one](https://console.anthropic.com/settings/keys)) → Save
3. Pick a tractate + daf → click anything Hebrew → watch Claude explain it

Your API key stays in your browser's localStorage and is sent directly to Anthropic — it never touches any server.

## What it does

- Loads any daf of Talmud Bavli from Sefaria (all 37 tractates indexed)
- Displays the gemara with Rashi/Rashbam + Tosafot attached, in a tzuras-hadaf-style layout
- Every Hebrew segment and every dibur hamatchil is clickable
- On click: opens a modal and streams a contextual explanation from Claude (Anthropic API)
- Explanations locate the text in its sugya, unpack the reasoning, and name the chiddush

## Architecture

PshatGPT runs in **two modes**:

### Static mode (deployed on GitHub Pages)

```
Browser (on ys770.github.io/pshatgpt)
   │
   ├──▶ Sefaria REST    (text + commentaries, CORS-enabled)
   └──▶ Anthropic API   (streaming, key from localStorage)
```

Pure static site. Zero backend. Deploys from `/docs` on master.

### Local dev mode (FastAPI)

```
Browser  ↔  FastAPI (gemara/web.py)  ↔  Sefaria / Anthropic
```

Same UI, but the Python backend proxies API calls — useful for iterating on
the agents, caching, and logging.

- **Sefaria** supplies all Hebrew/Aramaic text and commentaries via its public REST API (no auth).
- **Anthropic Claude** (claude-sonnet-4-5) generates the explanations. You bring your own API key.
- **No server-side storage** of keys or user data. Your key lives in your browser.

## Local setup

Requires Python 3.11+.

```bash
git clone https://github.com/ys770/pshatgpt.git
cd pshatgpt
pip install fastapi uvicorn httpx pydantic anthropic pymupdf
python -m gemara.web
```

Then open http://127.0.0.1:8000 and enter your Anthropic API key in Settings (⚙).

Get an Anthropic API key at https://console.anthropic.com/settings/keys.

## Usage

1. Pick a tractate from the dropdown (grouped by seder)
2. Enter a daf number + select amud a/b → click **Load**
3. The daf renders with Rashi/Rashbam in the left margin, Tosafot in the right
4. Click any Hebrew text — gemara line, Rashi comment, or Tosafot piece — to get an explanation
5. **Double-click** a gemara segment to toggle its English translation

## Per-tractate commentary mapping

Most of Shas uses Rashi + Tosafot. Exceptions:

- **Bava Batra** (29a onward): Rashbam takes over from Rashi
- **Nedarim**: Ran is the primary commentary
- ...and a few others handled in `gemara/shas.py`

## Project layout

```
gemara/
├── web.py              FastAPI app
├── fetcher.py          Sefaria daf fetcher
├── meforshim.py        Rashi/Rashbam/Tosafot whole-daf fetcher
├── shas.py             Shas index — all 37 tractates, daf counts, mefaresh mapping
├── llm.py              Anthropic client (streaming)
├── pdf_viewer.py       (wip) scanned Shas PDF page renderer
├── models.py           Pydantic: Segment, Commentary, Sugya
└── agents/
    ├── explainer.py    Click-to-explain agent
    └── comprehension.py   (wip) sugya-level analysis agent

static/
├── index.html
├── style.css
└── app.js
```

## Status

**This is a preview.** It works end-to-end for clicking gemara/Rashi/Tosafot and getting a Claude-streamed explanation, but there's meaningful work still ahead.

Some planned features may eventually move behind a paid tier.

## Roadmap

**Core quality:**
- [ ] **Deeper pshat-style reasoning** — explanations tuned to read the text the way a rebbi would: context-aware, sugya-aware, faithful to the classical meforshim
- [ ] **Authentic tzuras hadaf** — true Vilna-style page layout with the gemara wrapping around Rashi and Tosafot (not the current 3-column approximation)

**Features:**
- [ ] PDF-scan view toggle (calibrate tzuras hadaf images from the Shas Nehardea set)
- [ ] Cross-reference navigation — click into an explanation's citations
- [ ] Save / pin explanations for review
- [ ] Difficulty heatmap (meforshim density per segment)
- [ ] More commentaries beyond Rashi+Tosafot (Ramban, Ritva, Rosh...)

## License

**CC BY-NC-SA 4.0** — [Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/).

- ✅ Use it, study it, share it, modify it
- ✅ Attribution required
- ❌ **No commercial use** — non-commercial only
- 🔄 **ShareAlike** — if you distribute modifications, you must use the same license

Full legal text in [`LICENSE`](./LICENSE).

Note: CC BY-NC-SA is not an OSI-approved "open source" license because it restricts commercial use. It is a *source-available, noncommercial, share-alike* license — which matches the intent: this is a learning tool, not a SaaS product.
