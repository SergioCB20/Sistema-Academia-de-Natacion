import {
    collection,
    doc,
    getDocs,
    getDoc,

    query,
    where,
    runTransaction,
    writeBatch,
    Timestamp,
    arrayUnion,
    increment,
    updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loggingService } from './logging';
import { scheduleTemplateService } from './scheduleTemplateService';
import { categoryService } from './categoryService';
import { studentService } from './students';
import { getMonthsInRange } from '../utils/monthUtils';
import type { MonthlySlot, MonthlyEnrollment, Student, DayType } from '../types/db';

const MONTHLY_SLOTS_COLLECTION = 'monthly_slots';
const STUDENTS_COLLECTION = 'students';

// NEW: Helper to identify day type from fixed schedule dayIds
const getDayTypeFromDayIds = (dayIds: string[]): DayType | null => {
    const joined = dayIds.join('-').toUpperCase();
    if (joined.includes('LUN') || joined.includes('MIE') || joined.includes('VIE')) return 'lun-mier-vier';
    if (joined.includes('MAR') || joined.includes('JUE')) return 'mar-juev';
    if (joined.includes('SAB') || joined.includes('DOM')) return 'sab-dom';
    return null;
};

/**
 * Safely convert any date-like value to a JS Date
 */
const toJsDate = (val: any): Date => {
    if (!val) return new Date();
    if (val instanceof Timestamp) return val.toDate();
    if (val && typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
};

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
        const now = new Date();
        const batch = writeBatch(db);
        let updatesCount = 0;

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            const originalEnrollments = data.enrolledStudents || [];

            // Filter expired enrollments (Auto-cleanup)
            const validEnrollments = originalEnrollments.filter((e: any) => {
                // Handle various date formats (Timestamp or Date or String)
                const end = e.endsAt?.toDate ? e.endsAt.toDate() : new Date(e.endsAt);
                // Keep if end date is in future
                return end.getTime() > now.getTime();
            });

            // If we found expired students, queue a cleanup update
            if (validEnrollments.length !== originalEnrollments.length) {
                batch.update(doc.ref, {
                    enrolledStudents: validEnrollments,
                    updatedAt: Timestamp.now()
                });
                updatesCount++;
                data.enrolledStudents = validEnrollments; // Return the clean list to UI
            }

            return {
                ...data,
                id: doc.id,
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
        });

        // Commit cleanup in background
        if (updatesCount > 0) {
            console.log(`🧹 Auto-cleaning ${updatesCount} slots with expired students...`);
            batch.commit().catch(err => console.error("Error auto-cleaning slots:", err));
        }

        return results;
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

        // Auto-cleanup for single fetch too?
        // Maybe overkill, but consistent. Let's do a quick check.
        const originalEnrollments = data.enrolledStudents || [];
        const now = new Date();
        const validEnrollments = originalEnrollments.filter((e: any) => {
            const end = e.endsAt?.toDate ? e.endsAt.toDate() : new Date(e.endsAt);
            return end.getTime() > now.getTime();
        });

        if (validEnrollments.length !== originalEnrollments.length) {
            // Non-blocking update
            updateDoc(docRef, {
                enrolledStudents: validEnrollments,
                updatedAt: Timestamp.now()
            }).catch(e => console.error("Error auto-cleaning slot:", e));
            data.enrolledStudents = validEnrollments;
        }

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
            // Use local date parsing to avoid UTC shifts
            const reqDateStr = student.packageStartDate || new Date().toISOString().split('T')[0];
            const requestedStartDate = new Date(`${reqDateStr}T00:00:00`);

            // OPTIMIZATION: Removed getDocs of all active students (~200 reads saved)
            // Simply count enrollments that are still active at the requested date
            const activeEnrollments = (slot.enrolledStudents || []).filter(e => {
                const endDate = e.endsAt instanceof Timestamp ? e.endsAt.toDate() : e.endsAt instanceof Date ? e.endsAt : new Date(e.endsAt as any);
                // Check if student is still active on our requested start date
                return endDate >= requestedStartDate;
            });

            if (activeEnrollments.length >= slot.capacity) {
                throw new Error(`${slot.month}: El horario está lleno para la fecha seleccionada (${requestedStartDate.toLocaleDateString('es-PE')}).`);
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
                // FIX: Set end time to end of day to prevent premature expiration
                endsAt: student.packageEndDate ? new Date(`${student.packageEndDate}T23:59:59`) : new Date(),
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
                    enrolledAt: Timestamp.fromDate(toJsDate(e.enrolledAt)),
                    endsAt: Timestamp.fromDate(toJsDate(e.endsAt)),
                    attendanceRecord: e.attendanceRecord?.map(att => ({
                        ...att,
                        markedAt: att.markedAt ? Timestamp.fromDate(toJsDate(att.markedAt)) : null
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
                // NEW: Use template ID instead of timeSlot for stable mapping
                const slotId = `${month}_${template.id}`;
                const slotRef = doc(db, MONTHLY_SLOTS_COLLECTION, slotId);

                // Check if slot already exists
                const existingSlot = await getDoc(slotRef);
                if (existingSlot.exists()) {
                    // Update existing slot with current template values (keep students)
                    batch.update(slotRef, {
                        timeSlot: template.timeSlot,
                        dayType: template.dayType,
                        categoryId: template.categoryId,
                        capacity: template.capacity,
                        isBreak: template.isBreak,
                        updatedAt: Timestamp.now()
                    });
                    continue;
                }

                const newSlot: Omit<MonthlySlot, 'id'> = {
                    seasonId,
                    month: month,
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
                    enrolledAt: Timestamp.fromDate(toJsDate(e.enrolledAt)),
                    endsAt: Timestamp.fromDate(toJsDate(e.endsAt)),
                    attendanceRecord: e.attendanceRecord?.map(att => ({
                        ...att,
                        markedAt: att.markedAt ? Timestamp.fromDate(toJsDate(att.markedAt)) : null
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
     * Updates an enrollment snapshot with fresh student data
     * Critical for fixing data mismatches (e.g., package end date changed)
     */
    async updateEnrollmentSnapshot(slotId: string, student: Student): Promise<void> {
        const slotRef = doc(db, MONTHLY_SLOTS_COLLECTION, slotId);

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            if (!slotDoc.exists()) throw new Error('Horario no encontrado.');

            const slot = slotDoc.data() as MonthlySlot;
            const enrollmentIndex = slot.enrolledStudents?.findIndex(e => e.studentId === student.id);

            if (enrollmentIndex === -1 || enrollmentIndex === undefined) {
                // Not enrolled, nothing to update
                return;
            }

            const enrollment = slot.enrolledStudents[enrollmentIndex];

            // Re-calculate endsAt based on student profile
            const newEndsAt = student.packageEndDate ? new Date(`${student.packageEndDate}T23:59:59`) : new Date();

            const updatedEnrollments = [...slot.enrolledStudents];
            updatedEnrollments[enrollmentIndex] = {
                ...enrollment,
                studentName: student.fullName, // Sync name too just in case
                endsAt: newEndsAt
            };

            transaction.update(slotRef, {
                enrolledStudents: updatedEnrollments.map(e => ({
                    ...e,
                    enrolledAt: Timestamp.fromDate(toJsDate(e.enrolledAt)),
                    endsAt: Timestamp.fromDate(toJsDate(e.endsAt)),
                    attendanceRecord: e.attendanceRecord?.map(att => ({
                        ...att,
                        markedAt: att.markedAt ? Timestamp.fromDate(toJsDate(att.markedAt)) : null
                    }))
                })),
                updatedAt: Timestamp.now()
            });

            console.log(`✅ Snapshot actualizado para ${student.fullName} en slot ${slot.timeSlot}`);
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

            if (template) {
                const needsUpdate =
                    template.capacity !== slot.capacity ||
                    template.timeSlot !== slot.timeSlot ||
                    template.dayType !== slot.dayType ||
                    template.categoryId !== slot.categoryId ||
                    template.isBreak !== slot.isBreak;

                if (needsUpdate) {
                    batch.update(docSnap.ref, {
                        capacity: template.capacity,
                        timeSlot: template.timeSlot,
                        dayType: template.dayType,
                        categoryId: template.categoryId,
                        isBreak: template.isBreak,
                        updatedAt: Timestamp.now()
                    });
                    updated++;
                }
            }
        });

        if (updated > 0) {
            await batch.commit();
            await loggingService.addLog(
                `Sincronizados ${updated} horarios mensuales con sus plantillas`,
                'SUCCESS'
            );
        }

        return updated;
    },

    /**
     * Cleanup orphan enrollments: Remove enrollments for students that no longer exist.
     * This fixes capacity counts and prevents showing deleted students.
     */
    async cleanupOrphanEnrollments(seasonId: string): Promise<{ slotsProcessed: number, enrollmentsRemoved: number }> {
        try {
            // 1. Get all active student IDs
            const studentsQuery = query(
                collection(db, STUDENTS_COLLECTION),
                where('seasonId', '==', seasonId)
            );
            const studentsSnapshot = await getDocs(studentsQuery);
            const existingStudentIds = new Set(studentsSnapshot.docs.map(doc => doc.id));

            // 2. Get all monthly slots for this season
            const slotsQuery = query(
                collection(db, MONTHLY_SLOTS_COLLECTION),
                where('seasonId', '==', seasonId)
            );
            const slotsSnapshot = await getDocs(slotsQuery);

            const batch = writeBatch(db);
            let slotsProcessed = 0;
            let enrollmentsRemoved = 0;

            for (const slotDoc of slotsSnapshot.docs) {
                const slot = slotDoc.data();
                const enrollments = slot.enrolledStudents || [];

                // Filter to keep only enrollments for existing students
                const validEnrollments = enrollments.filter((e: any) => existingStudentIds.has(e.studentId));
                const removedCount = enrollments.length - validEnrollments.length;

                if (removedCount > 0) {
                    batch.update(slotDoc.ref, {
                        enrolledStudents: validEnrollments,
                        updatedAt: Timestamp.now()
                    });
                    slotsProcessed++;
                    enrollmentsRemoved += removedCount;
                }
            }

            if (enrollmentsRemoved > 0) {
                await batch.commit();
                await loggingService.addLog(
                    `Limpieza de inscripciones: ${enrollmentsRemoved} inscripciones huérfanas eliminadas de ${slotsProcessed} horarios.`,
                    'INFO'
                );
            }

            return { slotsProcessed, enrollmentsRemoved };
        } catch (error) {
            console.error('Error in cleanupOrphanEnrollments:', error);
            throw error;
        }
    },

    /**
     * Cleanup utility to move students from old format IDs to new stable IDs 
     * and delete orphaned/duplicate slots.
     */
    async cleanupOrphanedAndDuplicateSlots(seasonId: string): Promise<{ migrated: number, deleted: number }> {
        try {
            const q = query(
                collection(db, MONTHLY_SLOTS_COLLECTION),
                where('seasonId', '==', seasonId)
            );
            const snapshot = await getDocs(q);

            // Get all templates to find matches for orphans
            const templates = await scheduleTemplateService.getBySeason(seasonId);

            const batch = writeBatch(db);
            let migrated = 0;
            let deleted = 0;

            for (const docSnap of snapshot.docs) {
                const slot = docSnap.data() as MonthlySlot;
                const expectedId = `${slot.month}_${slot.scheduleTemplateId}`;

                // Check if it's an old format ID or orphaned
                if (docSnap.id !== expectedId) {
                    let targetSlotId = slot.scheduleTemplateId ? expectedId : null;

                    // Fallback: If scheduleTemplateId is missing, try to find a matching template
                    if (!targetSlotId) {
                        const matchingTemplate = templates.find(t =>
                            t.dayType === slot.dayType &&
                            t.categoryId === slot.categoryId
                        );
                        if (matchingTemplate) {
                            targetSlotId = `${slot.month}_${matchingTemplate.id}`;
                            // Update the orphan slot's template ID so it can be migrated next time or in this run
                            console.log(`Found matching template ${matchingTemplate.id} for orphan slot ${docSnap.id}`);
                        }
                    }

                    if (targetSlotId) {
                        const newSlotRef = doc(db, MONTHLY_SLOTS_COLLECTION, targetSlotId);
                        const newSlotSnap = await getDoc(newSlotRef);

                        if (newSlotSnap.exists()) {
                            const newSlotData = newSlotSnap.data() as MonthlySlot;
                            const oldStudents = slot.enrolledStudents || [];

                            if (oldStudents.length > 0) {
                                // Merge students into new slot (avoid duplicates)
                                const currentEnrolledIds = new Set(newSlotData.enrolledStudents?.map(e => e.studentId));
                                const studentsToMigrate = oldStudents.filter(e => !currentEnrolledIds.has(e.studentId));

                                if (studentsToMigrate.length > 0) {
                                    batch.update(newSlotRef, {
                                        enrolledStudents: arrayUnion(...studentsToMigrate.map(e => ({
                                            ...e,
                                            enrolledAt: Timestamp.fromDate(toJsDate(e.enrolledAt)),
                                            endsAt: Timestamp.fromDate(toJsDate(e.endsAt)),
                                            attendanceRecord: e.attendanceRecord?.map(att => ({
                                                ...att,
                                                markedAt: att.markedAt ? Timestamp.fromDate(toJsDate(att.markedAt)) : null
                                            })) || []
                                        }))),
                                        updatedAt: Timestamp.now()
                                    });
                                    migrated += studentsToMigrate.length;
                                }
                            }

                            // SAFETY: Only delete if it's either empty or we successfully moved everyone
                            // We use a small delay/local check here: since we are in a loop, we assume the batch will handle it,
                            // but we check if we actually have anything left in the array (simplified)
                            batch.delete(docSnap.ref);
                            deleted++;
                        } else {
                            console.warn(`Target slot ${targetSlotId} not found, skipping delete of ${docSnap.id} to avoid data loss.`);
                        }
                    } else if (!slot.enrolledStudents || slot.enrolledStudents.length === 0) {
                        // Safe to delete empty orphans with no matching template
                        batch.delete(docSnap.ref);
                        deleted++;
                    } else {
                        console.error(`ORPHAN SLOT WITH STUDENTS FOUND: ${docSnap.id}. No matching template. Manual recovery needed.`);
                    }
                }
            }

            if (deleted > 0 || migrated > 0) {
                await batch.commit();
                await loggingService.addLog(
                    `Limpieza completa: ${deleted} duplicados procesados, ${migrated} inscripciones protegidas/migradas.`,
                    'INFO'
                );
            }

            return { migrated, deleted };
        } catch (error) {
            console.error('Error in cleanupOrphanedAndDuplicateSlots:', error);
            await loggingService.addLog(`Error en limpieza de horarios: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'ERROR');
            throw error;
        }
    },

    /**
     * Get capacity information for a specific schedule pattern
     * Used in registration wizard to show available slots
     */
    async getScheduleCapacityInfo(
        seasonId: string,
        dayType: 'lun-mier-vier' | 'mar-juev' | 'sab-dom',
        timeSlot: string,
        categoryId: string // Added categoryId
    ): Promise<{
        totalCapacity: number;
        currentEnrollment: number;
        available: number;
        isFull: boolean;
        earliestAvailableDate: Date | null;
        relevantMonth?: string; // Informative field
    }> {
        const q = query(
            collection(db, MONTHLY_SLOTS_COLLECTION),
            where('seasonId', '==', seasonId),
            where('dayType', '==', dayType),
            where('timeSlot', '==', timeSlot),
            where('categoryId', '==', categoryId) // Added category filter
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

        const { formatMonthId, parseMonthId } = await import('../utils/monthUtils');
        const now = new Date();
        const currentMonth = formatMonthId(now);
        const slots = snapshot.docs.map(doc => doc.data() as MonthlySlot).sort((a, b) => a.month.localeCompare(b.month));

        // Refined Logic: Find the FIRST month starting from NOW that is NOT FULL
        // This ensures the wizard shows space in March even if February is full.
        let relevantSlot: MonthlySlot | undefined = undefined;

        // We need student data to accurately count "valid" enrollments (active & not expired)
        // Since we have multiple slots, let's collect all candidate IDs first to minimize reads
        const allCandidateIds = new Set<string>();
        slots.forEach(s => {
            if (s.month >= currentMonth) {
                (s.enrolledStudents || []).forEach((e: any) => allCandidateIds.add(e.studentId));
            }
        });

        let studentsMap: Map<string, any> = new Map();
        if (allCandidateIds.size > 0) {
            const studentsData = await studentService.getByIds(Array.from(allCandidateIds));
            studentsData.forEach(s => studentsMap.set(s.id, s));
        }

        const getValidCount = (slot: MonthlySlot) => {
            const slotMonthDate = parseMonthId(slot.month);
            const slotStart = slotMonthDate.getTime();

            const uniqueIds = new Set<string>();
            (slot.enrolledStudents || []).forEach((e: any) => {
                const s = studentsMap.get(e.studentId);
                if (!s || s.active === false) return;

                // Check overlap with the month of the slot
                // Use the enrollment's end date (snapshot) or the student's profile end date (live)
                // We prefer the profile end date if available for the most up-to-date info
                const enrollmentEnd = e.endsAt?.toDate ? e.endsAt.toDate().getTime() : new Date(e.endsAt).getTime();
                const studentEnd = s.packageEndDate ? new Date(s.packageEndDate + 'T23:59:59').getTime() : enrollmentEnd;

                const effectiveEnd = Math.min(enrollmentEnd, studentEnd);

                // Student occupies a spot in THIS month only if their package extends into or through this month
                // AND it hasn't expired relative to today (real-time check)
                if (effectiveEnd >= slotStart && effectiveEnd >= now.getTime()) {
                    uniqueIds.add(e.studentId);
                }
            });
            return uniqueIds.size;
        };

        // Find first available slot from now onwards
        relevantSlot = slots.find(s => {
            if (s.month < currentMonth) return false;
            return getValidCount(s) < (s.capacity || 0);
        });

        // Fallback: If all future months are full, pick the closest one (current or next)
        if (!relevantSlot) {
            relevantSlot = slots.find(s => s.month >= currentMonth) || slots[slots.length - 1];
        }

        if (!relevantSlot) {
            return {
                totalCapacity: 0,
                currentEnrollment: 0,
                available: 0,
                isFull: true,
                earliestAvailableDate: null
            };
        }

        const totalCapacity = relevantSlot.capacity || 0;
        const currentEnrollment = getValidCount(relevantSlot);
        const isFull = currentEnrollment >= totalCapacity;
        const available = Math.max(0, totalCapacity - currentEnrollment);

        let earliestAvailableDate: Date | null = null;

        if (isFull) {
            // 1. Check earliest end date (+1 day) in the CURRENT (relevant) slot
            let earliestDropOffDate: Date | null = null;

            (relevantSlot.enrolledStudents || []).forEach((enrollment: any) => {
                const s = studentsMap.get(enrollment.studentId);
                if (!s || s.active === false) return;

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
            const futureFreeSlot = slots.find(s => {
                if (s.month <= relevantSlot!.month) return false;
                return getValidCount(s) < (s.capacity || 0);
            });
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
            earliestAvailableDate,
            relevantMonth: relevantSlot.month
        };
    },

    /**
     * Recovery utility to find students whose 'fixedSchedule' puts them in a slot 
     * but they are missing from that month's enrollment lists.
     */
    async rescueLostEnrollments(seasonId: string, month: string): Promise<number> {
        try {
            console.log(`[RESCUE] Starting rescue for ${month} in season ${seasonId}`);
            const templates = await scheduleTemplateService.getBySeason(seasonId);
            const categories = await categoryService.getAll();
            const studentsSnapshot = await getDocs(query(collection(db, STUDENTS_COLLECTION), where('active', '==', true)));
            const slotsQuery = query(collection(db, MONTHLY_SLOTS_COLLECTION), where('seasonId', '==', seasonId), where('month', '==', month));
            const slotsSnapshot = await getDocs(slotsQuery);

            const slotsMap = new Map();
            slotsSnapshot.docs.forEach(d => slotsMap.set(d.id, { ref: d.ref, data: d.data() as MonthlySlot }));

            let rescuedCount = 0;
            const batch = writeBatch(db);

            // Create a lookup for category IDs by name for legacy support
            const categoryNameMap = new Map(categories.map(c => [c.name.toUpperCase(), c.id]));

            for (const studentDoc of studentsSnapshot.docs) {
                const student = studentDoc.data() as Student;
                if (!student.fixedSchedule || student.fixedSchedule.length === 0) continue;

                // Identify the expected slot for this student
                const dayIds = student.fixedSchedule.map(s => s.dayId);
                const dayType = getDayTypeFromDayIds(dayIds);
                const timeIdLine = student.fixedSchedule[0].timeId || '';
                const timeId = (timeIdLine).replace(/\s+/g, ''); // Strip whitespace

                if (!dayType) {
                    console.log(`[RESCUE] Student ${student.fullName} has invalid dayType: ${dayIds}`);
                    continue;
                }

                // Get category ID (robustly)
                let cId = student.categoryId;
                if (!cId && student.category) {
                    cId = categoryNameMap.get(student.category.toUpperCase()) || '';
                }

                if (!cId) {
                    console.log(`[RESCUE] Student ${student.fullName} has no categoryId/category`);
                    continue;
                }

                // Find matching template (Robust Time Match)
                const template = templates.find(t => {
                    const tTime = (t.timeSlot || '').replace(/\s+/g, '');
                    const isTimeMatch = tTime === timeId || timeId.includes(tTime) || tTime.includes(timeId);
                    return t.dayType === dayType && isTimeMatch && t.categoryId === cId;
                });

                if (!template) {
                    continue;
                }

                const expectedSlotId = `${month}_${template.id}`;
                const slotEntry = slotsMap.get(expectedSlotId);

                if (slotEntry) {
                    const isAlreadyEnrolled = slotEntry.data.enrolledStudents?.some((e: MonthlyEnrollment) => e.studentId === student.id);

                    if (!isAlreadyEnrolled) {
                        const enrollment: MonthlyEnrollment = {
                            studentId: student.id,
                            studentName: student.fullName,
                            enrolledAt: toJsDate(student.createdAt),
                            endsAt: toJsDate(student.packageEndDate),
                            creditsAllocated: 0,
                            attendanceRecord: []
                        };

                        batch.update(slotEntry.ref, {
                            enrolledStudents: arrayUnion({
                                ...enrollment,
                                enrolledAt: Timestamp.fromDate(enrollment.enrolledAt),
                                endsAt: Timestamp.fromDate(enrollment.endsAt)
                            }),
                            updatedAt: Timestamp.now()
                        });

                        rescuedCount++;
                        console.log(`[RESCUE] SUCCESSFULLY queued student ${student.fullName} into slot ${expectedSlotId} (${template.timeSlot})`);
                    }
                } else {
                    console.log(`[RESCUE] Target slot ${expectedSlotId} not found in database for ${month}`);
                }
            }

            if (rescuedCount > 0) {
                await batch.commit();
                console.log(`[RESCUE] Committed ${rescuedCount} rescues.`);
                await loggingService.addLog(`Rescate completado: ${rescuedCount} alumnos vueltos a inscribir en el mes ${month}.`, 'SUCCESS');
            } else {
                console.log(`[RESCUE] No students needed rescue for ${month}.`);
            }

            return rescuedCount;
        } catch (error) {
            console.error('[RESCUE] CRITICAL ERROR:', error);
            throw error;
        }
    },
    async removeStudentFromAllSlots(seasonId: string, studentId: string): Promise<number> {
        try {
            // Get all slots for the season
            const q = query(
                collection(db, MONTHLY_SLOTS_COLLECTION),
                where('seasonId', '==', seasonId)
            );

            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            let slotsUpdated = 0;

            snapshot.docs.forEach(docSnap => {
                const slot = docSnap.data();
                const enrollments = slot.enrolledStudents || [];

                // Check if student is enrolled
                const isEnrolled = enrollments.some((e: any) => e.studentId === studentId);

                if (isEnrolled) {
                    // Filter out the student
                    const updatedEnrollments = enrollments.filter((e: any) => e.studentId !== studentId);

                    batch.update(docSnap.ref, {
                        enrolledStudents: updatedEnrollments,
                        updatedAt: Timestamp.now()
                    });

                    slotsUpdated++;
                }
            });

            if (slotsUpdated > 0) {
                await batch.commit();
                await loggingService.addLog(
                    `Alumno ${studentId} removido de ${slotsUpdated} horarios en temporada ${seasonId}`,
                    'WARNING' // Warning because it's a destructive action (suspension)
                );
            }

            return slotsUpdated;
        } catch (error) {
            console.error('Error removing student from all slots:', error);
            throw error;
        }
    }
};
