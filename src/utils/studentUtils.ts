import type { Student } from '../types/db';

export const calculateRealRemaining = (student: Student): number => {
    if (!student.packageStartDate || !student.fixedSchedule || student.fixedSchedule.length === 0) {
        return Math.max(0, student.remainingCredits || 0);
    }

    try {
        // Note: Use string parsing to avoid UTC shifts
        const [y, m, d] = student.packageStartDate.split('-').map(Number);
        const startDate = new Date(y, m - 1, d, 0, 0, 0); // Local start
        const now = new Date();

        if (now < startDate) return Math.max(0, student.remainingCredits || 0);

        let elapsed = 0;
        const dayMap: Record<string, number> = { 'DOM': 0, 'LUN': 1, 'MAR': 2, 'MIE': 3, 'JUE': 4, 'VIE': 5, 'SAB': 6 };

        const tempDate = new Date(startDate);
        // Limit loop to avoid infinite loops in weird cases (max 365 days lookahead)
        const MAX_DAYS = 365;
        let safety = 0;

        while (tempDate <= now && safety < MAX_DAYS) {
            // If this day matches schedule
            const currentDayIndex = tempDate.getDay();
            const dayCode = Object.keys(dayMap).find(key => dayMap[key] === currentDayIndex);

            if (dayCode) {
                // Check if student has class this day
                const isClassDay = student.fixedSchedule.some(s => s.dayId === dayCode);

                if (isClassDay) {
                    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const tempMidnight = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate());

                    // If it's strictly in the past (yesterday or before), count it
                    if (tempMidnight < todayMidnight) {
                        elapsed++;
                    } else if (tempMidnight.getTime() === todayMidnight.getTime()) {
                        // If it's TODAY, check time
                        // Find the relevant time slots
                        const slots = student.fixedSchedule.filter(s => s.dayId === dayCode);
                        let slotPassed = false;

                        // If multiple slots per day, 1 credit per slot (usually)
                        slots.forEach(slot => {
                            // Time format "HH:MM-HH:MM"
                            const [, endStr] = slot.timeId.split('-');
                            const [h, min] = endStr.split(':').map(Number);
                            const classEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0);

                            if (now > classEndTime) {
                                slotPassed = true; // At least one slot passed
                            }
                        });

                        if (slotPassed) elapsed++;
                    }
                }
            }

            tempDate.setDate(tempDate.getDate() + 1);
            safety++;
        }

        const final = (student.remainingCredits || 0) - elapsed;
        return Math.max(0, final);
    } catch (e) {
        console.error("Error calculating remaining classes", e);
        return Math.max(0, student.remainingCredits || 0);
    }
};
