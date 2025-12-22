import {
    collection,
    doc,
    updateDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    runTransaction,
    writeBatch,
    arrayUnion,
    arrayRemove
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
        // Use id field for document reference (handles empty DNI case)
        const studentRef = doc(db, STUDENTS_COLLECTION, studentData.id);
        const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
        const debtRef = doc(collection(db, 'debts'));

        await runTransaction(db, async (transaction) => {
            // 1. Check if student exists
            const existing = await transaction.get(studentRef);
            if (existing.exists()) {
                throw new Error("El alumno ya existe (DNI duplicado).");
            }

            // 1.5 Validate Capacity for Fixed Schedule
            // Ideally we use count() aggregation, but inside a transaction we need to read to lock?
            // Count queries are not yet supported directly inside Node SDK transactions in all versions, 
            // but standard query get is. For efficiency in high scale, we might need a counter doc.
            // For now (<100 students), reading the query size is OK.

            // Check each requested slot
            // 1.5 Validate Capacity for Fixed Schedule
            // We check for each slot if the group is full (Capacity 12 hardcoded for now or from master)
            // TODO: Implement `fixedScheduleTags` array for efficient querying.
            // For now, we allow creation without strict capacity check.
            if (studentData.fixedSchedule && studentData.fixedSchedule.length > 0) {
                // Placeholder for future validation
            }

            let remainingCredits = 0;
            let hasDebt = false;

            // 2. Handle Payment Logic
            if (paymentData) {
                const { amountPaid, totalCost, credits, method } = paymentData;
                remainingCredits = credits;

                const isPartial = amountPaid < totalCost;
                hasDebt = isPartial;

                // Create Payment Log
                const newPayment: Payment = {
                    id: paymentRef.id,
                    studentId: studentData.id, // Use id instead of dni
                    amount: amountPaid,
                    credits: credits,
                    method: method,
                    type: isPartial ? 'PARTIAL' : 'FULL',
                    date: Date.now(),
                    createdBy: 'admin' // TODO: Get from Auth Context
                };
                transaction.set(paymentRef, newPayment);

                // Create Debt Record if partial
                if (isPartial) {
                    const newDebt: Debt = {
                        id: debtRef.id,
                        studentId: studentData.id, // Use id instead of dni
                        slotId: 'MATRICULA_INICIAL',
                        amountTotal: totalCost,
                        amountPaid: amountPaid,
                        balance: totalCost - amountPaid,
                        dueDate: Date.now() + (7 * 24 * 60 * 60 * 1000), // Default 7 days
                        status: 'PENDING'
                    };
                    transaction.set(debtRef, newDebt);
                }
            }

            // 3. Create Student
            // If DNI is empty, populate it with the id
            const finalDni = studentData.dni || studentData.id;

            const newStudent: Student = {
                ...studentData,
                dni: finalDni, // Ensure dni is populated
                active: true,
                remainingCredits: remainingCredits,
                hasDebt: hasDebt,
                createdAt: Date.now()
            };
            transaction.set(studentRef, newStudent);
        });

        // Log Activity
        await loggingService.addLog(
            `Nuevo alumno registrado: ${studentData.fullName}`,
            'SUCCESS'
        );

        // Post-creation: Sync fixed schedule to existing daily slots
        if (studentData.fixedSchedule && studentData.fixedSchedule.length > 0) {
            // We don't await this to keep UI responsive? Or we do?
            // Better to await to ensure consistency before UI reload.
            try {
                await this.syncFixedScheduleToSlots(studentData.id, studentData.fixedSchedule);
            } catch (e) {
                console.error("Error syncing slots:", e);
                // Non-fatal error
            }
        }
    },

    /**
     * Search students by partial name match (simulated with >= and <=)
     * Note: Firestore doesn't support full-text search natively without extra tools.
     * For small datasets, client-side filtering might be better if we fetch all active students.
     * Here we just fetch active ones.
     */
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
     * Adds credits to a student via a Payment transaction.
     * Updates 'students' (remainingCredits) and creates 'payments' log atomically.
     */
    async addCredits(
        studentId: string,
        credits: number,
        amount: number,
        method: PaymentMethod,
        createdBy: string
    ): Promise<string> {
        const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        await runTransaction(db, async (transaction) => {
            const studentDoc = await transaction.get(studentRef);
            if (!studentDoc.exists()) {
                throw new Error("Estudiante no encontrado");
            }

            const currentCredits = studentDoc.data().remainingCredits || 0;

            // Create Payment Log
            const newPayment: Payment = {
                id: paymentRef.id,
                studentId,
                amount,
                credits,
                method,
                type: 'FULL', // Defaulting to FULL for credit addition
                date: Date.now(),
                createdBy
            };

            transaction.set(paymentRef, newPayment);

            // Update Student Balance
            transaction.update(studentRef, {
                remainingCredits: currentCredits + credits
            });
        });

        // We can't easily get the student name inside transaction return without reading, 
        // but we can just use ID or Fetch.
        // For optimization let's just log ID or simple message.
        await loggingService.addLog(
            `Alumno ${studentId} adquirió ${credits} clases (S/ ${amount})`,
            'SUCCESS'
        );

        return paymentRef.id;
    },

    /**
     * Updates student basic info.
     */
    async update(studentId: string, data: Partial<Omit<Student, 'id' | 'remainingCredits' | 'hasDebt'>>): Promise<void> {
        const ref = doc(db, STUDENTS_COLLECTION, studentId);
        await updateDoc(ref, data);

        // If fixedSchedule was updated, sync slots
        if (data.fixedSchedule) {
            try {
                await this.syncFixedScheduleToSlots(studentId, data.fixedSchedule);
            } catch (e) {
                console.error("Error syncing slots on update:", e);
            }
        }
    },

    /**
     * Hard deletes a student.
     * WARNING: This can orphan related records (payments, debts) if not handled.
     */
    async delete(studentId: string): Promise<void> {
        const ref = doc(db, STUDENTS_COLLECTION, studentId);
        await deleteDoc(ref);
    },

    /**
     * Soft deletes/reactivates a student.
     */
    async toggleActive(studentId: string, active: boolean): Promise<void> {
        const ref = doc(db, STUDENTS_COLLECTION, studentId);
        await updateDoc(ref, { active });
    },

    /**
     * Helper: Syncs a student's fixed schedule to existing daily slots in the DB.
     * This is useful after registration or schedule change.
     * It looks ahead 4 weeks.
     */
    async syncFixedScheduleToSlots(studentId: string, fixedSchedule: Array<{ dayId: string, timeId: string }>): Promise<void> {
        // fixedSchedule now stores individual days (e.g., "LUN") in dayId field
        // and timeSlot (e.g., "13:00-14:00") in timeId field

        const batch = writeBatch(db);
        let operations = 0;
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 28);

        const q = query(
            collection(db, 'daily_slots'),
            where('date', '>=', today.toISOString().split('T')[0]),
            where('date', '<=', endDate.toISOString().split('T')[0])
        );

        const snapshot = await getDocs(q);

        // Create a set of schedule patterns for quick lookup
        // Each entry is "DAYNAME_timeSlot" (e.g., "LUN_13:00-14:00")
        const scheduleSet = new Set(
            fixedSchedule.map(s => `${s.dayId}_${s.timeId}`)
        );

        const dayNames = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();

            if (data.date && data.timeSlot) {
                // Determine day of week for this slot from its date string
                const slotDate = new Date(data.date + 'T12:00:00');
                const dayOfWeek = slotDate.getDay();
                const dayName = dayNames[dayOfWeek];

                const slotKey = `${dayName}_${data.timeSlot}`;

                if (scheduleSet.has(slotKey)) {
                    batch.update(docSnap.ref, {
                        attendeeIds: arrayUnion(studentId)
                    });
                    operations++;
                } else {
                    // If student was previously in this slot but it's no longer in their fixed schedule, remove them
                    batch.update(docSnap.ref, {
                        attendeeIds: arrayRemove(studentId)
                    });
                    operations++;
                }
            }
        });

        if (operations > 0) {
            await batch.commit();
        }
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

            const newPayment: Payment = {
                id: paymentRef.id,
                studentId: debt.studentId,
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

        await loggingService.addLog(
            `Alumno ${studentId} pagó deuda de S/ ${amount}`,
            'SUCCESS'
        );
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
     * Get count of active students
     */
    async getActiveStudentsCount(): Promise<number> {
        const q = query(
            collection(db, STUDENTS_COLLECTION),
            where('active', '==', true)
        );
        // Using getCountFromServer if available would be cheaper, but for now:
        const snap = await getDocs(q);
        return snap.size;
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
    }
};
