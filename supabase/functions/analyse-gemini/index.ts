// Supabase Edge Function: analyse-gemini
// Proxies all Gemini AI calls so the API key never reaches the browser.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const ALLOWED_ORIGINS = ['https://verbouwscan.com', 'https://www.verbouwscan.com'];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// ── Schema (plain strings, geen TypeScript enum nodig in Deno) ───────────────

const RENOVATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    roomName: {
      type: 'STRING',
      description:
        "De EXACTE naam van de kamer uit de meegeleverde lijst. Gebruik 'ONBEKEND' als het geen interieurfoto is of als de kamer niet te herleiden is.",
    },
    imageType: {
      type: 'STRING',
      description:
        'Classificatie van de afbeelding. Wees extra kritisch op artist impressions.',
      enum: ['INTERIEUR', 'EXTERIEUR', 'PLATTEGROND', 'ARTIST IMPRESSION', 'ONDUIDELIJK'],
    },
    qualityDescription: {
      type: 'STRING',
      description: "Bouwkundige staat in max 15 woorden (bijv. 'Gedateerd, behang laat los').",
    },
    actions: {
      type: 'OBJECT',
      description:
        'Renovatiebehoefte. Bij ARTIST IMPRESSION, PLATTEGROND of EXTERIEUR: alles op false/BEHOUDEN/NVT.',
      properties: {
        paintCeiling: { type: 'BOOLEAN' },
        paintWalls: { type: 'BOOLEAN' },
        plasterWalls: { type: 'BOOLEAN' },
        plasterCeiling: { type: 'BOOLEAN' },
        floorAction: { type: 'STRING', enum: ['NIEUW', 'RENOVEREN', 'BEHOUDEN', 'ONBEKEND'] },
        toiletAction: { type: 'STRING', enum: ['NIEUW', 'BEHOUDEN', 'NVT'] },
        bathroomAction: { type: 'STRING', enum: ['NIEUW', 'BEHOUDEN', 'NVT'] },
        kitchenAction: { type: 'STRING', enum: ['NIEUW', 'BEHOUDEN', 'NVT'] },
      },
      required: [
        'paintCeiling', 'paintWalls', 'plasterWalls', 'plasterCeiling',
        'floorAction', 'toiletAction', 'bathroomAction', 'kitchenAction',
      ],
    },
    confidence: {
      type: 'STRING',
      description: 'Zekerheid over de classificatie.',
      enum: ['HIGH', 'MEDIUM', 'LOW'],
    },
  },
  required: ['roomName', 'imageType', 'qualityDescription', 'actions', 'confidence'],
};

// ── Gemini REST helper ────────────────────────────────────────────────────────

async function callGemini(body: object): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

function getMimeType(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);base64,/);
  return m ? m[1] : 'image/jpeg';
}

function cleanBase64(data: string): string {
  return data.includes(',') ? data.split(',')[1].trim() : data.trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function addSource(data: unknown[], source: string) {
  return data.map(item => ({ ...(item as object), source }));
}

// ── Analyse functies ─────────────────────────────────────────────────────────

async function analyzeFundaText(description: string, roomNames: string[]): Promise<unknown[]> {
  if (!description || description.length < 50) return [];

  const prompt = `
    Rol: Senior Bouwkundig Calculator & Vastgoedexpert.
    Taak: Analyseer de omschrijving van een woning en leid de renovatiebehoefte af per kamer.

    Kamernamen (gebruik EXACT deze): [${roomNames.join(', ')}].

    RICHTLIJNEN VOOR INTERPRETATIE:
    1. Herken 'Verhulde' Gebreken:
       - Termen als 'eenvoudig', 'oorspronkelijk', 'met zorg bewoond' of 'gedateerd' duiden op een volledige renovatie-behoefte (stucwerk, schilderen, vloeren, sanitair).
    2. Herken 'Klus-status':
       - 'Casco', 'renovatieobject', 'naar eigen smaak te moderniseren' betekent: alles op true/NIEUW zetten.
    3. Herken 'Moderne staat':
       - 'Luxe', 'hoogwaardig', 'instapklaar', 'recent vernieuwd' betekent: alles op false/BEHOUDEN zetten.
    4. Contextueel Begrip:
       - Als er staat "begane grond is v.v. glad stucwerk", geldt dit voor alle kamers op die verdieping (Woonkamer, Gang, Keuken).

    Analyseer de onderstaande tekst kritisch en vertaal de 'geest' van de tekst naar concrete acties in het JSON-schema:

    Tekst: """${description}"""
  `;

  const text = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: RENOVATION_SCHEMA },
    },
  });

  try {
    return addSource(JSON.parse(text || '[]'), 'funda');
  } catch {
    return [];
  }
}

async function analyzeRoomPhotos(base64Images: string[], roomNames: string[]): Promise<unknown[]> {
  const imageBatches = chunkArray(base64Images, 10);

  const processBatch = async (batchImages: string[]): Promise<unknown[]> => {
    const imageParts = batchImages.map(img => ({
      inlineData: { mimeType: getMimeType(img), data: cleanBase64(img) },
    }));

    const promptText = `
      Rol: Woninginspecteur voor renovatie-app.
      Taak: Analyseer deze afbeeldingen en genereer voor ELKE foto een JSON object.

      BELANGRIJK: Genereer EXACT ${batchImages.length} JSON-objecten in de array.
      Sla geen foto's over. Elke foto moet een eigen object hebben in de volgorde van de input.
      Gebruik alleen Nederlands.

      HIERARCHIE VAN ANALYSE:
      1. CLASSIFICATIE: Is het een echte interieurfoto?
         - Zo nee (buiten, plattegrond of door computer gegenereerde artist impression/render), zet imageType op de juiste waarde en roomName op 'ONEBEKEND'.
         - Bij 'ARTIST IMPRESSION', 'PLATTEGROND' of 'EXTERIEUR': Zet ALLE actions op false/BEHOUDEN/NVT. Genereer GEEN renovatiekosten.

      2. INTERIEUR MATCH: Indien 'INTERIEUR', koppel aan de lijst: [${roomNames.join(', ')}].

      3. INSPECTIE (Alleen bij INTERIEUR) - wees kritisch:
         - Check plafonds/wanden op scheuren, oneffenheden, stucwerk, kalk/behang -> plaster=true
         - Check plafonds/wanden op verkleuring, of niet modern behang/kleur, plaster=true -> paint=true.
         - Check vloer op slijtage, vlekken of gedateerd materiaal -> floorAction='NIEUW'.
         - Check keuken/badkamer/toilet: Oud sanitair / verouderde apparatuur / witte tegels / van voor 2010 -> 'NIEUW'.
         - Let op: Badkamer/Toilet vloerAction is ALTIJD 'BEHOUDEN' (is deel van sanitairpost).

      Retourneer exact ${batchImages.length} objecten in de array, in dezelfde volgorde als de foto's.
    `;

    const text = await callGemini({
      contents: [{ parts: [...imageParts, { text: promptText }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: RENOVATION_SCHEMA },
      },
    });

    try {
      return JSON.parse(text || '[]');
    } catch {
      return Array(batchImages.length).fill({
        roomName: 'ONBEKEND',
        imageType: 'ONDUIDELIJK',
        qualityDescription: 'Fout bij verwerken',
        actions: {
          paintCeiling: false, paintWalls: false, plasterWalls: false, plasterCeiling: false,
          floorAction: 'ONBEKEND', toiletAction: 'NVT', bathroomAction: 'NVT', kitchenAction: 'NVT',
        },
        confidence: 'LOW',
      });
    }
  };

  const batchResults = await Promise.all(imageBatches.map(batch => processBatch(batch)));
  return addSource(batchResults.flat(), 'photo');
}

async function estimateCustomItem(
  userInput: string,
  roomName: string,
  floorArea: number,
  wallArea: number,
  ceilingArea: number,
  perimeter: number,
  height: number,
  windowCount: number,
  doorCount: number,
  windowArea: number,
  doorArea: number,
  extWallArea: number,
  intWallArea: number,
  extWindowCount: number,
  extDoorCount: number,
  extWindowArea: number,
  extDoorArea: number,
  yearBuilt?: string,
  qualityDescription?: string,
): Promise<unknown> {
  const prompt = `
Rol: Senior Bouwkundig Calculator Nederland.
Taak: Geef een realistische kostenraming voor "${userInput}" in de ruimte "${roomName}".

=== DATA BRON (GEBRUIK EXACTE WAARDES VOOR QUANTITY) ===
Oppervlakken:
- Vloer: ${floorArea.toFixed(1)} m²
- Plafond: ${ceilingArea.toFixed(1)} m²
- Wandoppervlak Netto (totaal): ${wallArea.toFixed(1)} m²
Muur-specificatie (Thermische Schil):
- Gevelmuren (grenzend aan buitenlucht): ${extWallArea.toFixed(1)} m²
- Binnenwanden (tussenmuren/scheidingswanden): ${intWallArea.toFixed(1)} m²
Maatvoering:
- Omtrek (plint/randlengte): ${perimeter.toFixed(1)} m
- Hoogte (vloer tot plafond): ${height.toFixed(2)} m
Openingen:
- Ramen (Totaal): ${windowCount} stuks (${windowArea.toFixed(1)} m²)
- Ramen (In gevel/extern): ${extWindowCount} stuks (${extWindowArea.toFixed(1)} m²)
- Deuren (Totaal): ${doorCount} stuks (${doorArea.toFixed(1)} m²)
- Deuren (In gevel/extern): ${extDoorCount} stuks (${extDoorArea.toFixed(1)} m²)
Context:
- Bouwjaar: ${yearBuilt || 'onbekend'}
- Kwaliteitsniveau: ${qualityDescription || 'onbekend'}

=== STAP 1: RUIMTELIJKE ANALYSE & MAPPING (STRIKT) ===
Analyseer de taak en koppel deze aan de logische variabele:
1. Verticale vlakken (behang, stuc, saus, wandtegel, voorzetwand): Gebruik 'wallArea'.
2. Horizontale vlakken beneden (vloer, egaliseren, parket, tapijt): Gebruik 'floorArea'.
3. Horizontale vlakken boven (plafondafwerking, spuitwerk, rachels): Gebruik 'ceilingArea'.
4. Lijnen/Randen (plinten, kitwerk, randafwerking): Gebruik 'perimeter'.
5. Gevelopeningen (kozijnen schilderen, glas vervangen): Gebruik 'windowCount' of 'doorCount'.
6. Gevelspecifiek (isolatie gevelmuur, buitenstuc): Gebruik 'extWallArea'.

=== STAP 2: ARBEID (DYNAMISCH UURTARIEF) ===
1. TARIEFBEPALING: Bepaal op basis van je interne database het actuele Nederlandse uurtarief (incl. btw) voor de benodigde vakman.
   - Voorbeeld: Sloper (€45-55), Schilder/Behanger (€50-65), Stucadoor/Timmerman (€55-75), Installateur/Elektricien (€65-90).
2. TIJDSINDICATIE:
   - [BASIC] (Sauswerk, behang, plinten, licht sloopwerk): 0,15-0,25 uur per eenheid.
   - [SKILLED] (Stucwerk, vloeren leggen, elektra, kozijnen): 0,5-1,0 uur per eenheid.
   - [SPECIALIST] (Asbest, open haard, sauna, constructie): 2,0-8,0+ uur per eenheid/project.
3. TOESLAGEN: Plafondwerk +40% op arbeidstijd | Buitenwerk (extern) +25% op arbeidstijd.

=== STAP 3: MATERIAAL-LOGICA (INFERENTIE) ===
Bepaal materiaalkosten op basis van de aard van de werkzaamheid:
- VERWERKING (vloeibaar/rol/stuc/verf): Materiaal = ca. 30% van het arbeidsbedrag.
- INSTALLATIE (Vast object zoals sauna, haard, radiator, toilet): Schat zelfstandig de gemiddelde marktwaarde van het object (middenklasse) en tel dit op bij de arbeid.
- SLOOP: Materiaal = €0. Voeg afvoerkosten toe (€75-€250 afhankelijk van volume).

=== REGELS VOOR HET JSON ANTWOORD ===
1. EENHEID: Kies 'm2', 'm', 'stuks' of 'lumpsum'.
2. QUANTITY: Gebruik exact de waarde van de gekozen variabele uit de bron.
3. COSTESTIMATE: (Totaal berekende uren * Gekozen uurtarief) + Materiaalkosten.
4. LABEL: Professionele naam (max 5 woorden, Nederlands).
5. UNITLABEL: Schrijf de exacte berekeningsmaat inclusief hoeveelheid. Formaat: "[quantity] [eenheid] [korte omschrijving]". Voorbeelden: "48.2 m² wandoppervlak netto", "4 kozijnen", "29.5 m² vloer", "6.3 m perimeter", "lumpsum project". Gebruik ALTIJD de concrete getalswaarde, nooit alleen een categorie-naam.
6. NOTE: Max 15 woorden. Toon opbouw: "Gerekend met €[Tarief]/u. [X]u arbeid + €[Y] materiaal/object."
7. CONSISTENTIE: Hanteer exact hetzelfde uurtarief voor identieke vakspecialisten door het hele huis.
  `;

  const schema = {
    type: 'OBJECT',
    properties: {
      label:        { type: 'STRING' },
      costEstimate: { type: 'NUMBER' },
      unit:         { type: 'STRING', enum: ['lumpsum', 'm2', 'stuks', 'm'] },
      quantity:     { type: 'NUMBER' },
      unitLabel:    { type: 'STRING', description: "Exacte hoeveelheid + eenheid + omschrijving, bijv. '48.2 m² wandoppervlak netto', '4 kozijnen', '29.5 m² vloer', '6.3 m perimeter'. Gebruik ALTIJD een concreet getal." },
      confidence:   { type: 'STRING', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      note:         { type: 'STRING' },
    },
    required: ['label', 'costEstimate', 'unit', 'quantity', 'unitLabel', 'confidence'],
  };

  const text = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  });

  try {
    return JSON.parse(text || '{}');
  } catch {
    return { label: userInput, costEstimate: 0, unit: 'lumpsum', quantity: 1, unitLabel: 'lumpsum', confidence: 'LOW', note: 'Fout bij verwerken' };
  }
}

async function synthesizeRoomStatus(descriptions: string[]): Promise<string> {
  if (descriptions.length === 0) return '';

  const prompt = `
    Taak: Vat deze bouwkundige observaties over deze ruimte samen in 1 professionele Nederlandse zin (max 25 woorden).
    Focus op de kern. Taal is Nederlands.

    Observaties: ${descriptions.join(' | ')}
  `;

  const text = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
  });
  return text.trim();
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const { action, payload } = await req.json();
    let result: unknown;

    if (action === 'fundaText') {
      result = await analyzeFundaText(payload.description, payload.roomNames);
    } else if (action === 'roomPhotos') {
      result = await analyzeRoomPhotos(payload.base64Images, payload.roomNames);
    } else if (action === 'synthesize') {
      result = await synthesizeRoomStatus(payload.descriptions);
    } else if (action === 'estimateCustomItem') {
      result = await estimateCustomItem(
        payload.userInput as string,
        payload.roomName as string,
        payload.floorArea as number,
        payload.wallArea as number,
        payload.ceilingArea as number,
        payload.perimeter as number,
        payload.height as number,
        payload.windowCount as number,
        payload.doorCount as number,
        payload.windowArea as number,
        payload.doorArea as number,
        payload.extWallArea as number,
        payload.intWallArea as number,
        payload.extWindowCount as number,
        payload.extDoorCount as number,
        payload.extWindowArea as number,
        payload.extDoorArea as number,
        payload.yearBuilt as string | undefined,
        payload.qualityDescription as string | undefined,
      );
    } else {
      return new Response(JSON.stringify({ error: `Onbekende actie: ${action}` }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ result }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('analyse-gemini error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
