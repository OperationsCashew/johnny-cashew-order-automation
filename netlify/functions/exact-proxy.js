// === Exact Online API Proxy ===
// Runs server-side on Netlify — keeps client_secret secure.
//
// Required environment variables (set in Netlify dashboard → Site settings → Environment variables):
//   EXACT_CLIENT_ID     — from Exact Online App Center
//   EXACT_CLIENT_SECRET — from Exact Online App Center
//   EXACT_DIVISION      — your administration/division number (visible in Exact Online URL)
//   EXACT_REDIRECT_URI  — e.g. https://your-site.netlify.app/tools/leverancier-order-tool.html

const EXACT_BASE = 'https://start.exactonline.nl';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { action } = body;

  // ── 1. OAuth: exchange authorization code for access token ──────────────────
  if (action === 'exchange_token') {
    const { code } = body;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.EXACT_REDIRECT_URI,
      client_id: process.env.EXACT_CLIENT_ID,
      client_secret: process.env.EXACT_CLIENT_SECRET,
    });
    const res = await fetch(`${EXACT_BASE}/api/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    return { statusCode: res.status, headers, body: JSON.stringify(data) };
  }

  // ── 2. OAuth: refresh access token ──────────────────────────────────────────
  if (action === 'refresh_token') {
    const { refresh_token } = body;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: process.env.EXACT_CLIENT_ID,
      client_secret: process.env.EXACT_CLIENT_SECRET,
    });
    const res = await fetch(`${EXACT_BASE}/api/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    return { statusCode: res.status, headers, body: JSON.stringify(data) };
  }

  // ── 3. API proxy: forward any Exact Online API call ─────────────────────────
  if (action === 'api') {
    const { method = 'GET', endpoint, payload, access_token } = body;
    const division = process.env.EXACT_DIVISION;
    const url = `${EXACT_BASE}/api/v1/${division}/${endpoint}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { statusCode: res.status, headers, body: JSON.stringify(data) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
};
