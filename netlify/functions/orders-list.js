// === Orders List — leest orders uit Netlify Blobs ===
// Wordt aangeroepen door de Orders Inbox tab in het dashboard.

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const { getStore } = await import('@netlify/blobs');
        const store = getStore('orders-inbox');

        // Haal alle keys op
        const { blobs } = await store.list();

        // Haal alle orders op
        const orders = await Promise.all(
            blobs.map(async ({ key }) => {
                try {
                    return await store.get(key, { type: 'json' });
                } catch {
                    return null;
                }
            })
        );

        // Filter nulls, sorteer op timestamp (nieuwste eerst)
        const sorted = orders
            .filter(Boolean)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return { statusCode: 200, headers, body: JSON.stringify(sorted) };

    } catch (err) {
        console.error('orders-list fout:', err.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
