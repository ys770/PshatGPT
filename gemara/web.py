"""Minimal FastAPI webui for browsing a sugya."""
from __future__ import annotations

from pathlib import Path

import json

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from gemara.fetcher import fetch_daf, fetch_sugya
from gemara.models import Sugya, Understanding

app = FastAPI(title="Gemara")

# Cache sugyot by key so we don't hammer Sefaria on every reload.
_CACHE: dict[str, Sugya] = {}
# Cache whole dafs by ref so agent-time lookups are fast.
_DAF_CACHE: dict[str, Sugya] = {}

from gemara.shas import all_tractates, meforshim_for_tractate


def _meforshim_for(base_ref: str) -> list[str]:
    """Pick commentators based on tractate name prefix of the ref."""
    for t in all_tractates():
        if base_ref.startswith(t["name"]):
            return t["meforshim"]
    return ["Rashi", "Tosafot"]
# Cache comprehension results — they cost API calls, never recompute casually.
_UNDERSTANDING_CACHE: dict[str, Understanding] = {}

# Preset sugyot — add more as we go.
PRESETS: dict[str, dict] = {
    "nesikha": {
        "title": "Nesikha d'Rabbi Abba",
        "base_ref": "Bava Batra 33b",
        "segment_range": [4, 8],
        "commentators": ["Rashbam", "Tosafot"],
    },
}


@app.get("/api/presets")
def list_presets() -> dict:
    return {k: {"title": v["title"], "base_ref": v["base_ref"]} for k, v in PRESETS.items()}


@app.get("/api/sugya/{key}")
def get_sugya(key: str) -> Sugya:
    if key not in PRESETS:
        raise HTTPException(404, f"unknown preset: {key}")
    if key not in _CACHE:
        cfg = PRESETS[key]
        _CACHE[key] = fetch_sugya(
            base_ref=cfg["base_ref"],
            segment_range=tuple(cfg["segment_range"]),
            title=cfg["title"],
            commentators=cfg.get("commentators"),
        )
    return _CACHE[key]


@app.get("/api/pdf-page")
def pdf_page(tractate: str, page: int):
    """Return a raw PDF page as PNG. For calibration + direct use."""
    from fastapi.responses import Response
    from gemara.pdf_viewer import render_page
    try:
        png = render_page(tractate, page, zoom=1.8)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(404, str(e))
    except IndexError as e:
        raise HTTPException(400, str(e))
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/daf-image")
def daf_image(ref: str):
    """Return the tzuras-hadaf scan for a given daf ref, e.g. 'Bava Batra 33b'."""
    from fastapi.responses import Response
    from gemara.pdf_viewer import daf_amud_to_page, render_page
    import re
    m = re.match(r"^(.+?)\s+(\d+)([ab])$", ref)
    if not m:
        raise HTTPException(400, f"bad ref format: {ref!r}")
    tractate, daf, amud = m.group(1), int(m.group(2)), m.group(3)
    try:
        page_idx = daf_amud_to_page(tractate, daf, amud)
        png = render_page(tractate, page_idx, zoom=1.8)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(404, str(e))
    except IndexError as e:
        raise HTTPException(400, str(e))
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600",
                             "X-Pdf-Page": str(page_idx)})


@app.get("/api/index")
def shas_index() -> dict:
    """Return the Shas structure: sederim, tractates, daf counts."""
    from gemara.shas import TRACTATES_BY_SEDER
    sederim: list[dict] = []
    for seder, tractates in TRACTATES_BY_SEDER.items():
        sederim.append({
            "seder": seder,
            "tractates": [
                {
                    "name": name,
                    "hebrew": hebrew,
                    "last_daf": last_daf,
                    "last_amud": last_amud,
                    "meforshim": meforshim_for_tractate(name),
                }
                for name, hebrew, last_daf, last_amud in tractates
            ],
        })
    return {"sederim": sederim}


@app.get("/api/daf")
def get_daf(ref: str) -> Sugya:
    """Fetch a whole daf by Sefaria ref, e.g. ref='Bava Batra 33b'."""
    if ref not in _DAF_CACHE:
        _DAF_CACHE[ref] = fetch_daf(ref, commentators=_meforshim_for(ref))
    return _DAF_CACHE[ref]


def _lookup_ref(ref: str) -> dict | None:
    """Return the hebrew text + kind for any ref we've cached (daf or nested)."""
    for daf in _DAF_CACHE.values():
        if ref == daf.base_ref:
            return {"kind": "daf", "text": daf.full_hebrew()}
        for seg in daf.segments:
            if ref == seg.ref:
                return {
                    "kind": "gemara",
                    "text": seg.hebrew,
                    "english": seg.english,
                    "daf_ref": daf.base_ref,
                    "seg_index": seg.index,
                }
            for c in seg.commentaries:
                if ref == c.ref:
                    return {
                        "kind": "commentary",
                        "commentator": c.commentator,
                        "text": c.hebrew,
                        "daf_ref": daf.base_ref,
                        "seg_index": seg.index,
                        "on_segment_hebrew": seg.hebrew,
                        "on_segment_english": seg.english,
                    }
    return None


@app.get("/api/explain")
def explain(ref: str, request: Request) -> StreamingResponse:
    """Stream an explanation for any ref (gemara segment or mefaresh dibur).

    API key may be supplied via X-Anthropic-Key header (from the browser UI)
    or via ANTHROPIC_API_KEY env var.
    """
    item = _lookup_ref(ref)
    if item is None:
        raise HTTPException(404, f"ref not found in loaded dafs: {ref!r}. Load the daf first.")

    user_key = request.headers.get("X-Anthropic-Key")

    def event_gen():
        from gemara.agents.explainer import explain_stream
        from gemara.llm import LLMClient
        try:
            llm = LLMClient(api_key=user_key)
        except RuntimeError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
            return
        try:
            for chunk in explain_stream(llm, item):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/understand/{key}")
def understand(key: str) -> Understanding:
    """Run the Comprehension agent on a sugya. Cached per key."""
    if key in _UNDERSTANDING_CACHE:
        return _UNDERSTANDING_CACHE[key]
    if key not in PRESETS:
        raise HTTPException(404, f"unknown preset: {key}")
    sugya = get_sugya(key)
    # Import here so server starts even without ANTHROPIC_API_KEY set.
    from gemara.agents.comprehension import ComprehensionAgent
    from gemara.llm import LLMClient
    try:
        agent = ComprehensionAgent(LLMClient())
        understanding = agent.understand(sugya)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"comprehension failed: {e}")
    _UNDERSTANDING_CACHE[key] = understanding
    return understanding


@app.get("/api/understand/{key}")
def get_understanding(key: str) -> Understanding | dict:
    """Return cached understanding, or an empty flag if not yet computed."""
    if key in _UNDERSTANDING_CACHE:
        return _UNDERSTANDING_CACHE[key]
    return {"cached": False}


# Serve the static frontend.
_STATIC_DIR = Path(__file__).parent.parent / "static"


@app.get("/")
def index() -> FileResponse:
    return FileResponse(_STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


def main() -> None:
    import uvicorn
    uvicorn.run("gemara.web:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
