# PshatGPT

AI-assisted tzuras hadaf. Click any line of Gemara, Rashi/Rashbam, or Tosafot — get a contextual explanation streamed to you.

Pshat (פשט) = the plain-meaning reading. This tool gives you that first layer, fast, with the commentary structure intact.

## What it does

- Loads any daf of Talmud Bavli from Sefaria (all 37 tractates indexed)
- Displays the gemara with Rashi/Rashbam + Tosafot attached, in a tzuras-hadaf-style layout
- Every Hebrew segment and every dibur hamatchil is clickable
- On click: opens a modal and streams a contextual explanation from Claude (Anthropic API)
- Explanations locate the text in its sugya, unpack the reasoning, and name the chiddush

## Architecture

```
Browser (3-col tzuras hadaf)
     │
     ├── GET /api/index        → Shas structure (sederim, tractates, daf counts)
     ├── GET /api/daf?ref=...  → gemara text + Rashbam/Rashi/Tosafot on this daf
     └── GET /api/explain?ref=X → SSE stream of Claude explanation
            │
            ├── Sefaria REST  (text fetched at load-time, cached per daf)
            └── Anthropic API (key sent per-request from browser localStorage)
```

- **Sefaria** supplies all Hebrew/Aramaic text and commentaries via its public REST API (no auth).
- **Anthropic Claude** (claude-sonnet-4-5) generates the explanations. You bring your own API key.
- **No server-side storage** of keys or user data. Your key lives in your browser.

## Setup

Requires Python 3.11+.

```bash
git clone https://github.com/YOUR/pshatgpt.git
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

## Roadmap

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
