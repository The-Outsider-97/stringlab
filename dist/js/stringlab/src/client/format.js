/** Number and text formatting for the panels. */
export function num(value, digits = 5) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            return String(value);
        if (value === 0)
            return '0';
        const a = Math.abs(value);
        return a >= 1e5 || a < 1e-3 ? value.toExponential(Math.max(0, digits - 1)) : String(Number(value.toPrecision(digits)));
    }
    return value === null || value === undefined ? '—' : String(value);
}
export const titleCase = (text) => text.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
/** Name of the quantity that tells how well the solution satisfies its constraints, whichever model produced the frame. */
export function constraintOf(d) {
    for (const key of ['level_matching_residual', 'constraint_tautau_rms', 'relative_energy_drift']) {
        const v = d[key];
        if (typeof v === 'number' && Number.isFinite(v))
            return { key, value: v };
    }
    return null;
}
export const CONSTRAINT_LABEL = {
    level_matching_residual: 'Level-matching residual', constraint_tautau_rms: 'Virasoro constraint RMS', relative_energy_drift: 'Relative energy drift',
};
export function numericKeys(frames) {
    const first = frames[0]?.diagnostics ?? {};
    return Object.keys(first).filter((k) => frames.every((f) => typeof f.diagnostics[k] === 'number')).sort();
}
export function csvCell(x) { return `"${String(x ?? '').replaceAll('"', '""')}"`; }
//# sourceMappingURL=format.js.map