/**
 * Utility functions for month handling in the monthly schedule system
 */

/**
 * Format a Date object to month ID string (YYYY-MM)
 */
export function formatMonthId(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Parse a month ID string (YYYY-MM) to Date object (first day of month)
 */
export function parseMonthId(monthId: string): Date {
    const [year, month] = monthId.split('-').map(Number);
    return new Date(year, month - 1, 1);
}

/**
 * Get month name in Spanish from month ID
 */
export function getMonthName(monthId: string): string {
    const date = parseMonthId(monthId);
    return date.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

/**
 * Get array of month IDs in range (inclusive)
 */
export function getMonthsInRange(startMonth: string, endMonth: string): string[] {
    const months: string[] = [];
    const start = parseMonthId(startMonth);
    const end = parseMonthId(endMonth);

    const current = new Date(start);
    while (current <= end) {
        months.push(formatMonthId(current));
        current.setMonth(current.getMonth() + 1);
    }

    return months;
}

/**
 * Check if month ID is the current month
 */
export function isCurrentMonth(monthId: string): boolean {
    const now = new Date();
    return formatMonthId(now) === monthId;
}

/**
 * Get next month ID
 */
export function getNextMonth(monthId: string): string {
    const date = parseMonthId(monthId);
    date.setMonth(date.getMonth() + 1);
    return formatMonthId(date);
}

/**
 * Get previous month ID
 */
export function getPreviousMonth(monthId: string): string {
    const date = parseMonthId(monthId);
    date.setMonth(date.getMonth() - 1);
    return formatMonthId(date);
}

/**
 * Get short month name (Jan, Feb, etc.)
 */
export function getShortMonthName(monthId: string): string {
    const date = parseMonthId(monthId);
    return date.toLocaleDateString('es-PE', { month: 'short' });
}

/**
 * Compare two month IDs
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareMonths(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}
