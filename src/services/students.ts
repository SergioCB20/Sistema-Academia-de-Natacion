import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    runTransaction,
    increment // <-- AGREGAR ESTO
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loggingService } from './logging';
import type { Student, Payment, PaymentMethod, Debt } from '../types/db';

const STUDENTS_COLLECTION = 'students';
const PAYMENTS_COLLECTION = 'payments';

export const studentService = {
    /**
     * Creates a new student with optional initial payment.
     * Transactional: Creates Student + Payment + Debt (if applicable)
     */
    async create(
        studentData: Omit<Student, 'active' | 'remainingCredits' | 'hasDebt' | 'createdAt'>,
        paymentData?: {
            amountPaid: number,
            totalCost: number,
            credits: number, // credits to assign
            method: PaymentMethod
        }
    ): Promise<void> {
        // 0. Pre-validate Schedule Availability
        // This ensures we don't create a student if the dates/schedule are invalid
        if (studentData.fixedSchedule && studentData.fixedSchedule.length > 0) {
            console.log("Checking schedule availability...", studentData.fixedSchedule, studentData.packageStartDate);
            await this.validateScheduleAvailability(
                studentData.fixedSchedule,
                studentData.packageStartDate,
                studentData.packageEndDate
            );
            console.log("Schedule availability check passed.");
        } else {
            console.log("Skipping schedule check: No fixed schedule provided.", studentData);
        }

        // Use id field for document reference (handles empty DNI case)
        const studentRef = doc(db, STUDENTS_COLLECTION, studentData.id);
        const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
        const debtRef = doc(collection(db, 'debts'));
        const metadataRef = doc(db, 'metadata', 'counters'); // Global counters doc

        await runTransaction(db, async (transaction) => {
            // 1. Check if student exists (READ 1)
            const existing = await transaction.get(studentRef);
            if (existing.exists()) {
                throw new Error("El alumno ya existe (DNI duplicado).");
            }

            // 2. Get Metadata Counter (READ 2)
            const metadataDoc = await transaction.get(metadataRef);

            // --- END OF READS ---

            // 3. Prepare Code
            let nextCode = "000001";
            if (metadataDoc.exists()) {
                const currentCount = metadataDoc.data().students || 0;
                const nextCount = currentCount + 1;
                nextCode = nextCount.toString().padStart(6, '0');
                transaction.update(metadataRef, {
                    students: nextCount,
                    activeStudents: increment(1)
                });
            } else {
                transaction.set(metadataRef, {
                    students: 1,
                    activeStudents: 1
                });
            }


            // 1.5 Validate Capacity (Logic only, no DB reads in transaction)
            if (studentData.fixedSchedule && studentData.fixedSchedule.length > 0) {
                // Placeholder
            }

            let remainingCredits = 0;
            let hasDebt = false;

            // 4. Handle Payment Logic (WRITES)
            if (paymentData) {
                const { amountPaid, totalCost, credits, method } = paymentData;
                remainingCredits = credits;

                const isPartial = amountPaid < totalCost;
                hasDebt = isPartial;

                // Create Payment Log
                const newPayment: Payment = {
                    id: paymentRef.id,
                    studentId: studentData.id,
                    studentName: studentData.fullName,
                    studentDni: studentData.dni || studentData.id,
                    amount: amountPaid,
                    credits: credits,
                    method: method,
                    type: isPartial ? 'PARTIAL' : 'FULL',
                    date: Date.now(),
                    createdBy: 'admin'
                };
                transaction.set(paymentRef, newPayment);

                // Create Debt Record if partial
                if (isPartial) {
                    const newDebt: Debt = {
                        id: debtRef.id,
                        studentId: studentData.id,
                        studentName: studentData.fullName,
                        studentDni: studentData.dni || studentData.id,
                        slotId: 'MATRICULA_INICIAL',
                        amountTotal: totalCost,
                        amountPaid: amountPaid,
                        balance: totalCost - amountPaid,
                        dueDate: Date.now() + (7 * 24 * 60 * 60 * 1000),
                        status: 'PENDING'
                    };
                    transaction.set(debtRef, newDebt);
                }
            }

            // 5. Create Student (WRITE)
            const finalDni = studentData.dni || studentData.id;

            const newStudent: Student = {
                ...studentData,
                dni: finalDni,
                active: true,
                remainingCredits: remainingCredits,
                hasDebt: hasDebt,
                studentCode: nextCode,
                createdAt: Date.now(),
                asistencia: [] // Initialize empty attendance array
            };
            transaction.set(studentRef, newStudent);
        });

        // Log Activity
        await loggingService.addLog(
            `Nuevo alumno registrado: ${studentData.fullName}`,
            'SUCCESS'
        );


        // Post-creation: Sync fixed schedule to existing monthly slots
        if (studentData.fixedSchedule && studentData.fixedSchedule.length > 0) {
            // DO NOT CATCH - let validation errors propagate to UI
            await this.syncFixedScheduleToMonthlySlots(
                studentData.id,
                studentData.fixedSchedule,
                studentData.packageEndDate,
                studentData.packageStartDate,
                studentData.categoryId
            );
        }
    },

    /**
     * Search students by partial name match (simulated with >= and <=)
     * Note: Firestore doesn't support full-text search natively without extra tools.
     * For small datasets, client-side filtering might be better if we fetch all active students.
     * Here we just fetch active ones.
     */
    async search(term: string): Promise<Student[]> {
        const q = query(
            collection(db, STUDENTS_COLLECTION),
            where('fullName', '>=', term),
            where('fullName', '<=', term + '\uf8ff'),
            limit(10)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as Student);
    },
    /**
     * Get active students filtered by season
     * NOTE: Filtering client-side to avoid requiring a composite index active+seasonId+fullName
     */
    async getBySeason(seasonId: string): Promise<Student[]> {
        const q = query(
            collection(db, STUDENTS_COLLECTION),
            where('active', '==', true),
            orderBy('fullName'),
            limit(500)
        );

        const snapshot = await getDocs(q);
        const allActive = snapshot.docs.map(doc => doc.data() as Student);

        // Client-side filter
        return allActive.filter(student => student.seasonId === seasonId);
    },

    /**
     * Get all active students
     */
    async getAllActive(): Promise<Student[]> {
        const q = query(
            collection(db, STUDENTS_COLLECTION),
            where('active', '==', true),
            orderBy('fullName'),
            limit(500)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as Student);
    },

    /**
     * Adds credits to a student via a Payment transaction.
     * Updates 'students' (remainingCredits) and creates 'payments' log atomically.
     */
    async addCredits(
        studentId: string,
        credits: number,
        amount: number,
        method: PaymentMethod,
        createdBy: string,
        newEndDate?: string // YYYY-MM-DD
    ): Promise<string> {
        const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        await runTransaction(db, async (transaction) => {
            const studentDoc = await transaction.get(studentRef);
            if (!studentDoc.exists()) {
                throw new Error("Estudiante no encontrado");
            }

            const data = studentDoc.data();
            const currentCredits = data.remainingCredits || 0;

            // Create Payment Log
            const newPayment: Payment = {
                id: paymentRef.id,
                studentId,
                studentName: data.fullName,
                studentDni: data.dni,
                amount,
                credits,
                method,
                type: 'FULL', // Defaulting to FULL for credit addition
                date: Date.now(),
                createdBy
            };

            transaction.set(paymentRef, newPayment);

            // Update Student Balance & End Date
            const updates: any = {
                remainingCredits: currentCredits + credits
            };

            if (newEndDate) {
                updates.packageEndDate = newEndDate;
            }

            transaction.update(studentRef, updates);
        });

        // We can't easily get the student name inside transaction return without reading, 
        // but we can just use ID or Fetch.
        // For optimization let's just log ID or simple message.
        /* REMOVED LOG: Alumno adquiriendo clases - requested by user to save space
        await loggingService.addLog(
            `Alumno ${studentId} adquirió ${credits} clases (S/ ${amount})`,
            'SUCCESS'
        );
        */

        return paymentRef.id;
    },

    /**
     * Updates student basic info.
     */
    async update(id: string, updates: Partial<Student>): Promise<void> {
        const studentRef = doc(db, STUDENTS_COLLECTION, id);

        // Get current student data to check if being deactivated
        const studentDoc = await getDoc(studentRef);
        if (!studentDoc.exists()) {
            throw new Error("Estudiante no encontrado");
        }

        const currentData = studentDoc.data() as Student;
        const wasActive = currentData.active !== false; // Default to true if not set
        const willBeActive = updates.active !== false; // Check if being deactivated

        await updateDoc(studentRef, updates);

        // Re-sync monthly slots if critical data changed
        const dateChanged = updates.packageStartDate !== undefined || updates.packageEndDate !== undefined;
        const scheduleChanged = updates.fixedSchedule !== undefined;

        if (dateChanged || scheduleChanged) {
            const finalSchedule = updates.fixedSchedule || currentData.fixedSchedule;
            const finalStart = updates.packageStartDate !== undefined ? updates.packageStartDate : currentData.packageStartDate;
            const finalEnd = updates.packageEndDate !== undefined ? updates.packageEndDate : currentData.packageEndDate;
            const finalCategory = updates.categoryId || currentData.categoryId;

            // Only sync if there is a schedule
            if (finalSchedule && finalSchedule.length > 0) {
                try {
                    await this.syncFixedScheduleToMonthlySlots(
                        id,
                        finalSchedule,
                        finalEnd,
                        finalStart,
                        finalCategory
                    );
                } catch (error) {
                    console.error("Error syncing schedule during update:", error);
                    // We don't throw here to avoid blocking the basic update, 
                    // but the changes are already saved in the student doc.
                }
            }
        }

        // If student is being deactivated, decrement counter
        if (wasActive && !willBeActive) {
            const metadataRef = doc(db, 'metadata', 'counters');
            await updateDoc(metadataRef, {
                activeStudents: increment(-1)
            });
        }

        // If student is being reactivated, increment counter
        if (!wasActive && willBeActive) {
            const metadataRef = doc(db, 'metadata', 'counters');
            await updateDoc(metadataRef, {
                activeStudents: increment(1)
            });
        }
    },

    /**
     * Hard deletes a student.
     * WARNING: This can orphan related records (payments, debts) if not handled.
     */
    async delete(studentId: string): Promise<void> {
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        await runTransaction(db, async (transaction) => {
            // 1. Get student to delete
            const studentDoc = await transaction.get(studentRef);
            if (!studentDoc.exists()) return;

            const studentData = studentDoc.data();
            const deletedCode = studentData.studentCode;

            // 2. Lock metadata (prevents new creations during this shift)
            const metadataRef = doc(db, 'metadata', 'counters');
            const metadataDoc = await transaction.get(metadataRef);

            if (deletedCode) {
                // 3. Find subsequent students
                // Note: getDocs is not strictly transactional in client SDK regarding locks,
                // but locking metadataRef prevents "insertions" at the end.
                // Concurrent deletions might be an edge case but rare in this context.
                const q = query(
                    collection(db, STUDENTS_COLLECTION),
                    where('studentCode', '>', deletedCode),
                    orderBy('studentCode')
                );

                // Execute query
                // We have to await it. In a transaction, using non-transactional read is allowed.
                const snapshot = await getDocs(q);

                // 4. Perform updates
                transaction.delete(studentRef);

                // Update counters
                if (metadataDoc.exists()) {
                    const currentCount = metadataDoc.data().students || 0;
                    const activeCount = metadataDoc.data().activeStudents || 0;
                    const wasActive = studentData.active !== false;

                    transaction.update(metadataRef, {
                        students: Math.max(0, currentCount - 1),
                        activeStudents: wasActive ? Math.max(0, activeCount - 1) : activeCount
                    });
                }

                // Shift codes down
                snapshot.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.studentCode) {
                        const currentVal = parseInt(data.studentCode, 10);
                        const newVal = currentVal - 1;
                        // Format with leading zeros
                        const newCode = newVal.toString().padStart(6, '0');
                        transaction.update(docSnap.ref, { studentCode: newCode });
                    }
                });
            } else {
                // No code, just delete
                transaction.delete(studentRef);

                // Still need to update active counter even if no studentCode shift
                const metadataRef = doc(db, 'metadata', 'counters');
                const metaDoc = await transaction.get(metadataRef);
                if (metaDoc.exists()) {
                    const activeCount = metaDoc.data().activeStudents || 0;
                    const wasActive = studentData.active !== false;
                    if (wasActive) {
                        transaction.update(metadataRef, {
                            activeStudents: Math.max(0, activeCount - 1)
                        });
                    }
                }
            }
        });
    },

    /**
     * Soft deletes/reactivates a student.
     */
    async toggleActive(studentId: string, active: boolean): Promise<void> {
        const ref = doc(db, STUDENTS_COLLECTION, studentId);
        const metadataRef = doc(db, 'metadata', 'counters');

        await runTransaction(db, async (transaction) => {
            const studentDoc = await transaction.get(ref);
            if (!studentDoc.exists()) throw new Error("Estudiante no encontrado");

            const currentData = studentDoc.data();
            const wasActive = currentData.active !== false;

            if (wasActive === active) return; // No change

            transaction.update(ref, { active });
            transaction.update(metadataRef, {
                activeStudents: increment(active ? 1 : -1)
            });
        });
    },



    /**
     * Get pending debts for a student.
     */
    async getDebts(studentId: string): Promise<Debt[]> {
        const q = query(
            collection(db, 'debts'),
            where('studentId', '==', studentId),
            where('status', '==', 'PENDING')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data() as Debt);
    },

    async payDebt(debtId: string, amount: number, method: PaymentMethod): Promise<void> {
        const debtRef = doc(db, 'debts', debtId);
        const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
        let studentId = '';

        await runTransaction(db, async (transaction) => {
            const debtDoc = await transaction.get(debtRef);
            if (!debtDoc.exists()) throw new Error("Deuda no encontrada");

            const debt = debtDoc.data() as Debt;
            studentId = debt.studentId;

            if (debt.status !== 'PENDING') throw new Error("La deuda ya está pagada");

            const newPaid = debt.amountPaid + amount;
            const newBalance = debt.amountTotal - newPaid;
            // Allow small float margin error
            const newStatus = newBalance < 0.5 ? 'PAID' : 'PENDING';

            transaction.update(debtRef, {
                amountPaid: newPaid,
                balance: newBalance,
                status: newStatus
            });

            // Fetch student for snapshot
            const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
            const studentDoc = await transaction.get(studentRef);
            const studentName = studentDoc.exists() ? studentDoc.data().fullName : 'Unknown';
            const studentDni = studentDoc.exists() ? studentDoc.data().dni : '';

            const newPayment: Payment = {
                id: paymentRef.id,
                studentId: debt.studentId,
                studentName: studentName,
                studentDni: studentDni,
                amount: amount,
                method: method,
                type: newStatus === 'PAID' ? 'FULL' : 'PARTIAL',
                credits: 0,
                date: Date.now(),
                createdBy: 'admin'
            };
            transaction.set(paymentRef, newPayment);
        });

        // Update student status outside transaction (Eventual Consistency)
        if (studentId) {
            await this.updateDebtStatus(studentId);
        }

        /* REMOVED LOG: Debt Payment - requested by user to save space
        await loggingService.addLog(
            `Alumno ${studentId} pagó deuda de S/ ${amount}`,
            'SUCCESS'
        );
        */
    },

    async updateDebtStatus(studentId: string): Promise<void> {
        const q = query(
            collection(db, 'debts'),
            where('studentId', '==', studentId),
            where('status', '==', 'PENDING')
        );
        const snap = await getDocs(q);
        const hasDebt = !snap.empty;

        const ref = doc(db, STUDENTS_COLLECTION, studentId);
        await updateDoc(ref, { hasDebt });
    },

    /**
     * Get count of new students for the current month
     */
    async getNewStudentsCount(month: number, year: number): Promise<number> {
        const start = new Date(year, month, 1).getTime();
        const end = new Date(year, month + 1, 0, 23, 59, 59).getTime();

        const q = query(
            collection(db, STUDENTS_COLLECTION),
            where('createdAt', '>=', start),
            where('createdAt', '<=', end)
        );

        const snap = await getDocs(q);
        return snap.size;
    },

    /**
     * Helper: Syncs a student's fixed schedule to existing monthly slots in the DB.
     * This enrolls the student in all monthly slots that match their schedule for the current season.
     * Includes capacity validation and provides detailed error messages.
     */
    async syncFixedScheduleToMonthlySlots(
        studentId: string,
        fixedSchedule: Array<{ dayId: string, timeId: string }>,
        packageEndDate?: string | null,
        packageStartDate?: string | null,
        categoryId?: string
    ): Promise<void> {
        // Import services dynamically to avoid circular dependencies
        const { monthlyScheduleService } = await import('./monthlyScheduleService');
        const { seasonService } = await import('./seasonService');
        const { getMonthName } = await import('../utils/monthUtils');

        // ... Reuse validation logic via helper or explicitly ...
        // For now, allow redundancy or refactor to use common logic.
        // We will just do the enrollment part here, relying on validation done before?
        // No, in case of 'update', we need validation too.
        // Let's keep the logic here but cleaner.

        // Actually, for DRY, let's call the validator inside here too, or just expect it to pass?
        // If we call simple validator, we duplicate query costs?
        // Let's just implement the enrollment directly here, but using the same 'matchingSlots' logic.
        // To minimize code duplication, we can extract the "getMatchingSlots" logic?

        // For speed, I'll essentially execute the same logic for now to ensure consistency, 
        // but `create` already called `validateScheduleAvailability`.

        // Get active season
        const activeSeason = await seasonService.getActiveSeason();
        if (!activeSeason) throw new Error('No hay temporada activa.');

        const slotsInfo = await this._getMatchingSlots(activeSeason, fixedSchedule, packageStartDate, packageEndDate, categoryId);
        const { matchingSlots } = slotsInfo;

        // Validation happened in _getMatchingSlots or similar? 
        // No, let's just copy the critical "enrollment" part here and delegate the finding to _getMatchingSlots.

        let enrolled = 0;
        const errors: string[] = [];

        for (const slot of matchingSlots) {
            try {
                await monthlyScheduleService.enrollStudent(slot.id, studentId);
                enrolled++;
            } catch (error: any) {
                // Ignore if already enrolled
                if (!error.message?.includes('ya está inscrito')) {
                    errors.push(`${getMonthName(slot.month)}: ${error.message}`);
                }
            }
        }

        if (errors.length > 0 && enrolled === 0) {
            throw new Error(`No se pudo inscribir al alumno:\n\n${errors.join('\n')}`);
        }

        console.log(`✅ Alumno ${studentId} inscrito en ${enrolled} horarios mensuales`);
    },

    /**
     * Helper to validate schedule without creating anything.
     * Throws error if invalid.
     */
    async validateScheduleAvailability(
        fixedSchedule: Array<{ dayId: string, timeId: string }>,
        packageStartDate?: string | null,
        packageEndDate?: string | null,
        categoryId?: string
    ): Promise<void> {
        const { seasonService } = await import('./seasonService');
        const activeSeason = await seasonService.getActiveSeason();
        if (!activeSeason) throw new Error('No hay temporada activa.');

        await this._getMatchingSlots(activeSeason, fixedSchedule, packageStartDate, packageEndDate, categoryId);
    },

    /**
     * Internal helper to find slots and validate them.
     */
    async _getMatchingSlots(
        activeSeason: any,
        fixedSchedule: Array<{ dayId: string, timeId: string }>,
        packageStartDate?: string | null,
        packageEndDate?: string | null,
        categoryId?: string
    ): Promise<{ matchingSlots: any[], errors?: string[] }> {
        const { formatMonthId, getMonthName } = await import('../utils/monthUtils');
        const { db } = await import('../lib/firebase');
        const { collection, query, where, getDocs } = await import('firebase/firestore');

        // Determine which dayType this schedule belongs to
        const dayIds = Array.from(new Set(fixedSchedule.map(s => s.dayId))).sort();
        const timeSlots = Array.from(new Set(fixedSchedule.map(s => s.timeId)));

        let dayType: 'lun-mier-vier' | 'mar-juev' | 'sab-dom' | null = null;
        const daySet = dayIds.join(',');
        if (daySet === 'LUN,MIE,VIE') dayType = 'lun-mier-vier';
        else if (daySet === 'JUE,MAR') dayType = 'mar-juev';
        else if (daySet === 'DOM,SAB') dayType = 'sab-dom';

        if (!dayType) {
            throw new Error(`No se pudo determinar el tipo de horario (${daySet}). Por favor, seleccione un horario válido.`);
        }

        const currentMonth = packageStartDate
            ? formatMonthId(new Date(packageStartDate))
            : formatMonthId(new Date());

        const endMonth = packageEndDate
            ? formatMonthId(new Date(packageEndDate))
            : activeSeason.endMonth;

        const q = query(
            collection(db, 'monthly_slots'),
            where('seasonId', '==', activeSeason.id),
            where('dayType', '==', dayType)
        );

        const snapshot = await getDocs(q);
        const matchingSlots: any[] = [];

        for (const docSnap of snapshot.docs) {
            const slot = docSnap.data();
            const matchesTimeSlot = timeSlots.some(ts => ts === slot.timeSlot);
            const slotMonth = slot.month;
            const isWithinPeriod = slotMonth >= currentMonth && slotMonth <= endMonth;

            const isOfCategory = !categoryId || slot.categoryId === categoryId;

            if (matchesTimeSlot && isWithinPeriod && isOfCategory) {
                matchingSlots.push({
                    id: docSnap.id,
                    month: slotMonth,
                    timeSlot: slot.timeSlot,
                    capacity: slot.capacity,
                    enrolledStudents: slot.enrolledStudents || []
                });
            }
        }

        if (matchingSlots.length === 0) {
            const startName = getMonthName(currentMonth);
            const endName = getMonthName(endMonth);
            const seasonStartName = getMonthName(activeSeason.startMonth);
            const seasonEndName = getMonthName(activeSeason.endMonth);

            if (currentMonth < activeSeason.startMonth || endMonth > activeSeason.endMonth || currentMonth > activeSeason.endMonth) {
                throw new Error(
                    `⚠️ FECHA FUERA DE TEMPORADA\n\n` +
                    `Estás intentando registrar clases desde ${startName} hasta ${endName}.\n` +
                    `Pero la temporada activa "${activeSeason.name}" solo funciona de ${seasonStartName} a ${seasonEndName}.\n\n` +
                    `Por favor selecciona una fecha de inicio dentro de la temporada.`
                );
            }

            throw new Error(
                `⚠️ HORARIOS NO ENCONTRADOS\n\n` +
                `No existen horarios creados para ${dayType} entre ${startName} y ${endName}.\n` +
                `Verifique en "Gestionar Horarios" que existan bloques disponibles para esta categoría y fechas.`
            );
        }

        matchingSlots.sort((a, b) => a.month.localeCompare(b.month));

        // Capacity Check 
        const requestedStartDate = packageStartDate ? new Date(`${packageStartDate}T00:00:00`) : new Date();

        const fullSlots = matchingSlots.filter(s => {
            const enrolled = s.enrolledStudents || [];
            let activeCount = 0;
            enrolled.forEach((enrollment: any) => {
                const endDate = enrollment.endsAt?.toDate ? enrollment.endsAt.toDate() : new Date(enrollment.endsAt);
                if (endDate >= requestedStartDate) activeCount++;
            });
            return activeCount >= s.capacity;
        });

        if (fullSlots.length > 0) {
            const fullMonths = fullSlots.map(s => getMonthName(s.month)).join(', ');
            // Simplified error for brevity in this refactor, but kept robust enough
            throw new Error(
                `⚠️ HORARIO LLENO\n\n` +
                `Para la fecha seleccionada, el horario está lleno en: ${fullMonths}.\n` +
                `Intente con una fecha posterior.`
            );
        }

        return { matchingSlots };
    },

    async getActiveStudentsCount(): Promise<number> {
        const metadataRef = doc(db, 'metadata', 'counters');

        // ALWAYS recount for now to ensure we fix the out-of-sync state
        // In the future, once synchronized, we can rely on the counter again.
        const q = query(
            collection(db, STUDENTS_COLLECTION),
            where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        const count = snapshot.size;

        // Update the counter doc with the real count
        await setDoc(metadataRef, {
            activeStudents: count,
            lastSynced: Date.now()
        }, { merge: true });

        return count;
    },

    /**
     * Mark attendance for a student on a specific date
     */
    async markAttendance(
        studentId: string,
        fecha: string, // YYYY-MM-DD format
        asistencia: boolean
    ): Promise<void> {
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        await runTransaction(db, async (transaction) => {
            const studentDoc = await transaction.get(studentRef);
            if (!studentDoc.exists()) {
                throw new Error("Estudiante no encontrado");
            }

            const studentData = studentDoc.data() as Student;
            const currentAttendance = studentData.asistencia || [];

            // Check if attendance for this date already exists
            const existingIndex = currentAttendance.findIndex(a => a.fecha === fecha);

            if (existingIndex >= 0) {
                // Update existing record
                currentAttendance[existingIndex] = { fecha, asistencia };
            } else {
                // Add new record
                currentAttendance.push({ fecha, asistencia });
            }

            // Sort by date (newest first)
            currentAttendance.sort((a, b) => b.fecha.localeCompare(a.fecha));

            transaction.update(studentRef, {
                asistencia: currentAttendance
            });
        });
    }
};

