import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    runTransaction,
    writeBatch,
    Timestamp,
    arrayUnion,
    increment
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loggingService } from './logging';
import { scheduleTemplateService } from './scheduleTemplateService';
import { studentService } from './students';
import { getMonthsInRange } from '../utils/monthUtils';
import type { MonthlySlot, MonthlyEnrollment, Student } from '../types/db';

const MONTHLY_SLOTS_COLLECTION = 'monthly_slots';
const STUDENTS_COLLECTION = 'students';

export const monthlyScheduleService = {
    /**
     * Get monthly slots for a specific season and month
     */
    async getBySeasonAndMonth(seasonId: string, month: string): Promise<MonthlySlot[]> {
        const q = query(
            collection(db, MONTHLY_SLOTS_COLLECTION),
            where('seasonId', '==', seasonId),
            where('month', '==', month)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
            enrolledStudents: (doc.data().enrolledStudents || []).map((enrollment: any) => ({
                ...enrollment,
                enrolledAt: enrollment.enrolledAt?.toDate() || new Date(),
                endsAt: enrollment.endsAt?.toDate() || new Date(),
                attendanceRecord: enrollment.attendanceRecord?.map((att: any) => ({
                    ...att,
                    markedAt: att.markedAt?.toDate()
                }))
            }))
        } as MonthlySlot));
    },

    /**
     * Get a specific monthly slot by ID
     */
    async getById(slotId: string): Promise<MonthlySlot | null> {
        const docRef = doc(db, MONTHLY_SLOTS_COLLECTION, slotId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return null;
        }

        const data = docSnap.data();
        return {
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            enrolledStudents: (data.enrolledStudents || []).map((enrollment: any) => ({
                ...enrollment,
                enrolledAt: enrollment.enrolledAt?.toDate() || new Date(),
                endsAt: enrollment.endsAt?.toDate() || new Date(),
                attendanceRecord: enrollment.attendanceRecord?.map((att: any) => ({
                    ...att,
                    markedAt: att.markedAt?.toDate()
                }))
            }))
        } as MonthlySlot;
    },

    /**
     * Enroll a student in a monthly slot
     */
    async enrollStudent(slotId: string, studentId: string): Promise<void> {
        const slotRef = doc(db, MONTHLY_SLOTS_COLLECTION, slotId);
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const studentDoc = await transaction.get(studentRef);

            if (!slotDoc.exists()) {
                throw new Error('Horario no encontrado.');
            }

            if (!studentDoc.exists()) {
                throw new Error('Alumno no encontrado.');
            }

            const slot = slotDoc.data() as MonthlySlot;
            const student = studentDoc.data() as Student;

            // Validations
            if (slot.isBreak) {
                throw new Error('No se puede inscribir en un horario de descanso.');
            }



            if (student.remainingCredits <= 0) {
                throw new Error('El alumno no tiene créditos disponibles.');
            }

            // Check if already enrolled
            const alreadyEnrolled = slot.enrolledStudents?.some(e => e.studentId === studentId);
            if (alreadyEnrolled) {
                throw new Error('El alumno ya está inscrito en este horario.');
            }

            // Check capacity (Smart Check)
            const requestedStartDate = student.packageStartDate ? new Date(student.packageStartDate) : new Date();

            const activeEnrollments = (slot.enrolledStudents || []).filter(e => {
                const endDate = e.endsAt instanceof Timestamp ? e.endsAt.toDate() : e.endsAt instanceof Date ? e.endsAt : new Date(e.endsAt as any);
                // Check if student is still active on our requested start date
                return endDate >= requestedStartDate;
            });

            if (activeEnrollments.length >= slot.capacity) {
                throw new Error(`El horario está lleno para la fecha seleccionada (${requestedStartDate.toLocaleDateString('es-PE')}).`);
            }

            // Calculate credits needed for this month
            // Based on dayType: lun-mier-vier = ~12 classes, mar-juev = ~8 classes, sab-dom = ~8 classes
            // For now, we'll just track that they're enrolled, credits deducted per class
            const creditsAllocated = 0; // We don't pre-deduct, we deduct per class

            // Create enrollment
            const enrollment: MonthlyEnrollment = {
                studentId,
                studentName: student.fullName,
                enrolledAt: requestedStartDate,
                endsAt: student.packageEndDate ? new Date(student.packageEndDate) : new Date(),
                creditsAllocated,
                attendanceRecord: []
            };

            // Update slot
            transaction.update(slotRef, {
                enrolledStudents: arrayUnion({
                    ...enrollment,
                    enrolledAt: Timestamp.fromDate(enrollment.enrolledAt),
                    endsAt: Timestamp.fromDate(enrollment.endsAt)
                }),
                updatedAt: Timestamp.now()
            });

            // Log
            await loggingService.addLog(
                `Alumno ${student.fullName} inscrito en horario ${slot.timeSlot} (${slot.month})`,
                'SUCCESS'
            );
        });
    },

    /**
     * Unenroll a student from a monthly slot
     */
    async unenrollStudent(slotId: string, studentId: string): Promise<void> {
        const slotRef = doc(db, MONTHLY_SLOTS_COLLECTION, slotId);

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);

            if (!slotDoc.exists()) {
                throw new Error('Horario no encontrado.');
            }

            const slot = slotDoc.data() as MonthlySlot;

            // Check if enrolled
            const enrollment = slot.enrolledStudents?.find(e => e.studentId === studentId);
            if (!enrollment) {
                throw new Error('El alumno no está inscrito en este horario.');
            }

            // Remove enrollment
            const updatedEnrollments = slot.enrolledStudents.filter(e => e.studentId !== studentId);

            transaction.update(slotRef, {
                enrolledStudents: updatedEnrollments.map(e => ({
                    ...e,
                    enrolledAt: Timestamp.fromDate(new Date(e.enrolledAt)),
                    endsAt: Timestamp.fromDate(new Date(e.endsAt)),
                    attendanceRecord: e.attendanceRecord?.map(att => ({
                        ...att,
                        markedAt: att.markedAt ? Timestamp.fromDate(new Date(att.markedAt)) : null
                    }))
                })),
                updatedAt: Timestamp.now()
            });

            // Log
            await loggingService.addLog(
                `Alumno ${enrollment.studentName} desinscrito de horario ${slot.timeSlot} (${slot.month})`,
                'INFO'
            );
        });
    },

    /**
     * Generate monthly slots from schedule templates for entire season
     */
    async generateMonthlySlots(seasonId: string, startMonth: string, endMonth: string): Promise<number> {
        const templates = await scheduleTemplateService.getBySeason(seasonId);

        if (templates.length === 0) {
            throw new Error('No hay plantillas de horario para esta temporada.');
        }

        const months = getMonthsInRange(startMonth, endMonth);
        const batch = writeBatch(db);
        let slotsCreated = 0;

        for (const month of months) {
            for (const template of templates) {
                const slotId = `${month}_${template.timeSlot}_${template.dayType}`;
                const slotRef = doc(db, MONTHLY_SLOTS_COLLECTION, slotId);

                // Check if slot already exists
                const existingSlot = await getDoc(slotRef);
                if (existingSlot.exists()) {
                    console.log(`Slot ${slotId} already exists, skipping...`);
                    continue;
                }

                const newSlot: Omit<MonthlySlot, 'id'> = {
                    seasonId,
                    month,
                    scheduleTemplateId: template.id,
                    dayType: template.dayType,
                    timeSlot: template.timeSlot,
                    categoryId: template.categoryId,
                    capacity: template.capacity,
                    enrolledStudents: [],
                    isBreak: template.isBreak,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                batch.set(slotRef, {
                    ...newSlot,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });

                slotsCreated++;
            }
        }

        if (slotsCreated > 0) {
            await batch.commit();
            await loggingService.addLog(
                `Generados ${slotsCreated} horarios mensuales para temporada ${seasonId}`,
                'SUCCESS'
            );
        }

        return slotsCreated;
    },

    /**
     * Get all enrollments for a student in a specific month
     */
    async getStudentEnrollments(studentId: string, month: string): Promise<MonthlySlot[]> {
        const q = query(
            collection(db, MONTHLY_SLOTS_COLLECTION),
            where('month', '==', month)
        );

        const snapshot = await getDocs(q);
        const slots = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
            enrolledStudents: (doc.data().enrolledStudents || []).map((enrollment: any) => ({
                ...enrollment,
                enrolledAt: enrollment.enrolledAt?.toDate() || new Date(),
                endsAt: enrollment.endsAt?.toDate() || new Date()
            }))
        } as MonthlySlot));

        // Filter slots where student is enrolled
        return slots.filter(slot =>
            slot.enrolledStudents?.some(e => e.studentId === studentId)
        );
    },

    /**
     * Mark attendance for a student on a specific date
     */
    async markAttendance(
        slotId: string,
        studentId: string,
        date: string,
        attended: boolean,
        markedBy?: string
    ): Promise<void> {
        const slotRef = doc(db, MONTHLY_SLOTS_COLLECTION, slotId);

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);

            if (!slotDoc.exists()) {
                throw new Error('Horario no encontrado.');
            }

            const slot = slotDoc.data() as MonthlySlot;
            const enrollmentIndex = slot.enrolledStudents?.findIndex(e => e.studentId === studentId);

            if (enrollmentIndex === -1 || enrollmentIndex === undefined) {
                throw new Error('El alumno no está inscrito en este horario.');
            }

            const enrollment = slot.enrolledStudents[enrollmentIndex];
            const attendanceRecord = enrollment.attendanceRecord || [];

            // Check if attendance already marked for this date
            const existingIndex = attendanceRecord.findIndex(a => a.date === date);

            const attendanceDay = {
                date,
                attended,
                markedBy,
                markedAt: new Date()
            };

            if (existingIndex >= 0) {
                attendanceRecord[existingIndex] = attendanceDay;
            } else {
                attendanceRecord.push(attendanceDay);
            }

            // Update enrollment
            const updatedEnrollments = [...slot.enrolledStudents];
            updatedEnrollments[enrollmentIndex] = {
                ...enrollment,
                attendanceRecord
            };

            transaction.update(slotRef, {
                enrolledStudents: updatedEnrollments.map(e => ({
                    ...e,
                    enrolledAt: Timestamp.fromDate(new Date(e.enrolledAt)),
                    endsAt: Timestamp.fromDate(new Date(e.endsAt)),
                    attendanceRecord: e.attendanceRecord?.map(att => ({
                        ...att,
                        markedAt: att.markedAt ? Timestamp.fromDate(new Date(att.markedAt)) : null
                    }))
                })),
                updatedAt: Timestamp.now()
            });

            // If attended, deduct credit (similar to current system)
            if (attended) {
                const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
                transaction.update(studentRef, {
                    remainingCredits: increment(-1)
                });
            }
        });
    },

    /**
     * Delete all monthly slots for a season (used when regenerating)
     */
    async deleteBySeasonId(seasonId: string): Promise<number> {
        const q = query(
            collection(db, MONTHLY_SLOTS_COLLECTION),
            where('seasonId', '==', seasonId)
        );

        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        let deleted = 0;

        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            deleted++;
        });

        if (deleted > 0) {
            await batch.commit();
        }

        return deleted;
    },

    /**
     * Sync capacity from schedule templates to existing monthly slots
     * This should be called when a template's capacity is updated
     */
    async syncCapacityFromTemplates(seasonId: string): Promise<number> {
        const templates = await scheduleTemplateService.getBySeason(seasonId);

        if (templates.length === 0) {
            return 0;
        }

        const batch = writeBatch(db);
        let updated = 0;

        // Get all monthly slots for this season
        const q = query(
            collection(db, MONTHLY_SLOTS_COLLECTION),
            where('seasonId', '==', seasonId)
        );

        const snapshot = await getDocs(q);

        snapshot.docs.forEach(docSnap => {
            const slot = docSnap.data();

            // Find matching template
            const template = templates.find(t =>
                t.id === slot.scheduleTemplateId ||
                (t.dayType === slot.dayType && t.timeSlot === slot.timeSlot && t.categoryId === slot.categoryId)
            );

            if (template && template.capacity !== slot.capacity) {
                batch.update(docSnap.ref, {
                    capacity: template.capacity,
                    updatedAt: Timestamp.now()
                });
                updated++;
            }
        });

        if (updated > 0) {
            await batch.commit();
            await loggingService.addLog(
                `Sincronizadas ${updated} capacidades de horarios mensuales`,
                'SUCCESS'
            );
        }

        return updated;
    },

    /**
     * Get capacity information for a specific schedule pattern
     * Used in registration wizard to show available slots
     */
    async getScheduleCapacityInfo(
        seasonId: string,
        dayType: 'lun-mier-vier' | 'mar-juev' | 'sab-dom',
        timeSlot: string
    ): Promise<{
        totalCapacity: number;
        currentEnrollment: number;
        available: number;
        isFull: boolean;
        earliestAvailableDate: Date | null;
    }> {
        // Query all monthly slots for this schedule pattern
        const q = query(
            collection(db, MONTHLY_SLOTS_COLLECTION),
            where('seasonId', '==', seasonId),
            where('dayType', '==', dayType),
            where('timeSlot', '==', timeSlot)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return {
                totalCapacity: 0,
                currentEnrollment: 0,
                available: 0,
                isFull: true,
                earliestAvailableDate: null
            };
        }

        // Get capacity from first slot logic needs to be smarter
        // Find the slot corresponding to "Current Month" or the first available future slot
        const { formatMonthId } = await import('../utils/monthUtils');
        const currentMonth = formatMonthId(new Date());

        const slots = snapshot.docs.map(doc => doc.data()).sort((a, b) => a.month.localeCompare(b.month));

        // Find the relevant slot: The one for current month, or the first one if we are before season, or last if we are after
        let relevantSlot = slots.find(s => s.month >= currentMonth);

        // If no future slot found (season ended?), use the last one just to show something, or the first one.
        if (!relevantSlot) {
            relevantSlot = slots[slots.length - 1]; // Fallback to last slot
        }

        if (!relevantSlot) {
            // Should not happen as we checked snapshot.empty
            return {
                totalCapacity: 0,
                currentEnrollment: 0,
                available: 0,
                isFull: true,
                earliestAvailableDate: null
            };
        }

        const totalCapacity = relevantSlot.capacity || 0;
        const currentEnrollment = relevantSlot.enrolledStudents?.length || 0;
        const isFull = currentEnrollment >= totalCapacity;
        const available = Math.max(0, totalCapacity - currentEnrollment);

        // Find earliest end date from all enrolled students (across ALL slots, as availability might come from a future slot freeing up?)
        // Actually, if Current Slot is full, we look for when it frees up.
        // But if Current Slot is full, maybe Next Month is empty?
        // If Next Month is empty, then "Earliest Available Date" is Next Month's Start Date (approx 1st of month).
        // If Next Month is ALSO full, we check its students end dates.

        let earliestAvailableDate: Date | null = null;

        if (isFull) {
            // 1. Check earliest end date (+1 day) in the CURRENT (relevant) slot
            let earliestDropOffDate: Date | null = null;
            const enrolled = relevantSlot.enrolledStudents || [];

            enrolled.forEach((enrollment: any) => {
                const endDate = enrollment.endsAt?.toDate
                    ? enrollment.endsAt.toDate()
                    : new Date(enrollment.endsAt);

                // Spot frees up the day AFTER the end date
                const freeDate = new Date(endDate);
                freeDate.setDate(freeDate.getDate() + 1);

                if (!earliestDropOffDate || freeDate < earliestDropOffDate) {
                    earliestDropOffDate = freeDate;
                }
            });

            // 2. Check if there is a future month that is NOT full
            const futureFreeSlot = slots.find(s => s.month > relevantSlot!.month && (s.enrolledStudents?.length || 0) < s.capacity);
            let futureSlotStartDate: Date | null = null;

            if (futureFreeSlot) {
                futureSlotStartDate = new Date(`${futureFreeSlot.month}-01T00:00:00`);
            }

            // 3. Determine actual earliest availability
            if (earliestDropOffDate && futureSlotStartDate) {
                earliestAvailableDate = (earliestDropOffDate as Date).getTime() < (futureSlotStartDate as Date).getTime() ? earliestDropOffDate : futureSlotStartDate;
            } else if (earliestDropOffDate) {
                earliestAvailableDate = earliestDropOffDate;
            } else if (futureSlotStartDate) {
                earliestAvailableDate = futureSlotStartDate;
            }
        }

        return {
            totalCapacity,
            currentEnrollment,
            available,
            isFull,
            earliestAvailableDate
        };
    }
};
