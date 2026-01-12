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
    increment,
    deleteDoc,
    Timestamp,
    writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loggingService } from './logging';
import type { Student, Payment, PaymentMethod, Debt } from '../types/db';

const STUDENTS_COLLECTION = 'students';
const PAYMENTS_COLLECTION = 'payments';

export const studentService = {
    /**
     * Creates a new student with optional initial payment.
     * Transactional: Creates Student + Payment(s) + Debt (if applicable)
     * Supports multiple payment methods in a single registration.
     */
    async create(
        studentData: Omit<Student, 'active' | 'remainingCredits' | 'hasDebt' | 'createdAt'>,
        paymentData?: {
            totalCost: number,
            credits: number,
            payments: Array<{
                amount: number,
                method: PaymentMethod
            }>
        }
    ): Promise<void> {
        const { seasonService } = await import('./seasonService');

        // 1. PRE-FETCH DATA (Before Transaction)
        const activeSeason = await seasonService.getActiveSeason();
        if (!activeSeason) throw new Error('No hay temporada activa.');

        // Get matching slots and check availability upfront
        const slotsInfo = await this._getMatchingSlots(
            activeSeason,
            studentData.fixedSchedule || [],
            studentData.packageStartDate,
            studentData.packageEndDate,
            studentData.categoryId
        );
        const { matchingSlots } = slotsInfo;

        // OPTIMIZATION: Removed getDocs of all active students (~200 reads saved)
        // The capacity check will count all enrollments, which is safe since
        // inactive students shouldn't be enrolled in future dates anyway

        // Use id field for document reference (handles empty DNI case)
        const studentRef = doc(db, STUDENTS_COLLECTION, studentData.id);
        const debtRef = doc(collection(db, 'debts'));
        const metadataRef = doc(db, 'metadata', 'counters');

        // 2. RUN ATOMIC TRANSACTION
        await runTransaction(db, async (transaction) => {
            // --- ALL READS MUST COME FIRST ---

            // 1. Check for duplicate student
            const studentDoc = await transaction.get(studentRef);
            if (studentDoc.exists()) {
                throw new Error("El alumno ya existe o se ha intentado guardar dos veces.");
            }

            // 2. Get next student code
            const metadataDoc = await transaction.get(metadataRef);

            // 3. READ ALL SLOTS (REQUIRED BY FIRESTORE)
            const slotDataList: Array<{ ref: any, data: any }> = [];
            for (const slotStub of matchingSlots) {
                const slotRef = doc(db, 'monthly_slots', slotStub.id);
                const slotDoc = await transaction.get(slotRef);
                if (slotDoc.exists()) {
                    slotDataList.push({ ref: slotRef, data: slotDoc.data() });
                }
            }

            // --- END OF READS. NOW WRITES ONLY ---

            let nextCount = 1;
            if (metadataDoc.exists()) {
                nextCount = (metadataDoc.data().students || 0) + 1;
            }
            const studentCode = nextCount.toString().padStart(6, '0');

            // --- CALCULATIONS ---
            let remainingCredits = 0;
            let hasDebt = false;

            if (paymentData) {
                const { totalCost, credits, payments } = paymentData;
                remainingCredits = credits;
                const totalAmountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                const isPartial = totalAmountPaid < totalCost;
                hasDebt = isPartial;

                // Create Payments
                for (const paymentEntry of payments) {
                    if (paymentEntry.amount <= 0) continue;
                    const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
                    transaction.set(paymentRef, {
                        id: paymentRef.id,
                        studentId: studentData.id,
                        studentName: studentData.fullName,
                        studentDni: studentData.dni || studentData.id,
                        amount: paymentEntry.amount,
                        credits: 0,
                        method: paymentEntry.method,
                        type: isPartial ? 'PARTIAL' : 'FULL',
                        seasonId: studentData.seasonId,
                        date: Date.now(),
                        createdBy: 'admin'
                    });
                }

                // Create Debt if partial
                if (isPartial) {
                    transaction.set(debtRef, {
                        id: debtRef.id,
                        studentId: studentData.id,
                        studentName: studentData.fullName,
                        studentDni: studentData.dni || studentData.id,
                        slotId: 'MATRICULA_INICIAL',
                        amountTotal: totalCost,
                        amountPaid: totalAmountPaid,
                        balance: totalCost - totalAmountPaid,
                        dueDate: Date.now() + (7 * 24 * 60 * 60 * 1000),
                        status: 'PENDING'
                    });
                }
            }

            // Create Student
            const finalDni = studentData.dni || studentData.id;
            const newStudent: Student = {
                ...studentData,
                dni: finalDni,
                active: true,
                remainingCredits: remainingCredits,
                hasDebt: hasDebt,
                studentCode: studentCode,
                createdAt: Date.now(),
                asistencia: []
            };
            transaction.set(studentRef, newStudent);

            // Update Global Counter
            transaction.set(metadataRef, {
                students: nextCount,
                activeStudents: increment(1)
            }, { merge: true });

            // ENROLL IN SLOTS
            const reqDateStr = studentData.packageStartDate || new Date().toISOString().split('T')[0];
            const requestedStartDate = new Date(`${reqDateStr}T00:00:00`);

            for (const slotInfo of slotDataList) {
                const { ref: slotRef, data: slot } = slotInfo;

                // Final Capacity Check inside transaction
                // Count UNIQUE students that overlap with THIS specific month
                // Parse slot month to get month boundaries
                const [year, month] = slot.month.split('-').map(Number);
                const monthStart = new Date(year, month - 1, 1).getTime();
                const monthEnd = new Date(year, month, 0, 23, 59, 59).getTime();

                const uniqueActiveStudents = new Set<string>();

                (slot.enrolledStudents || []).forEach((e: any) => {
                    const startDate = e.enrolledAt?.toDate ? e.enrolledAt.toDate().getTime() : new Date(e.enrolledAt || 0).getTime();
                    const endDate = e.endsAt?.toDate ? e.endsAt.toDate().getTime() : new Date(e.endsAt).getTime();

                    // Only count if enrollment overlaps with this specific month
                    if (startDate <= monthEnd && endDate >= monthStart) {
                        uniqueActiveStudents.add(e.studentId);
                    }
                });

                if (uniqueActiveStudents.size >= slot.capacity) {
                    throw new Error(`${slot.month}: El horario se llenó en el último segundo.`);
                }

                // Append new enrollment
                const newEnrollment = {
                    studentId: studentData.id,
                    studentName: studentData.fullName,
                    enrolledAt: Timestamp.fromDate(requestedStartDate),
                    endsAt: studentData.packageEndDate ? Timestamp.fromDate(new Date(`${studentData.packageEndDate}T23:59:59`)) : Timestamp.fromDate(requestedStartDate),
                    creditsAllocated: 0,
                    attendanceRecord: []
                };

                transaction.update(slotRef, {
                    enrolledStudents: [...(slot.enrolledStudents || []), newEnrollment],
                    updatedAt: Timestamp.now()
                });
            }
        });

        // Log Activity
        await loggingService.addLog(
            `Nuevo alumno registrado: ${studentData.fullName}`,
            'SUCCESS'
        );
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
            limit(100)
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
            limit(5000)
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
            limit(5000)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as Student);
    },

    /**
     * Get students by a list of IDs (optimized - only reads specified documents)
     * Used for loading enrolled students in a specific slot without fetching all students.
     */
    async getByIds(studentIds: string[]): Promise<Student[]> {
        if (!studentIds || studentIds.length === 0) return [];

        // Firestore limits 'in' queries to 30 items, so we batch if needed
        const results: Student[] = [];
        const batchSize = 30;

        for (let i = 0; i < studentIds.length; i += batchSize) {
            const batch = studentIds.slice(i, i + batchSize);
            const q = query(
                collection(db, STUDENTS_COLLECTION),
                where('__name__', 'in', batch)
            );
            const snapshot = await getDocs(q);
            results.push(...snapshot.docs.map(doc => doc.data() as Student));
        }

        return results;
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
                seasonId: data.seasonId,
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

        console.log(`🔄 Update student ${id}:`);
        console.log(`   dateChanged: ${dateChanged}`);
        console.log(`   scheduleChanged: ${scheduleChanged}`);

        if (dateChanged || scheduleChanged) {
            const finalSchedule = updates.fixedSchedule || currentData.fixedSchedule;
            const finalStart = updates.packageStartDate !== undefined ? updates.packageStartDate : currentData.packageStartDate;
            const finalEnd = updates.packageEndDate !== undefined ? updates.packageEndDate : currentData.packageEndDate;
            const finalCategory = updates.categoryId || currentData.categoryId;

            console.log(`   ➡️ Sincronizando horarios...`);
            console.log(`   Schedule:`, finalSchedule);

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
                    console.log(`   ✅ Sincronización completada`);
                } catch (error) {
                    console.error(`   ❌ Error syncing schedule during update:`, error);
                    // We don't throw here to avoid blocking the basic update, 
                    // but the changes are already saved in the student doc.
                }
            } else {
                console.log(`   ⚠️ No schedule to sync`);
            }
        } else {
            console.log(`   ⏭️ Skipping sync - no schedule/date changes`);
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
     * Now also removes enrollments from all slots to prevent orphan records.
     */
    async delete(studentId: string, deleteFinancialData: boolean = false): Promise<void> {
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        // First, get studentData BEFORE deleting so we have the seasonId
        const studentDocSnap = await getDoc(studentRef);
        const seasonId = studentDocSnap.exists() ? studentDocSnap.data()?.seasonId : null;

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
                const q = query(
                    collection(db, STUDENTS_COLLECTION),
                    where('studentCode', '>', deletedCode),
                    orderBy('studentCode')
                );

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
                        const newCode = newVal.toString().padStart(6, '0');
                        transaction.update(docSnap.ref, { studentCode: newCode });
                    }
                });
            } else {
                // No code, just delete
                transaction.delete(studentRef);

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

        // 5. Delete Financial Data (Outside Transaction to avoid complexity/limits)
        if (deleteFinancialData) {
            try {
                // Delete Payments
                const paymentsQ = query(collection(db, PAYMENTS_COLLECTION), where('studentId', '==', studentId));
                const paymentsSnap = await getDocs(paymentsQ);
                const deletePaymentsPromises = paymentsSnap.docs.map(doc => deleteDoc(doc.ref));
                await Promise.all(deletePaymentsPromises);

                // Delete Debts
                const debtsQ = query(collection(db, 'debts'), where('studentId', '==', studentId));
                const debtsSnap = await getDocs(debtsQ);
                const deleteDebtsPromises = debtsSnap.docs.map(doc => deleteDoc(doc.ref));
                await Promise.all(deleteDebtsPromises);

                console.log(`Eliminados ${paymentsSnap.size} pagos y ${debtsSnap.size} deudas del alumno ${studentId}`);
            } catch (error) {
                console.error("Error cleaning up financial data:", error);
            }
        }

        // 6. ALWAYS Remove enrollments from all slots
        if (seasonId) {
            try {
                const slotsQ = query(
                    collection(db, 'monthly_slots'),
                    where('seasonId', '==', seasonId)
                );
                const slotsSnap = await getDocs(slotsQ);

                const batch = writeBatch(db);
                let removedCount = 0;

                for (const slotDoc of slotsSnap.docs) {
                    const enrollments = slotDoc.data().enrolledStudents || [];
                    const filtered = enrollments.filter((e: any) => e.studentId !== studentId);

                    if (filtered.length !== enrollments.length) {
                        batch.update(slotDoc.ref, { enrolledStudents: filtered });
                        removedCount += enrollments.length - filtered.length;
                    }
                }

                if (removedCount > 0) {
                    await batch.commit();
                    console.log(`Eliminadas ${removedCount} inscripciones del alumno ${studentId} de los horarios`);
                }
            } catch (error) {
                console.error("Error removing student enrollments from slots:", error);
            }
        }
    },

    /**
     * CLEANUP TOOL: Remove payments and debts that have no valid student
     */
    async cleanupOrphanedData(): Promise<{ paymentsRemoved: number, debtsRemoved: number }> {
        // 1. Get all Student IDs
        const studentsSnap = await getDocs(collection(db, STUDENTS_COLLECTION));
        const studentIds = new Set(studentsSnap.docs.map(d => d.id));

        // 2. Check Payments
        const paymentsSnap = await getDocs(collection(db, PAYMENTS_COLLECTION));
        let paymentsRemoved = 0;
        const paymentDeletions = [];

        for (const docSnap of paymentsSnap.docs) {
            const data = docSnap.data();
            if (data.studentId && !studentIds.has(data.studentId)) {
                paymentDeletions.push(deleteDoc(docSnap.ref));
                paymentsRemoved++;
            }
        }
        await Promise.all(paymentDeletions);

        // 3. Check Debts
        const debtsSnap = await getDocs(collection(db, 'debts'));
        let debtsRemoved = 0;
        const debtDeletions = [];

        for (const docSnap of debtsSnap.docs) {
            const data = docSnap.data();
            if (data.studentId && !studentIds.has(data.studentId)) {
                debtDeletions.push(deleteDoc(docSnap.ref));
                debtsRemoved++;
            }
        }
        await Promise.all(debtDeletions);

        return { paymentsRemoved, debtsRemoved };
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
            // 1. READ ALL NECESSARY DATA FIRST
            const debtDoc = await transaction.get(debtRef);
            if (!debtDoc.exists()) throw new Error("Deuda no encontrada");

            const debt = debtDoc.data() as Debt;
            studentId = debt.studentId;

            // Fetch student for snapshot (READ)
            const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
            const studentDoc = await transaction.get(studentRef);

            if (debt.status !== 'PENDING') throw new Error("La deuda ya está pagada");

            // 2. CALCULATE NEW STATE
            const newPaid = debt.amountPaid + amount;
            const newBalance = debt.amountTotal - newPaid;
            const newStatus = newBalance < 0.5 ? 'PAID' : 'PENDING';

            const studentName = studentDoc.exists() ? studentDoc.data().fullName : 'Unknown';
            const studentDni = studentDoc.exists() ? studentDoc.data().dni : '';

            // 3. EXECUTE WRITES
            transaction.update(debtRef, {
                amountPaid: newPaid,
                balance: newBalance,
                status: newStatus
            });

            // Check if student has other debts
            // Need to know if we should clear the 'hasDebt' flag on student.
            // Since we can't query inside transaction easily for "other debts" without reading them all,
            // we will optimistically clear it IF this cleared the debt, 
            // BUT technically other debts might exist. 
            // Ideally we query "getDebts" outside or read them?
            // "Firestore transactions require all reads..."
            // Queries inside transactions are tricky if index requirements.
            // For now, let's just proceed with the payment logic.
            // The "hasDebt" flag on student is usually a summary.
            // If we want to update it, we should check remaining debts.
            // But let's fix the crash first.

            const newPayment: Payment = {
                id: paymentRef.id,
                studentId: debt.studentId,
                studentName: studentName,
                studentDni: studentDni,
                amount: amount,
                method: method,
                type: newStatus === 'PAID' ? 'FULL' : 'PARTIAL',
                seasonId: studentDoc.exists() ? studentDoc.data().seasonId : undefined,
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
     * Helper: Unenroll a student from all monthly slots in the active season.
     * This is used when updating a student's schedule to remove them from old slots.
     */
    async _unenrollStudentFromAllSlots(
        studentId: string,
        seasonId: string
    ): Promise<number> {
        const { monthlyScheduleService } = await import('./monthlyScheduleService');
        const { db } = await import('../lib/firebase');
        const { collection, query, where, getDocs } = await import('firebase/firestore');

        // Find all monthly slots that contain this student
        const q = query(
            collection(db, 'monthly_slots'),
            where('seasonId', '==', seasonId)
        );

        const snapshot = await getDocs(q);
        let unenrolled = 0;

        console.log(`🔍 Buscando inscripciones del alumno ${studentId} en temporada ${seasonId}...`);
        console.log(`📊 Total de slots en la temporada: ${snapshot.size}`);

        for (const docSnap of snapshot.docs) {
            const slot = docSnap.data();
            const enrollment = slot.enrolledStudents?.find((e: any) => e.studentId === studentId);

            if (enrollment) {
                console.log(`📍 Encontrado en slot: ${slot.timeSlot} (${slot.month}) - ID: ${docSnap.id}`);
                try {
                    await monthlyScheduleService.unenrollStudent(docSnap.id, studentId);
                    unenrolled++;
                    console.log(`✅ Desinscrito exitosamente de ${slot.timeSlot}`);
                } catch (error: any) {
                    console.error(`❌ Error desinscribiendo de ${slot.timeSlot}:`, error.message);
                }
            }
        }

        console.log(`🗑️ Alumno ${studentId} desinscrito de ${unenrolled} horarios mensuales`);
        return unenrolled;
    },

    /**
     * Helper: Syncs a student's fixed schedule to existing monthly slots in the DB.
     * This enrolls the student in all monthly slots that match their schedule for the current season.
     * Includes capacity validation and provides detailed error messages.
     * 
     * IMPORTANT: This function first removes the student from ALL existing slots in the season,
     * then enrolls them in the new slots. This ensures clean schedule transitions.
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

        // Get active season
        const activeSeason = await seasonService.getActiveSeason();
        if (!activeSeason) throw new Error('No hay temporada activa.');

        // STEP 1: Remove student from ALL existing monthly slots in this season
        // This ensures the student is only enrolled in their current schedule
        await this._unenrollStudentFromAllSlots(studentId, activeSeason.id);

        // STEP 2: Get matching slots for the new schedule
        const slotsInfo = await this._getMatchingSlots(activeSeason, fixedSchedule, packageStartDate, packageEndDate, categoryId);
        const { matchingSlots } = slotsInfo;

        // STEP 3: Enroll student in new slots
        let enrolled = 0;
        const errors: string[] = [];

        console.log(`📝 Intentando inscribir en ${matchingSlots.length} slots nuevos...`);

        for (const slot of matchingSlots) {
            try {
                console.log(`➕ Inscribiendo en: ${slot.timeSlot} (${slot.month})`);
                await monthlyScheduleService.enrollStudent(slot.id, studentId);
                enrolled++;
                console.log(`✅ Inscrito exitosamente`);
            } catch (error: any) {
                // Ignore if already enrolled (shouldn't happen after unenroll, but just in case)
                if (!error.message?.includes('ya está inscrito')) {
                    console.error(`❌ Error inscribiendo:`, error.message);
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

        // Capacity Check - verify slots have space for this student

        // Fetch ALL active student IDs to ensure we only count real, active students
        const studentsQ = query(
            collection(db, 'students'),
            where('active', '==', true)
        );
        const studentsSnap = await getDocs(studentsQ);
        const activeStudentIds = new Set(studentsSnap.docs.map(d => d.id));

        const fullSlots = matchingSlots.filter(s => {
            const enrolled = s.enrolledStudents || [];

            // Parse slot month to get boundaries
            const [year, month] = s.month.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1).getTime();
            const monthEnd = new Date(year, month, 0, 23, 59, 59).getTime();

            // Use Set to count UNIQUE active students (avoid counting duplicates)
            const uniqueActiveStudents = new Set<string>();

            enrolled.forEach((enrollment: any) => {
                // ONLY count if student is marked as active in DB
                if (!activeStudentIds.has(enrollment.studentId)) return;

                const startDate = enrollment.enrolledAt?.toDate ? enrollment.enrolledAt.toDate().getTime() : new Date(enrollment.enrolledAt || 0).getTime();
                const endDate = enrollment.endsAt?.toDate ? enrollment.endsAt.toDate().getTime() : new Date(enrollment.endsAt).getTime();

                // Only count if enrollment overlaps with this specific month
                if (startDate <= monthEnd && endDate >= monthStart) {
                    uniqueActiveStudents.add(enrollment.studentId);
                }
            });

            const isFull = uniqueActiveStudents.size >= s.capacity;

            // Debug logging
            console.log(`📊 Slot ${s.timeSlot} (${s.month}):`);
            console.log(`   Total enrollments: ${enrolled.length}`);
            console.log(`   Unique active students: ${uniqueActiveStudents.size}`);
            console.log(`   Capacity: ${s.capacity}`);
            console.log(`   Full: ${isFull}`);

            return isFull;
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

    /**
     * CLEANUP UTILITY: Remove duplicate enrollments for students
     * This finds students who are enrolled in multiple time slots when they should only be in their fixedSchedule slots
     */
    async cleanupDuplicateEnrollments(seasonId?: string): Promise<{ studentsProcessed: number, duplicatesRemoved: number }> {
        const { seasonService } = await import('./seasonService');
        const { monthlyScheduleService } = await import('./monthlyScheduleService');

        // Get active season if not provided
        const activeSeason = seasonId ? { id: seasonId } : await seasonService.getActiveSeason();
        if (!activeSeason) throw new Error('No hay temporada activa.');

        console.log(`🧹 Iniciando limpieza de duplicados en temporada ${activeSeason.id}...`);

        // Get all active students
        const students = await this.getAllActive();
        let studentsProcessed = 0;
        let duplicatesRemoved = 0;

        for (const student of students) {
            if (!student.fixedSchedule || student.fixedSchedule.length === 0) continue;

            console.log(`\n👤 Procesando: ${student.fullName}`);

            // Get expected schedule
            const expectedTimeSlots = Array.from(new Set(student.fixedSchedule.map(s => s.timeId)));

            console.log(`   Horario esperado: ${expectedTimeSlots.join(', ')}`);

            // Find all slots where student is enrolled
            const q = query(
                collection(db, 'monthly_slots'),
                where('seasonId', '==', activeSeason.id)
            );
            const snapshot = await getDocs(q);

            const enrolledSlots: Array<{ id: string, timeSlot: string, month: string }> = [];

            for (const docSnap of snapshot.docs) {
                const slot = docSnap.data();
                const isEnrolled = slot.enrolledStudents?.some((e: any) => e.studentId === student.id);
                if (isEnrolled) {
                    enrolledSlots.push({
                        id: docSnap.id,
                        timeSlot: slot.timeSlot,
                        month: slot.month
                    });
                }
            }

            if (enrolledSlots.length === 0) continue;

            console.log(`   Inscrito en ${enrolledSlots.length} slots:`, enrolledSlots.map(s => `${s.timeSlot} (${s.month})`).join(', '));

            // Determine which slots are wrong (not matching fixedSchedule time)
            const wrongSlots = enrolledSlots.filter(slot => !expectedTimeSlots.includes(slot.timeSlot));

            if (wrongSlots.length > 0) {
                console.log(`   ⚠️ ${wrongSlots.length} inscripciones incorrectas detectadas`);

                for (const wrongSlot of wrongSlots) {
                    try {
                        await monthlyScheduleService.unenrollStudent(wrongSlot.id, student.id);
                        duplicatesRemoved++;
                        console.log(`   ✅ Removido de: ${wrongSlot.timeSlot} (${wrongSlot.month})`);
                    } catch (error: any) {
                        console.error(`   ❌ Error removiendo de ${wrongSlot.timeSlot}:`, error.message);
                    }
                }
            }

            studentsProcessed++;
        }

        console.log(`\n✅ Limpieza completada:`);
        console.log(`   Estudiantes procesados: ${studentsProcessed}`);
        console.log(`   Duplicados removidos: ${duplicatesRemoved}`);

        return { studentsProcessed, duplicatesRemoved };
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
            let credits = studentData.remainingCredits || 0;

            // Check if attendance for this date already exists
            const existingIndex = currentAttendance.findIndex(a => a.fecha === fecha);

            if (existingIndex >= 0) {
                const previousStatus = currentAttendance[existingIndex].asistencia;
                // Update existing record
                currentAttendance[existingIndex] = { fecha, asistencia };

                // Adjust credits if status changed
                if (previousStatus !== asistencia) {
                    if (asistencia) {
                        credits--; // Changed from False to True
                    } else {
                        credits++; // Changed from True to False
                    }
                }
            } else {
                // Add new record
                currentAttendance.push({ fecha, asistencia });
                if (asistencia) {
                    credits--; // New record True
                }
            }

            // Sort by date (newest first)
            currentAttendance.sort((a, b) => b.fecha.localeCompare(a.fecha));

            transaction.update(studentRef, {
                asistencia: currentAttendance,
                remainingCredits: credits
            });
        });
    }
};

