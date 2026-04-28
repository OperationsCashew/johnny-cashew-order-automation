// === Shared utility functions ===

export function parseODataDate(val) {
    if (!val || typeof val !== 'string') return null;
    const m = val.match(/\/Date\((-?\d+)\)\//);
    if (m) {
        const d = new Date(parseInt(m[1]));
        return d.toISOString().slice(0, 10);
    }
    if (val.includes('T') || val.length === 10) return val.slice(0, 10);
    return null;
}

export function formatDate(d) {
    if (!d) return '-';
    const parts = d.split('-');
    return parts[2] + '-' + parts[1] + '-' + parts[0];
}

export function formatNumber(n) {
    if (n === null || n === undefined) return '-';
    return n.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

export function cffFmt(val) {
    if (val == null || isNaN(val)) return '\u2014';
    const neg = val < 0;
    const abs = Math.abs(Math.round(val));
    return (neg ? '-' : '') + '\u20ac ' + abs.toLocaleString('nl-NL');
}
