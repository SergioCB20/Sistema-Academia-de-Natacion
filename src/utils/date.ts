export const dateUtils = {
    /**
     * Returns a Date object extended to the start of the week (Monday)
     * respecting the local timezone.
     */
    getStartOfWeek: (date: Date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const newDate = new Date(d);
        newDate.setDate(diff);
        newDate.setHours(0, 0, 0, 0);
        return newDate;
    },

    /**
     * Returns a string in YYYY-MM-DD format respecting the local timezone.
     * Prevents UTC shifts from changing the day.
     */
    toISODateString: (date: Date) => {
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    },

    /**
     * Returns a string like "2025-01-20" from a Date object, consistent with toISODateString.
     * Useful for IDs.
     */
    formatDateId: (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};
