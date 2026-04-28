/**
 * server-local.js — Johnny Cashew lokale test server
 *
 * Laadt .env, serveert statische bestanden, en draait Netlify Functions lokaal.
 * Start met: node server-local.js
 * Open dan:  http://localhost:8888/tools/leverancier-order-tool.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8888;
const ROOT = __dirname;

// ── Laad .env ──────────────────────────────────────────────────────────────────
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val; // don't override existing
    }
    console.log('✅ .env geladen');
} else {
    console.warn('⚠️  Geen .env bestand gevonden — functions draaien zonder credentials');
}

// ── MIME types ─────────────────────────────────────────────────────────────────
const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

// ── Netlify Function runner ───────────────────────────────────────────────────
async function runFunction(funcName, req) {
    const funcPath = path.join(ROOT, 'netlify', 'functions', funcName + '.js');
    if (!fs.existsSync(funcPath)) return { statusCode: 404, body: JSON.stringify({ error: `Function '${funcName}' not found` }) };

    // Read raw body
    const rawBody = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });

    // Build minimal Netlify event object
    const parsedUrl = url.parse(req.url, true);
    const event = {
        httpMethod: req.method,
        headers: req.headers,
        queryStringParameters: parsedUrl.query,
        body: rawBody,
        isBase64Encoded: false,
    };

    try {
        // Clear require cache so edits are picked up on restart
        delete require.cache[require.resolve(funcPath)];
        const func = require(funcPath);
        const handler = func.handler || func.default?.handler;
        if (!handler) return { statusCode: 500, body: JSON.stringify({ error: 'No handler exported' }) };
        return await handler(event, {});
    } catch (err) {
        console.error(`❌ Function ${funcName} fout:`, err.message);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url);
    let reqPath = parsedUrl.pathname;

    // CORS headers voor alle responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── Netlify Functions: /.netlify/functions/<name> ──────────────────────────
    const funcMatch = reqPath.match(/^\/.netlify\/functions\/([^/?]+)/);
    if (funcMatch) {
        const funcName = funcMatch[1];
        console.log(`⚡ Function call: ${funcName} [${req.method}]`);
        const result = await runFunction(funcName, req);
        res.writeHead(result.statusCode || 200, {
            'Content-Type': 'application/json',
            ...(result.headers || {}),
        });
        res.end(result.body || '');
        return;
    }

    // ── Static files ───────────────────────────────────────────────────────────
    if (reqPath === '/') reqPath = '/tools/leverancier-order-tool.html';
    let filePath = path.join(ROOT, reqPath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    // Try exact path, then with .html extension
    let fileToServe = null;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fileToServe = filePath;
    } else if (fs.existsSync(filePath + '.html')) {
        fileToServe = filePath + '.html';
    }

    if (!fileToServe) {
        console.log(`404: ${reqPath}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Niet gevonden: ${reqPath}`);
        return;
    }

    const ext = path.extname(fileToServe);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(fileToServe).pipe(res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║  🥜 Johnny Cashew — Lokale Test Server           ║');
    console.log('  ║                                                  ║');
    console.log(`  ║  Server:    http://localhost:${PORT}               ║`);
    console.log('  ║  Dashboard: http://localhost:8888/tools/         ║');
    console.log('  ║             leverancier-order-tool.html          ║');
    console.log('  ║                                                  ║');
    console.log('  ║  Ctrl+C om te stoppen                            ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Exact divisie : ${process.env.EXACT_DIVISION || '(niet ingesteld)'}`);
    console.log(`  Exact Client  : ${process.env.EXACT_CLIENT_ID ? process.env.EXACT_CLIENT_ID.slice(0,8) + '...' : '(niet ingesteld)'}`);
    console.log(`  Redirect URI  : ${process.env.EXACT_REDIRECT_URI || '(niet ingesteld)'}`);
    console.log('');
});
