// Supabase Edge Function: funda-scraper
// Proxies Serper.dev en ScrapingBee calls zodat API keys nooit de browser bereiken.

const SCRAPINGBEE_API_KEY = Deno.env.get('SCRAPINGBEE_API_KEY')!;
const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY')!;

const ALLOWED_ORIGINS = ['https://verbouwscan.com', 'https://www.verbouwscan.com'];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

function extractNuxtProjectId(html: string): string | null {
  try {
    const scriptMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return null;

    const json = JSON.parse(scriptMatch[1]);
    if (!Array.isArray(json)) return null;

    const findKey = (obj: unknown): string | number | null => {
      if (!obj || typeof obj !== 'object') return null;
      const o = obj as Record<string, unknown>;
      if (o.projectId) return o.projectId as string | number;
      for (const key in o) {
        const result = findKey(o[key]);
        if (result) return result;
      }
      return null;
    };

    const foundPointer = findKey(json);
    if (foundPointer) {
      if (typeof foundPointer === 'string' && /^\d{7,10}$/.test(foundPointer)) {
        return foundPointer;
      }
      if (typeof foundPointer === 'number' && (json as unknown[])[foundPointer]) {
        const resolvedValue = (json as unknown[])[foundPointer];
        if (typeof resolvedValue === 'string' && /^\d{7,10}$/.test(resolvedValue)) {
          return resolvedValue;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchViaScrapingBee(url: string, renderJs = false, premiumProxy = false): Promise<string | null> {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: renderJs ? 'true' : 'false',
    premium_proxy: premiumProxy ? 'true' : 'false',
    country_code: 'nl',
    wait_for: 'body',
  });
  try {
    const res = await fetch(`https://app.scrapingbee.com/api/v1?${params.toString()}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Actie: findUrl ────────────────────────────────────────────────────────────

async function findFundaUrl(
  zipcode: string,
  houseNumber: string,
  logs: string[],
): Promise<{ found: boolean; url?: string; title?: string; message: string }> {
  const rawZip = zipcode.replace(/\s+/g, '').toUpperCase();
  const formattedZip = rawZip.replace(/^(\d{4})([A-Z]{2})$/, '$1 $2');
  const cleanNumber = houseNumber.trim();
  // Alle varianten: "13-b", "13 b" → "13-b" (URL) en "13b" (genormaliseerd)
  const urlFriendlyNumber = cleanNumber.replace(/\s+/g, '-').toLowerCase();
  const normalizedNumber = urlFriendlyNumber.replace(/-([a-z])/gi, '$1'); // "13-b" → "13b"

  const query = `site:funda.nl ${formattedZip} ${cleanNumber}`;
  logs.push(`🔎 Serper.dev doorzoeken voor: "${query}"...`);

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'nl', hl: 'nl' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { found: false, message: `❌ SERPER FOUT: ${response.status} ${errorText}` };
    }

    const result = await response.json() as { organic?: Array<{ link: string; title?: string }> };

    if (!result.organic || result.organic.length === 0) {
      logs.push('⚠️ Geen resultaten gevonden via Serper.dev.');
      return { found: false, message: 'Geen online woningpagina gevonden.' };
    }

    logs.push(`📋 Serper.dev gaf ${result.organic.length} resultaat/resultaten terug.`);

    const strictFundaRegex = /funda\.nl\/(?:en\/|fy\/)?detail\/(?:koop|huur|koophuur)\/[^\/]+\/[^\/]+\/\d+/i;
    const looseFundaRegex = /funda\.nl\/(?:en\/|fy\/)?detail\/(?:koop|huur|koophuur)\//i;
    // Check beide URL-vormen: "-13-b/" én "-13b/"
    const urlNumberRegex = new RegExp(`-${urlFriendlyNumber}(?:-|\\/)`, 'i');
    const urlNumberRegexAlt = normalizedNumber !== urlFriendlyNumber
      ? new RegExp(`-${normalizedNumber}(?:-|\\/)`, 'i') : null;
    // Titel: "13-b" of "13 b" of "13b"
    const titleNumberRegex = new RegExp(
      `\\b${cleanNumber.replace(/[-\s]+([a-z])/gi, '[-\\s]?$1')}\\b`, 'i'
    );

    const exactMatch = result.organic.find((item) => {
      const link = item.link;
      const linkLower = link.toLowerCase();
      const title = (item.title || '').toLowerCase();

      logs.push(`🔗 Controleren: ${link}`);

      const strictOk = strictFundaRegex.test(link);
      const looseOk = looseFundaRegex.test(link);
      if (!strictOk && !looseOk) {
        logs.push('  ↳ ❌ Geen Funda koop/huur URL-structuur herkend.');
        return false;
      }

      if (linkLower.includes('verkocht')) {
        logs.push('  ↳ ❌ URL bevat \'verkocht\' — overgeslagen.');
        return false;
      }

      const matchInUrl = urlNumberRegex.test(linkLower) || (urlNumberRegexAlt?.test(linkLower) ?? false);
      const matchInTitle = titleNumberRegex.test(title);

      let looseMatch = false;
      if (!matchInUrl && /[a-z]/i.test(cleanNumber)) {
        // Normaliseer "13-b" → "13b" zodat de parts-regex altijd werkt
        const parts = normalizedNumber.match(/(\d+)([a-z]+)/i);
        if (parts) {
          const looseRegex1 = new RegExp(`-${parts[1]}-${parts[2]}(?:-|\\/)`, 'i'); // -13-b/
          const looseRegex2 = new RegExp(`-${parts[1]}${parts[2]}(?:-|\\/)`, 'i');  // -13b/
          looseMatch = looseRegex1.test(linkLower) || looseRegex2.test(linkLower);
        }
      }

      if (!matchInUrl && !matchInTitle && !looseMatch) {
        logs.push(`  ↳ ❌ Huisnummer "${cleanNumber}" niet gevonden in URL of titel.`);
        return false;
      }

      logs.push(`  ↳ ✅ Match! (URL-match: ${matchInUrl}, Titel-match: ${matchInTitle}, Loose: ${looseMatch})`);
      return true;
    });

    if (exactMatch) {
      logs.push(`✅ Exacte match gevonden: ${exactMatch.link}`);
      return {
        found: true,
        url: exactMatch.link.replace(/\/(en|fy)\/detail/, '/detail'),
        title: exactMatch.title,
        message: '✅ Gevonden!',
      };
    }

    logs.push(`❌ Geen geldig resultaat voor "${cleanNumber}".`);
    return { found: false, message: 'Geen geldige koopwoning URL gevonden.' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { found: false, message: `⚠️ Fout bij zoeken: ${msg}` };
  }
}

// ── Actie: identify ───────────────────────────────────────────────────────────

async function identifyFundaListing(url: string, logs: string[]) {
  let targetUrl = url.split('?')[0].replace(/\/$/, '');
  if (!targetUrl.endsWith('/overzicht')) {
    targetUrl = targetUrl.replace(/\/kenmerken$/, '').replace(/\/media.*$/, '');
    targetUrl += '/overzicht';
  }

  logs.push(`📡 Verbinding maken met Funda via proxy: ${targetUrl}`);

  const htmlContent = await fetchViaScrapingBee(targetUrl, true, true);
  if (!htmlContent) {
    throw new Error('Funda onbereikbaar via proxy.');
  }

  logs.push(`📄 Pagina-inhoud ontvangen (${(htmlContent.length / 1024).toFixed(1)} KB)`);

  let projectId: string | null = null;
  let description = '';
  const photoIds = new Set<string>();

  const metadata = { address: '', zipcode: '', city: '', price: '', energyLabel: '', yearBuilt: '', houseType: '' };

  const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) {
    const cleanTitle = titleMatch[1].replace(/Huis te koop: |Appartement te koop: /i, '').split('|')[0].trim();
    const zipMatch = cleanTitle.match(/(\d{4}\s?[A-Z]{2})/);
    if (zipMatch) {
      metadata.zipcode = zipMatch[1];
      const parts = cleanTitle.split(zipMatch[0]);
      if (parts.length >= 2) {
        metadata.address = parts[0].trim();
        metadata.city = parts[1].trim();
      }
    } else {
      metadata.address = cleanTitle;
    }
  }

  const priceMatch = htmlContent.match(/€\s?([\d.]+)\s?k\.k\./i) ||
    htmlContent.match(/class="object-header__price">([\s\S]*?)<\/strong>/i);
  if (priceMatch) {
    metadata.price = `€ ${priceMatch[1].replace(/€|k\.k\.|v\.o\.n\./g, '').trim()}`;
  }

  const labelMatch = htmlContent.match(/Energielabel\s+([A-G][\+]*)/i) ||
    htmlContent.match(/class="energy-label [^"]*">\s*([A-G][\+]*)/i);
  if (labelMatch) metadata.energyLabel = labelMatch[1];

  const yearMatch = htmlContent.match(/Bouwjaar\s*<\/dt>\s*<dd[^>]*>\s*(\d{4})/i) ||
    htmlContent.match(/Bouwjaar.*?(\d{4})/);
  if (yearMatch) metadata.yearBuilt = yearMatch[1];

  logs.push(`🏠 Metadata gevonden: ${metadata.address || 'Onbekend'}, ${metadata.city || ''}`);

  logs.push('🔍 Zoeken naar ProjectID...');
  projectId = extractNuxtProjectId(htmlContent);
  if (!projectId) {
    const embedMatch = htmlContent.match(/embed\.html\?.*?projectId=(\d{7,10})/);
    if (embedMatch) projectId = embedMatch[1];
  }
  if (!projectId) {
    const patterns = [/"projectId"\s*:\s*"?(\d{7,10})"?/i, /"floorplanId"\s*:\s*"?(\d{7,10})"?/i];
    for (const p of patterns) {
      const match = htmlContent.match(p);
      if (match) { projectId = match[1]; break; }
    }
  }

  for (const m of htmlContent.matchAll(/cloud\.funda\.nl\/valentina_media\/(\d+\/\d+\/\d+)/g)) {
    photoIds.add(m[1]);
  }

  const descMatch = htmlContent.match(/<div[^>]*class="[^"]*object-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    htmlContent.match(/<h2[^>]*>Omschrijving<\/h2>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    description = descMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000);
  }

  return { projectId, photoIds: Array.from(photoIds), description, htmlContent, metadata };
}

// ── Actie: fmlDownload ────────────────────────────────────────────────────────

async function downloadFml(projectId: string, logs: string[]): Promise<string | null> {
  const endpoints = [
    `https://fmlpub.s3.eu-west-1.amazonaws.com/${projectId}.fml`,
    `https://cloud.funda.nl/fml/${projectId}.fml`,
  ];

  for (const url of endpoints) {
    logs.push(`🌐 Direct proberen: ${url}`);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        if (text.trim().startsWith('{') || text.trim().startsWith('<')) return text;
      }
    } catch { /* probeer volgende */ }

    logs.push('⚠️ Direct mislukt, proxy inzetten...');
    const text = await fetchViaScrapingBee(url, false, false);
    if (text && (text.trim().startsWith('{') || text.trim().startsWith('<'))) return text;
  }
  return null;
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  const logs: string[] = [];

  try {
    const { action, payload } = await req.json();
    let result: unknown;

    if (action === 'findUrl') {
      result = await findFundaUrl(payload.zipcode, payload.houseNumber, logs);
    } else if (action === 'identify') {
      result = await identifyFundaListing(payload.url, logs);
    } else if (action === 'fmlDownload') {
      result = await downloadFml(payload.projectId, logs);
    } else {
      return new Response(JSON.stringify({ error: `Onbekende actie: ${action}` }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ result, logs }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('funda-scraper error:', err);
    // Altijd 200 teruggeven zodat de client de logs kan verwerken voor debuggen
    return new Response(JSON.stringify({ error: String(err), logs }), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
