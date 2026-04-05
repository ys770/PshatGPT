// PshatGPT proxy — Cloudflare Worker
//
// Proxies streaming requests from the browser to Anthropic's API, using a
// server-side API key. Rate-limits per IP via KV. Only allows requests to
// /v1/messages with minimal validation.
//
// Env bindings (configure in wrangler.toml + secrets):
//   ANTHROPIC_API_KEY   — secret, the owner's Anthropic key
//   PSHATGPT            — KV namespace binding (stores per-IP daily counters)
//   ALLOWED_ORIGINS     — comma-separated list of allowed origins (optional)
//   FREE_TIER_DAILY     — per-IP daily request cap (default 10)

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "*")
    .split(",").map(s => s.trim()).filter(Boolean);
  const allow = allowed.includes("*") || !origin
    ? "*"
    : (allowed.includes(origin) ? origin : allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-anthropic-key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function checkAndIncrementRateLimit(env, ip) {
  const cap = parseInt(env.FREE_TIER_DAILY || "10", 10);
  const key = `rl:${ip}:${todayKey()}`;
  const cur = parseInt((await env.PSHATGPT.get(key)) || "0", 10);
  if (cur >= cap) return { allowed: false, remaining: 0, limit: cap };
  await env.PSHATGPT.put(key, String(cur + 1), { expirationTtl: 172800 });
  return { allowed: true, remaining: cap - cur - 1, limit: cap };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(
        JSON.stringify({ ok: true, service: "pshatgpt-proxy" }),
        { headers: { ...cors, "content-type": "application/json" } }
      );
    }

    if (url.pathname !== "/v1/messages" || request.method !== "POST") {
      return new Response("not found", { status: 404, headers: cors });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "proxy not configured: missing ANTHROPIC_API_KEY" }),
        { status: 500, headers: { ...cors, "content-type": "application/json" } }
      );
    }

    // Rate limit by IP
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = await checkAndIncrementRateLimit(env, ip);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: "rate_limit",
          message: `Free-tier daily limit reached (${rl.limit}). Add your own Anthropic API key in Settings for unlimited explanations.`,
          limit: rl.limit,
        }),
        { status: 429, headers: { ...cors, "content-type": "application/json" } }
      );
    }

    // Parse + constrain request body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("bad json", { status: 400, headers: cors });
    }

    const ALLOWED_MODELS = [
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-sonnet-4-5-20250929",
    ];
    if (!ALLOWED_MODELS.includes(body.model)) {
      body.model = "claude-sonnet-4-5";
    }
    body.max_tokens = Math.min(body.max_tokens || 2048, 2048);
    body.stream = true;

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-pshatgpt-remaining": String(rl.remaining),
        "x-pshatgpt-limit": String(rl.limit),
      },
    });
  },
};
