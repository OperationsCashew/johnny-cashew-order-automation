// === Inbound Email Webhook — CloudMailin → Claude parse → JSON opslag ===
//
// Flow:
//   CloudMailin stuurt POST naar deze functie als mail binnenkomt op
//   5991e233c2b461c71df0@cloudmailin.net
//
// Vereiste Netlify env vars:
//   CLOUDMAILIN_SECRET   — HMAC secret uit CloudMailin dashboard
//   ANTHROPIC_API_KEY    — Claude Sonnet API key

const crypto = require('crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateHMAC(payload, signature, secret) {
    if (!secret) return true; // Skip during local dev if secret not set
    if (!signature) return false;
    const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expBuffer);
}

function generateOrderId(messageId) {
    // Create short readable ID from message-id hash
    const hash = crypto.createHash('md5').update(messageId || Date.now().toString()).digest('hex');
    return hash.substring(0, 8).toUpperCase();
}

// ── Claude parse prompt ───────────────────────────────────────────────────────
function buildPrompt(emailFrom, emailSubject, emailBody) {
    return `Je bent een order-verwerkingsassistent voor Johnny Cashew Nederland.

Analyseer de onderstaande e-mail en extraheer de orderinformatie als JSON.

E-mail afzender: ${emailFrom}
E-mail onderwerp: ${emailSubject}
E-mail inhoud:
---
${emailBody}
---

Geef ALLEEN een geldig JSON-object terug met deze structuur (geen uitleg, geen markdown):
{
  "customer": {
    "company": "bedrijfsnaam of volledige naam",
    "contact": "contactpersoon naam",
    "email": "email adres",
    "phone": "telefoonnummer of null",
    "address": "volledig afleveradres op 1 regel of null"
  },
  "lines": [
    {
      "code": "artikelcode (exact zoals in de email, geen nullen toevoegen)",
      "description": "artikelomschrijving",
      "quantity": 1
    }
  ],
  "deliveryDate": "YYYY-MM-DD of null",
  "orderReference": "order referentie van klant of null",
  "confidence": 0.95,
  "notes": "eventuele opmerkingen of onduidelijkheden"
}

Regels:
- confidence is een getal van 0 tot 1: hoe zeker je bent dat de order correct is
- Als een artikelcode onduidelijk is, gebruik dan je beste inschatting en verlaag confidence
- Als er geen duidelijke artikelcodes zijn maar wel productnamen, vul dan description in en zet code op null
- Als het GEEN order is (spam, vraag, etc.), geef dan confidence: 0 en lines: []`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // ── 1. HMAC validatie ─────────────────────────────────────────────────────
    const signature = event.headers['x-cloudmailin-signature'] || event.headers['signature'];
    const secret = process.env.CLOUDMAILIN_SECRET;

    if (secret && !validateHMAC(event.body, signature, secret)) {
        console.error('HMAC validatie mislukt — onbekende afzender geweigerd');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
    }

    // ── 2. Email parsen ───────────────────────────────────────────────────────
    let mail;
    try {
        mail = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const messageId = mail.headers?.['message-id'] || mail.envelope?.from || Date.now().toString();
    const emailFrom = mail.envelope?.from || mail.headers?.from || 'onbekend';
    const emailSubject = mail.headers?.subject || '(geen onderwerp)';
    const emailBody = mail.plain || mail.body?.plain || mail.html || '(leeg)';
    const orderId = generateOrderId(messageId);
    const timestamp = new Date().toISOString();

    console.log(`📧 Mail ontvangen van ${emailFrom} | Subject: "${emailSubject}" | Order ID: ${orderId}`);
    console.log(`📄 Email body (eerste 300 tekens): ${emailBody.substring(0, 300)}`);

    // ── 3. Dedupe check op Message-ID ─────────────────────────────────────────
    // (Netlify Blobs / file storage is niet beschikbaar in Functions,
    //  we loggen de Message-ID en vertrouwen op downstream dedupe)
    const dedupKey = crypto.createHash('md5').update(messageId).digest('hex');

    // ── 4. Claude Sonnet parse ────────────────────────────────────────────────
    let parsedOrder;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
        console.warn('ANTHROPIC_API_KEY niet ingesteld — gebruik fallback lege order');
        parsedOrder = {
            customer: { company: emailFrom, contact: null, email: emailFrom, phone: null, address: null },
            lines: [],
            deliveryDate: null,
            orderReference: null,
            confidence: 0,
            notes: 'ANTHROPIC_API_KEY niet geconfigureerd — handmatige review vereist',
        };
    } else {
        try {
            const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-5',
                    max_tokens: 1024,
                    messages: [{
                        role: 'user',
                        content: buildPrompt(emailFrom, emailSubject, emailBody),
                    }],
                }),
            });

            const claudeData = await claudeRes.json();
            console.log(`🤖 Claude raw response: ${JSON.stringify(claudeData).substring(0, 500)}`);
            const rawText = claudeData.content?.[0]?.text || '{}';

            // Strip markdown code blocks if present
            const jsonText = rawText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
            parsedOrder = JSON.parse(jsonText);

            console.log(`✅ Claude parse geslaagd | Confidence: ${parsedOrder.confidence} | Regels: ${parsedOrder.lines?.length || 0}`);
        } catch (err) {
            console.error('Claude parse mislukt:', err.message);
            parsedOrder = {
                customer: { company: emailFrom, contact: null, email: emailFrom, phone: null, address: null },
                lines: [],
                deliveryDate: null,
                orderReference: null,
                confidence: 0,
                notes: `Parse fout: ${err.message} — handmatige review vereist`,
            };
        }
    }

    // ── 5. Order opslaan als JSON in tools/inbox/ ─────────────────────────────
    // Netlify Functions kunnen niet direct naar het bestandssysteem schrijven.
    // We gebruiken de Netlify Blobs API als die beschikbaar is, anders loggen
    // we de volledige order JSON zodat het uit de logs gehaald kan worden.
    // De dashboard tab leest later uit deze opslag.

    const orderRecord = {
        id: orderId,
        dedupKey,
        timestamp,
        status: parsedOrder.confidence >= 0.9 ? 'nieuw' : 'review',
        source: 'email',
        email: {
            from: emailFrom,
            subject: emailSubject,
            messageId,
            receivedAt: timestamp,
        },
        parsed: parsedOrder,
        exactAccountId: null,      // ingevuld na klant-matching
        exactOrderId: null,        // ingevuld na boeking in Exact
        bookedAt: null,
    };

    // Sla op via JSONBin
    try {
        const binId = process.env.JSONBIN_BIN_ID;
        const accessKey = process.env.JSONBIN_ACCESS_KEY;
        if (!binId || !accessKey) throw new Error('JSONBIN_BIN_ID of JSONBIN_ACCESS_KEY niet ingesteld');

        // Haal huidige orders op
        const getRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: { 'X-Master-Key': accessKey }
        });
        const getData = await getRes.json();
        const current = Array.isArray(getData.record) ? getData.record.filter(o => o && !o.init) : [];

        // Voeg nieuwe order toe
        current.unshift(orderRecord);

        // Sla op
        await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: { 'X-Master-Key': accessKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(current)
        });
        console.log(`💾 Order opgeslagen in JSONBin: ${orderId}`);
    } catch (err) {
        console.log('📋 ORDER_JSON_FALLBACK:', JSON.stringify(orderRecord));
        console.warn('JSONBin opslag mislukt:', err.message);
    }

    // ── 6. Antwoord aan CloudMailin ───────────────────────────────────────────
    // 200 = verwerkt, niet opnieuw proberen
    // 422 = verwerking mislukt, CloudMailin stuurt NIET opnieuw
    // 5xx = tijdelijke fout, CloudMailin probeert het opnieuw
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            ok: true,
            orderId,
            confidence: parsedOrder.confidence,
            status: orderRecord.status,
            lines: parsedOrder.lines?.length || 0,
        }),
    };
};
