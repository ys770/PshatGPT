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
    "Access-Control-Allow-Headers": "content-type, x-anthropic-key, x-client-id",
    "Access-Control-Expose-Headers": "x-pshatgpt-remaining, x-pshatgpt-limit",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function checkAndIncrementRateLimit(env, ip, clientId) {
  const deviceCap = parseInt(env.DEVICE_DAILY || "10", 10);
  const ipCap = parseInt(env.FREE_TIER_DAILY || "25", 10);
  const day = todayKey();
  const devKey = clientId ? `dev:${clientId}:${day}` : null;
  const ipKey = `ip:${ip}:${day}`;

  // Read both counters in parallel.
  const [devCurRaw, ipCurRaw] = await Promise.all([
    devKey ? env.PSHATGPT.get(devKey) : Promise.resolve(null),
    env.PSHATGPT.get(ipKey),
  ]);
  const devUsed = parseInt(devCurRaw || "0", 10);
  const ipUsed = parseInt(ipCurRaw || "0", 10);

  if (devKey && devUsed >= deviceCap) {
    return { allowed: false, reason: "device", remaining: 0, limit: deviceCap };
  }
  if (ipUsed >= ipCap) {
    return { allowed: false, reason: "ip", remaining: 0, limit: ipCap };
  }

  // Increment both.
  const ttl = 172800;
  await Promise.all([
    devKey ? env.PSHATGPT.put(devKey, String(devUsed + 1), { expirationTtl: ttl }) : Promise.resolve(),
    env.PSHATGPT.put(ipKey, String(ipUsed + 1), { expirationTtl: ttl }),
  ]);

  const devRemaining = devKey ? deviceCap - devUsed - 1 : Infinity;
  const ipRemaining = ipCap - ipUsed - 1;
  const remaining = Math.min(devRemaining, ipRemaining);
  const limit = devKey ? deviceCap : ipCap;
  return { allowed: true, remaining, limit };
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

    // Rate limit: per-device (via UUID from browser) AND per-IP (safety net)
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const clientId = request.headers.get("x-client-id") || null;
    // Log each invocation so you can see IPs + device UUIDs in the
    // Cloudflare dashboard → Workers → Logs tab.
    console.log(JSON.stringify({
      event: "request",
      ip,
      clientId: clientId ? clientId.slice(0, 8) + "..." : null,
      origin: origin || null,
      ua: (request.headers.get("user-agent") || "").slice(0, 80),
    }));
    const rl = await checkAndIncrementRateLimit(env, ip, clientId);
    if (!rl.allowed) {
      const msg = rl.reason === "ip"
        ? `Your network has hit its daily free-tier limit (${rl.limit}). Add your own Anthropic API key in Settings for unlimited explanations.`
        : `Daily free-tier limit reached (${rl.limit}). Add your own Anthropic API key in Settings for unlimited explanations.`;
      return new Response(
        JSON.stringify({ error: "rate_limit", reason: rl.reason, message: msg, limit: rl.limit }),
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
    // 4096 cap allows deep-Tosafot analysis mode. Normal explanations
    // still request 2048 and won't use the extra headroom.
    body.max_tokens = Math.min(body.max_tokens || 2048, 4096);
    body.stream = true;

    // Log the conversation for owner review (owner's API key, owner's logs).
    try {
      const userMsgs = (body.messages || []).filter(m => m.role === "user");
      const lastUserMsg = userMsgs[userMsgs.length - 1];
      const lastContent = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
      const refMatch = userMsgs[0]?.content?.match?.(/clicked on[^\n]*?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s\d+[ab](?::\d+)*)/i);
      console.log(JSON.stringify({
        event: "prompt",
        turn: userMsgs.length,
        ref: refMatch ? refMatch[1] : null,
        clientId: clientId ? clientId.slice(0, 8) + "..." : null,
        userMessage: lastContent.slice(0, 600),
      }));
    } catch (e) { /* logging best-effort */ }

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
