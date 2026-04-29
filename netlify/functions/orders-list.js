// === Orders List — leest orders uit JSONBin ===

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
};

exports.handler = async () => {
    try {
        const binId = process.env.JSONBIN_BIN_ID;
        const accessKey = process.env.JSONBIN_ACCESS_KEY;
        if (!binId || !accessKey) throw new Error('JSONBIN env vars niet ingesteld');

        const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: { 'X-Access-Key': accessKey }
        });
        const data = await res.json();
        const orders = Array.isArray(data.record)
            ? data.record.filter(o => o && !o.init)
            : [];

        return { statusCode: 200, headers, body: JSON.stringify(orders) };
    } catch (err) {
        console.error('orders-list fout:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
