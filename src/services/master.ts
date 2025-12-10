import { doc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { DayCatalog, HourCatalog, ScheduleRule } from '../types/db';

// --- CONFIGURACIÓN MAESTRA (Hardcoded for simplicity in Phase 1) ---

export const DAYS: DayCatalog[] = [
    { id: 'LUN', name: 'Lunes', order: 1 },
    { id: 'MAR', name: 'Martes', order: 2 },
    { id: 'MIE', name: 'Miércoles', order: 3 },
    { id: 'JUE', name: 'Jueves', order: 4 },
    { id: 'VIE', name: 'Viernes', order: 5 },
    { id: 'SAB', name: 'Sábado', order: 6 },
    { id: 'DOM', name: 'Domingo', order: 7 },
];

export const HOURS: HourCatalog[] = [
    { id: '06-07', label: '06:00 - 07:00', defaultCapacity: 12 },
    { id: '07-08', label: '07:00 - 08:00', defaultCapacity: 12 },
    { id: '08-09', label: '08:00 - 09:00', defaultCapacity: 12 },
    { id: '09-10', label: '09:00 - 10:00', defaultCapacity: 12 },
    { id: '16-17', label: '16:00 - 17:00', defaultCapacity: 12 },
    { id: '17-18', label: '17:00 - 18:00', defaultCapacity: 12 },
    { id: '18-19', label: '18:00 - 19:00', defaultCapacity: 12 },
    { id: '19-20', label: '19:00 - 20:00', defaultCapacity: 12 },
    { id: '20-21', label: '20:00 - 21:00', defaultCapacity: 12 },
];

// Rules: Which hours are active on which days
export const SCHEDULE_RULES: ScheduleRule[] = [
    // Morning Block (Mon-Sat)
    { id: 'AM_ALL', timeId: '06-07', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'], capacity: 12 },
    { id: 'AM_ALL', timeId: '07-08', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'], capacity: 12 },
    { id: 'AM_ALL', timeId: '08-09', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'], capacity: 12 },
    { id: 'AM_ALL', timeId: '09-10', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'], capacity: 12 }, // No Sat 9-10

    // Afternoon Block (Mon-Fri)
    { id: 'PM_ALL', timeId: '16-17', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'], capacity: 12 },
    { id: 'PM_ALL', timeId: '17-18', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'], capacity: 12 },
    { id: 'PM_ALL', timeId: '18-19', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'], capacity: 12 },
    { id: 'PM_ALL', timeId: '19-20', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'], capacity: 12 },
    { id: 'PM_ALL', timeId: '20-21', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'], capacity: 12 },
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
            const dateStr = current.toISOString().split('T')[0];

            // Find rules active for this day
            for (const hour of HOURS) {
                const rule = SCHEDULE_RULES.find(r =>
                    r.timeId === hour.id && r.dayIds.includes(dayId)
                );

                if (rule) {
                    const slotId = `${dateStr}_${hour.id}`;
                    const slotRef = doc(db, 'daily_slots', slotId);

                    // Find students that have this slot in their fixedSchedule
                    // fixedSchedule is [{dayId: 'LUN', timeId: '06-07'}, ...]
                    const attendees = students
                        .filter(s => s.fixedSchedule?.some((fs: any) => fs.dayId === dayId && fs.timeId === hour.id))
                        .map(s => s.id); // Assuming ID matches what we want to store

                    batch.set(slotRef, {
                        id: slotId,
                        date: dateStr,
                        timeId: hour.id,
                        capacity: rule.capacity,
                        attendeeIds: attendees, // Pre-fill
                        locks: [] // Reset locks
                    }, { merge: true }); // Merge true keeps other fields if they existed, but we are overwriting main ones.
                    // Important: If we re-generate, we might overwrite 'attendees'. 
                    // ideally 'generate' is for NEW slots. If slots exist, maybe we shouldn't overwrite?
                    // For now, this tool is "Debug/Seed", so overwriting is expected behavior to "Reset" or "Fix".

                    operations++;
                }
            }
        }

        if (operations > 0) {
            await batch.commit();
            console.log(`Generated ${operations} slots with pre-filled students.`);
        }
    }
};
