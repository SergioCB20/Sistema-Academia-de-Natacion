import { doc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { dateUtils } from '../utils/date';
import type { DayCatalog, HourCatalog, ScheduleRule } from '../types/db';

// --- CONFIGURACIÓN MAESTRA (REAL DATA) ---

export const DAYS: DayCatalog[] = [
    { id: 'LUN', name: 'Lunes', order: 1 },
    { id: 'MAR', name: 'Martes', order: 2 },
    { id: 'MIE', name: 'Miércoles', order: 3 },
    { id: 'JUE', name: 'Jueves', order: 4 },
    { id: 'VIE', name: 'Viernes', order: 5 },
    { id: 'SAB', name: 'Sábado', order: 6 },
    { id: 'DOM', name: 'Domingo', order: 7 },
];

// Definition of Time Slots (Labels only)
export const HOURS: HourCatalog[] = [
    { id: '06-07', label: '06:00 - 07:00', defaultCapacity: 12 },
    { id: '07-08', label: '07:00 - 08:00', defaultCapacity: 12 },
    { id: '08-09', label: '08:00 - 09:00', defaultCapacity: 12 },
    { id: '09-10', label: '09:00 - 10:00', defaultCapacity: 12 },
    { id: '10-11', label: '10:00 - 11:00', defaultCapacity: 12 },
    { id: '11-12', label: '11:00 - 12:00', defaultCapacity: 12 },
    { id: '12-13', label: '12:00 - 13:00', defaultCapacity: 12 },
    { id: '13-14', label: '13:00 - 14:00', defaultCapacity: 12 },
    { id: '14-1430', label: '14:00 – 14:30', defaultCapacity: 0 }, // DESC
    { id: '14:30-15:30', label: '14:30 - 15:30', defaultCapacity: 12 },
    { id: '15:30-16:30', label: '15:30 - 16:30', defaultCapacity: 12 },
    { id: '16:30-17:30', label: '16:30 - 17:30', defaultCapacity: 12 },
    { id: '17:30-18:30', label: '17:30 - 18:30', defaultCapacity: 12 },
    { id: '18:30-19:30', label: '18:30 - 19:30', defaultCapacity: 12 },
    { id: '19:30-20:30', label: '19:30 - 20:30', defaultCapacity: 12 },
    { id: '20:30-21:30', label: '20:30 - 21:30', defaultCapacity: 12 },
];

/** Age Groups (Helpers) */
const AGES_ADULTS = Array.from({ length: 85 }, (_, i) => i + 16); // 16 to 100 (16+ años a mas)
const AGES_TEENS = [11, 12, 13, 14, 15];
const AGES_KIDS = [7, 8, 9, 10];
const AGES_PRESCHOOL = [4, 5, 6];
const AGES_AQUABEBE = [1, 2, 3]; // 1 to 3 years (Correction)

const WEEKDAYS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'];
const WEEKEND = ['SAB', 'DOM'];

// Rules: Mapping Time + Days -> Allowed Ages
export const SCHEDULE_RULES: ScheduleRule[] = [
    // 06:00 - 09:00 (Weekdays) -> ADULTS
    { id: 'WD_06', timeId: '06-07', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_ADULTS },
    { id: 'WD_07', timeId: '07-08', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_ADULTS },
    { id: 'WD_08', timeId: '08-09', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_ADULTS },

    // 06:00 - 08:00 (Weekend) -> ADULTS
    { id: 'WE_06', timeId: '06-07', dayIds: WEEKEND, capacity: 12, allowedAges: AGES_ADULTS },
    { id: 'WE_07', timeId: '07-08', dayIds: WEEKEND, capacity: 12, allowedAges: AGES_ADULTS },

    // 08:00 - 10:00 (Weekend) -> TEENS (11-15)
    { id: 'WE_08', timeId: '08-09', dayIds: WEEKEND, capacity: 12, allowedAges: AGES_TEENS },
    { id: 'WE_09', timeId: '09-10', dayIds: WEEKEND, capacity: 12, allowedAges: AGES_TEENS },

    // 09:00 - 10:00 (Weekdays) -> TEENS
    { id: 'WD_09', timeId: '09-10', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_TEENS },

    // 10:00 - 12:00 (All Days) -> KIDS (7-10)
    { id: 'ALL_10', timeId: '10-11', dayIds: [...WEEKDAYS, ...WEEKEND], capacity: 12, allowedAges: AGES_KIDS },
    { id: 'ALL_11', timeId: '11-12', dayIds: [...WEEKDAYS, ...WEEKEND], capacity: 12, allowedAges: AGES_KIDS },

    // 12:00 - 14:00 (All Days) -> PRESCHOOL (4-6)
    { id: 'ALL_12', timeId: '12-13', dayIds: [...WEEKDAYS, ...WEEKEND], capacity: 12, allowedAges: AGES_PRESCHOOL },
    { id: 'ALL_13', timeId: '13-14', dayIds: [...WEEKDAYS, ...WEEKEND], capacity: 12, allowedAges: AGES_PRESCHOOL },

    // 14:00 - 14:30 -> DESCANSO (Break) - No active rules or 0 capacity
    // We can either omit rules or add a placeholder rule.
    // Explicitly defining it helps rendering if we look for rules.
    { id: 'ALL_14', timeId: '14-1430', dayIds: [...WEEKDAYS, ...WEEKEND], capacity: 0, allowedAges: [] },

    // 14:30 - 15:30 -> Weekdays: PRESCHOOL, Weekend: AQUABEBE
    { id: 'WD_1430', timeId: '14:30-15:30', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_PRESCHOOL },
    { id: 'WE_1430', timeId: '14:30-15:30', dayIds: WEEKEND, capacity: 12, allowedAges: AGES_AQUABEBE },

    // 15:30 - 17:30 -> Weekdays: KIDS, Weekend: AQUABEBE
    { id: 'WD_1530', timeId: '15:30-16:30', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_KIDS },
    { id: 'WE_1530', timeId: '15:30-16:30', dayIds: WEEKEND, capacity: 12, allowedAges: AGES_AQUABEBE },

    { id: 'WD_1630', timeId: '16:30-17:30', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_KIDS },
    { id: 'WE_1630', timeId: '16:30-17:30', dayIds: WEEKEND, capacity: 12, allowedAges: AGES_AQUABEBE },

    // 17:30 - 19:30 (Weekdays) -> TEENS
    { id: 'WD_1730', timeId: '17:30-18:30', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_TEENS },
    { id: 'WD_1830', timeId: '18:30-19:30', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_TEENS },

    // 19:30 - 21:30 (Weekdays) -> ADULTS
    { id: 'WD_1930', timeId: '19:30-20:30', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_ADULTS },
    { id: 'WD_2030', timeId: '20:30-21:30', dayIds: WEEKDAYS, capacity: 12, allowedAges: AGES_ADULTS },
];

export const masterService = {
    /**
     * Seeds daily slots for a date range based on RULES.
     * ID Format: YYYY-MM-DD_TIMEID (e.g., 2025-01-20_06-07)
     */
    async generateSlots(startDate: Date, days: number): Promise<void> {
        // 1. Fetch all active students to pre-fill slots
        // We do this to ensure that when we generate a schedule, 
        // students with "Fixed Schedule" (Matrícula) are automatically added.
        const studentsRef = collection(db, 'students');
        const q = query(studentsRef, where('active', '==', true));
        const studentDocs = await getDocs(q);
        const students = studentDocs.docs.map(d => d.data() as any); // Use 'any' or import Student type to avoid circular dep if needed

        const batch = writeBatch(db);
        let operations = 0;

        for (let i = 0; i < days; i++) {
            const current = new Date(startDate);
            current.setDate(startDate.getDate() + i);

            // Get day ID (LUN, MAR...)
            const dayIndex = current.getDay(); // 0 = Sun, 1 = Mon
            const mapDay = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
            const dayId = mapDay[dayIndex];

            // Format YYYY-MM-DD
            const dateStr = dateUtils.formatDateId(current);

            // Check every hour to see if there is a rule for this day
            let slotsForDay = 0;
            for (const hour of HOURS) {
                const rule = SCHEDULE_RULES.find(r =>
                    r.timeId === hour.id && r.dayIds.includes(dayId)
                );

                if (rule && rule.capacity > 0) { // Should we generate break slots? Probably not or as locks.
                    // If capacity is 0, skipping generation to save DB space/noise.
                    const slotId = `${dateStr}_${hour.id}`;
                    const slotRef = doc(db, 'daily_slots', slotId);

                    // Find students that have this slot in their fixedSchedule
                    const attendees = students
                        .filter(s => s.fixedSchedule?.some((fs: any) => fs.dayId === dayId && fs.timeId === hour.id))
                        .map(s => s.id);

                    batch.set(slotRef, {
                        id: slotId,
                        date: dateStr, // "2025-12-08"
                        timeId: hour.id,
                        capacity: rule.capacity,
                        attendeeIds: attendees,
                        locks: []
                    }, { merge: true });

                    operations++;
                    slotsForDay++;
                }
            }
            console.log(`Day ${dateStr} (${dayId}): Generated ${slotsForDay} slots.`);
        }

        if (operations > 0) {
            await batch.commit();
            console.log(`Generated ${operations} slots with pre-filled students.`);
        }
    }
};
