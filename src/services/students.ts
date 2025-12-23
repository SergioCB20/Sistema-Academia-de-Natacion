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
    runTransaction
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
                    studentName: studentData.fullName,
                    studentDni: studentData.dni || studentData.id,
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
                        studentName: studentData.fullName,
                        studentDni: studentData.dni || studentData.id,
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


        // Post-creation: Sync fixed schedule to existing monthly slots
        if (studentData.fixedSchedule && studentData.fixedSchedule.length > 0) {
            // DO NOT CATCH - let validation errors propagate to UI
            await this.syncFixedScheduleToMonthlySlots(
                studentData.id,
                studentData.fixedSchedule,
                studentData.packageEndDate,
                studentData.packageStartDate // Pass packageStartDate for future enrollment
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
    async update(studentId: string, data: Partial<Omit<Student, 'id' | 'remainingCredits' | 'hasDebt'>>): Promise<void> {
        const ref = doc(db, STUDENTS_COLLECTION, studentId);
        await updateDoc(ref, data);

        // If fixedSchedule was updated, sync slots
        // If fixedSchedule was updated, sync slots
        if (data.fixedSchedule) {
            try {
                // DO NOT CATCH - let validation errors propagate to UI? 
                // In update context, blocking might be annoying if data is partial. 
                // But for schedule consistency, we SHOULD block.
                await this.syncFixedScheduleToMonthlySlots(
                    studentId,
                    data.fixedSchedule,
                    data.packageEndDate,
                    data.packageStartDate
                );
            } catch (e) {
                console.error("Error syncing slots on update:", e);
                throw e; // Propagate error so UI shows it
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
        packageStartDate?: string | null
    ): Promise<void> {
        // Import services dynamically to avoid circular dependencies
        const { monthlyScheduleService } = await import('./monthlyScheduleService');
        const { seasonService } = await import('./seasonService');
        const { formatMonthId, getMonthName } = await import('../utils/monthUtils');

        // Get active season
        const activeSeason = await seasonService.getActiveSeason();
        if (!activeSeason) {
            throw new Error('No hay temporada activa. Por favor, cree una temporada primero.');
        }

        // Determine which dayType this schedule belongs to
        const dayIds = Array.from(new Set(fixedSchedule.map(s => s.dayId))).sort();
        const timeSlots = Array.from(new Set(fixedSchedule.map(s => s.timeId)));

        let dayType: 'lun-mier-vier' | 'mar-juev' | 'sab-dom' | null = null;

        // Map day combinations to dayType
        const daySet = dayIds.join(',');
        if (daySet === 'LUN,MIE,VIE') dayType = 'lun-mier-vier';
        else if (daySet === 'JUE,MAR') dayType = 'mar-juev';
        else if (daySet === 'DOM,SAB') dayType = 'sab-dom';

        if (!dayType) {
            throw new Error(`No se pudo determinar el tipo de horario (${daySet}). Por favor, seleccione un horario válido.`);
        }

        // Get start month (either current month OR package start date month if future)
        // If packageStartDate is in the past, we should probably still use current month for NEW enrollments?
        // But if it's a specific start date, maybe we should respect it?
        // Let's assume packageStartDate is strictly respected if provided.
        const currentMonth = packageStartDate
            ? formatMonthId(new Date(packageStartDate))
            : formatMonthId(new Date());

        const endMonth = packageEndDate
            ? formatMonthId(new Date(packageEndDate))
            : activeSeason.endMonth;

        // Get all monthly slots for this season that match the student's schedule
        const q = query(
            collection(db, 'monthly_slots'),
            where('seasonId', '==', activeSeason.id),
            where('dayType', '==', dayType)
        );

        const snapshot = await getDocs(q);

        // Collect matching slots and check capacity
        const matchingSlots: Array<{
            id: string,
            month: string,
            timeSlot: string,
            capacity: number,
            enrolled: number,
            isFull: boolean,
            enrolledStudents: any[]
        }> = [];

        for (const docSnap of snapshot.docs) {
            const slot = docSnap.data();

            // Check if this slot matches any of the student's time slots
            const matchesTimeSlot = timeSlots.some(ts => ts === slot.timeSlot);

            // Check if slot month is within student's package period
            const slotMonth = slot.month;
            const isWithinPeriod = slotMonth >= currentMonth && slotMonth <= endMonth;

            if (matchesTimeSlot && isWithinPeriod) {
                const enrolledCount = slot.enrolledStudents?.length || 0;
                const isFull = enrolledCount >= slot.capacity;

                matchingSlots.push({
                    id: docSnap.id,
                    month: slotMonth,
                    timeSlot: slot.timeSlot,
                    capacity: slot.capacity,
                    enrolled: enrolledCount,
                    isFull,
                    enrolledStudents: slot.enrolledStudents || []
                });
            }
        }

        if (matchingSlots.length === 0) {
            throw new Error('Fecha de inicio invalida');
        }

        // Sort by month
        matchingSlots.sort((a, b) => a.month.localeCompare(b.month));

        // Check if any slots are full at the projected start date
        const requestedStartDate = packageStartDate
            ? new Date(`${packageStartDate}T00:00:00`)
            : new Date();

        const fullSlots = matchingSlots.filter(s => {
            // Smart capacity check:
            // Count how many students will be active on the requestedStartDate
            const enrolled = s.enrolledStudents || [];

            let activeCount = 0;
            enrolled.forEach((enrollment: any) => {
                const endDate = enrollment.endsAt?.toDate
                    ? enrollment.endsAt.toDate()
                    : new Date(enrollment.endsAt);

                // A student consumes a spot if their end date is ON or AFTER our start date
                // (Assuming they free up the spot strictly after endDate)
                if (endDate >= requestedStartDate) {
                    activeCount++;
                }
            });

            return activeCount >= s.capacity;
        });

        if (fullSlots.length > 0) {
            // Find the first available slot (not full) logic (keeping existing suggestion logic but updated)
            // ... Logic to suggest next date ...

            // Re-calculate the absolute earliest availability across the full slots to guide the user
            let globalEarliestEndDate: Date | null = null;

            for (const fullSlot of fullSlots) {
                for (const enrollment of fullSlot.enrolledStudents) {
                    const endDate = enrollment.endsAt?.toDate ? enrollment.endsAt.toDate() : new Date(enrollment.endsAt);
                    // We need a date that is > all overlapping blocks? No, just finding ONE opening.
                    // Finding the min(endDate) that gives us an opening.
                    // Actually, let's keep the error message simple or reuse existing suggestion logic
                    // The existing logic found min(endDate) of ALL students.

                    if (!globalEarliestEndDate || endDate < globalEarliestEndDate) {
                        globalEarliestEndDate = endDate;
                    }
                }
            }

            const availabilityMessage = globalEarliestEndDate
                ? `\n\nSe liberará un cupo aproximadamente el ${globalEarliestEndDate.toLocaleDateString('es-PE')}.`
                : '';

            const fullMonths = fullSlots.map(s => getMonthName(s.month)).join(', ');

            throw new Error(
                `⚠️ HORARIO LLENO (FECHA OCUPADA)\n\n` +
                `Para la fecha de inicio seleccionada (${requestedStartDate.toLocaleDateString('es-PE')}), el horario está lleno en: ${fullMonths}.${availabilityMessage}\n\n` +
                `La fecha seleccionada se superpone con matrículas existentes que aún no terminan.\n` +
                `Intente con una fecha posterior a la sugerida.`
            );
        }

        // Enroll student in all available slots
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
    }
};
