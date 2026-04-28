import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY');
const CALLMEBOT_PHONE = Deno.env.get('CALLMEBOT_PHONE') ?? '';
const CALLMEBOT_API_KEY = Deno.env.get('CALLMEBOT_API_KEY');
const NOTIFY_EMAIL    = Deno.env.get('NOTIFY_EMAIL') ?? 'info@verbouwscan.com';

const ALLOWED_ORIGINS = ['https://verbouwscan.com', 'https://www.verbouwscan.com'];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const log: string[] = [];
  const errors: string[] = [];

  try {
    const body = await req.json();
    const { formData, houseMetadata, totalCost, fundaUrl, rawFml, projectId, reportHtml } = body;
    log.push('✅ Body parsed');

    // ── 1. DB opslaan ──────────────────────────────────────────────────────
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { error: dbError } = await supabase.from('quote_requests').insert({
        project_id:   projectId  || null,
        name:         formData.name,
        email:        formData.email,
        phone:        formData.phone,
        message:      formData.message,
        timeline:     formData.timeline,
        funda_url:    fundaUrl   || null,
        total_cost:   totalCost,
        address:      houseMetadata?.address    || null,
        city:         houseMetadata?.city       || null,
        asking_price: houseMetadata?.askingPrice || null,
        energy_label: houseMetadata?.energyLabel || null,
        year_built:   houseMetadata?.yearBuilt  || null,
      });
      if (dbError) { errors.push(`DB: ${dbError.message}`); }
      else         { log.push('✅ DB opgeslagen'); }
    } catch (e) {
      errors.push(`DB exception: ${e}`);
    }

    // ── 2. E-mail naar eigenaar ────────────────────────────────────────────
    if (!RESEND_API_KEY) {
      errors.push('Resend: RESEND_API_KEY secret niet ingesteld');
    } else {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'VerbouwScan <onboarding@resend.dev>',
            to:   NOTIFY_EMAIL,
            subject: `🏠 Nieuwe offerte aanvraag: ${houseMetadata?.address || 'Onbekend adres'}`,
            html: buildOwnerEmail(formData, houseMetadata, totalCost, fundaUrl),
            attachments: [
              ...(reportHtml ? [{
                filename: `renovatie-rapport-${(houseMetadata?.address || 'project').replace(/[^a-z0-9]/gi, '-')}.html`,
                content:  btoa(unescape(encodeURIComponent(reportHtml))),
              }] : []),
              ...(rawFml ? [{
                filename: `plattegrond-${(houseMetadata?.address || 'project').replace(/[^a-z0-9]/gi, '-')}.fml`,
                content:  btoa(unescape(encodeURIComponent(rawFml))),
              }] : []),
            ],
          }),
        });
        if (res.ok) {
          log.push('✅ E-mail verstuurd naar eigenaar');
        } else {
          const txt = await res.text();
          errors.push(`Resend eigenaar: ${res.status} – ${txt}`);
        }
      } catch (e) {
        errors.push(`Resend eigenaar exception: ${e}`);
      }

      // ── 3. Bevestigingsmail naar klant ──────────────────────────────────
      try {
        const res2 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'VerbouwScan <onboarding@resend.dev>',
            to:   formData.email,
            subject: `Je offerteaanvraag is ontvangen – ${houseMetadata?.address || 'VerbouwScan'}`,
            html: buildCustomerEmail(formData, houseMetadata, totalCost),
          }),
        });
        if (res2.ok) {
          log.push('✅ Bevestigingsmail verstuurd naar klant');
        } else {
          const txt2 = await res2.text();
          errors.push(`Resend klant: ${res2.status} – ${txt2}`);
        }
      } catch (e) {
        errors.push(`Resend klant exception: ${e}`);
      }
    }

    // ── 4. WhatsApp via CallMeBot ──────────────────────────────────────────
    if (!CALLMEBOT_API_KEY) {
      errors.push('WhatsApp: CALLMEBOT_API_KEY secret niet ingesteld');
    } else {
      try {
        const waMessage = encodeURIComponent(
          `🏠 Nieuwe offerte aanvraag!\n` +
          `Adres: ${houseMetadata?.address || 'Onbekend'}, ${houseMetadata?.city || ''}\n` +
          `Naam: ${formData.name}\n` +
          `Tel: ${formData.phone || '–'}\n` +
          `Raming: €${Math.round(totalCost).toLocaleString('nl-NL')}\n` +
          (fundaUrl ? `Funda: ${fundaUrl}` : '')
        );
        const waRes = await fetch(
          `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${waMessage}&apikey=${CALLMEBOT_API_KEY}`
        );
        log.push(`✅ WhatsApp ping (status ${waRes.status})`);
      } catch (e) {
        errors.push(`WhatsApp exception: ${e}`);
      }
    }

    // ── Resultaat terugsturen ──────────────────────────────────────────────
    console.log('Log:', log.join(' | '));
    if (errors.length) console.error('Errors:', errors.join(' | '));

    return new Response(JSON.stringify({ success: errors.length === 0, log, errors }), {
      status: errors.length > 0 && log.length === 1 ? 500 : 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Fatal:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

// ─── Email templates ──────────────────────────────────────────────────────────

function buildOwnerEmail(formData: any, meta: any, totalCost: number, fundaUrl?: string): string {
  const cost = `€ ${Math.round(totalCost).toLocaleString('nl-NL')}`;
  const now  = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body  { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f1f5f9; margin:0; padding:24px; }
  .wrap { background:#fff; border-radius:20px; padding:36px; max-width:580px; margin:0 auto; box-shadow:0 4px 24px rgba(0,0,0,.06); }
  h1    { margin:0 0 4px; font-size:22px; color:#0f172a; }
  .badge{ display:inline-block; background:#dcfce7; color:#15803d; font-size:10px; font-weight:800; padding:3px 10px; border-radius:99px; letter-spacing:1px; text-transform:uppercase; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; margin:20px 0; }
  td    { padding:10px 0; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  .lbl  { color:#94a3b8; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; width:40%; }
  .val  { color:#1e293b; font-size:13px; font-weight:600; }
  .cost { color:#16a34a; font-size:22px; font-weight:900; }
  .sec  { font-size:10px; font-weight:900; color:#cbd5e1; text-transform:uppercase; letter-spacing:1px; margin:24px 0 8px; }
  .msg  { background:#f8fafc; border-radius:10px; padding:14px; color:#374151; font-size:13px; line-height:1.6; }
  a     { color:#2563eb; }
  .foot { color:#cbd5e1; font-size:11px; margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9; }
</style></head>
<body><div class="wrap">
  <div class="badge">Nieuwe aanvraag</div>
  <h1>Offerte aanvraag ontvangen</h1>
  <p class="sec">📍 Project</p>
  <table>
    <tr><td class="lbl">Adres</td><td class="val">${meta?.address || '–'}${meta?.city ? ', ' + meta.city : ''}</td></tr>
    <tr><td class="lbl">Vraagprijs</td><td class="val">${meta?.askingPrice || '–'}</td></tr>
    <tr><td class="lbl">Bouwjaar</td><td class="val">${meta?.yearBuilt || '–'}</td></tr>
    <tr><td class="lbl">Energielabel</td><td class="val">${meta?.energyLabel || '–'}</td></tr>
    <tr><td class="lbl">Renovatieraming</td><td class="val cost">${cost}</td></tr>
    ${fundaUrl ? `<tr><td class="lbl">Funda</td><td class="val"><a href="${fundaUrl}">${fundaUrl}</a></td></tr>` : ''}
  </table>
  <p class="sec">👤 Aanvrager</p>
  <table>
    <tr><td class="lbl">Naam</td><td class="val">${formData.name}</td></tr>
    <tr><td class="lbl">E-mail</td><td class="val"><a href="mailto:${formData.email}">${formData.email}</a></td></tr>
    <tr><td class="lbl">Telefoon</td><td class="val">${formData.phone || '–'}</td></tr>
    <tr><td class="lbl">Tijdlijn</td><td class="val">${formData.timeline || 'Snel mogelijk'}</td></tr>
  </table>
  ${formData.message ? `<p class="sec">💬 Toelichting</p><div class="msg">${formData.message}</div>` : ''}
  <div class="foot">FML plattegrond als bijlage &nbsp;·&nbsp; Ontvangen: ${now}</div>
</div></body></html>`;
}

function buildCustomerEmail(formData: any, meta: any, totalCost: number): string {
  const cost = `€ ${Math.round(totalCost).toLocaleString('nl-NL')}`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body  { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f1f5f9; margin:0; padding:24px; }
  .wrap { background:#fff; border-radius:20px; padding:36px; max-width:540px; margin:0 auto; box-shadow:0 4px 24px rgba(0,0,0,.06); }
  h1    { margin:0 0 8px; font-size:22px; color:#0f172a; }
  p     { color:#475569; font-size:14px; line-height:1.7; }
  .card { background:#f8fafc; border-radius:14px; padding:20px 24px; margin:20px 0; }
  .lbl  { color:#94a3b8; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
  .val  { color:#1e293b; font-size:15px; font-weight:700; margin-top:2px; }
  .cost { color:#16a34a; font-size:24px; font-weight:900; }
  .foot { color:#cbd5e1; font-size:11px; margin-top:24px; }
</style></head>
<body><div class="wrap">
  <h1>Bedankt, ${formData.name.split(' ')[0]}!</h1>
  <p>We hebben je offerteaanvraag goed ontvangen. We gaan je zo snel mogelijk in contact brengen met een passende aannemer.</p>
  <div class="card">
    <div class="lbl">Project adres</div>
    <div class="val">${meta?.address || '–'}${meta?.city ? ', ' + meta.city : ''}</div>
    <div style="margin-top:14px" class="lbl">Renovatieraming</div>
    <div class="cost">${cost}</div>
  </div>
  <div class="foot">VerbouwScan – Slim renoveren begint hier</div>
</div></body></html>`;
}
