import {
    collection,
    doc,
    getDocs,
    query,
    where,
    runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { DailySlot, AttendanceLog } from '../types/db';

const DAILY_SLOTS_COLLECTION = 'daily_slots';
const STUDENTS_COLLECTION = 'students';
const ATTENDANCE_COLLECTION = 'attendances';

export const scheduleService = {
    /**
     * Get slots for a date range (string YYYY-MM-DD)
     */
    async getRangeSlots(startDate: string, endDate: string): Promise<DailySlot[]> {
        const q = query(
            collection(db, DAILY_SLOTS_COLLECTION),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as DailySlot);
    },

    /**
     * Reserves a slot temporarily (Pre-booking).
     * Adds a lock that expires in 15 mins.
     */
    async lockSlot(slotId: string, studentId: string, tempName?: string): Promise<void> {
        const slotRef = doc(db, DAILY_SLOTS_COLLECTION, slotId);

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            if (!slotDoc.exists()) {
                throw new Error("El horario no existe.");
            }

            const slot = slotDoc.data() as DailySlot;
            const now = Date.now();

            // 1. Clean expired locks (Client side filter isn't enough for atomic operations)
            // We need to valid capacity against actual valid locks + attendees
            const validLocks = (slot.locks || []).filter(l => l.expiresAt > now);

            // 2. Check Capacity
            if (slot.attendeeIds.length + validLocks.length >= slot.capacity) {
                throw new Error("Horario Completo.");
            }

            // 3. Check if already booked or locked
            if (slot.attendeeIds.includes(studentId)) {
                throw new Error("El alumno ya está inscrito en este horario.");
            }
            if (validLocks.find(l => l.studentId === studentId)) {
                throw new Error("El alumno ya tiene una reserva en proceso.");
            }

            // 4. Add Lock
            const newLock = {
                studentId,
                tempName,
                expiresAt: now + (15 * 60 * 1000) // 15 mins
            };

            // We write back ALL locks (cleaning expired ones involved implicit cleanup)
            transaction.update(slotRef, {
                locks: [...validLocks, newLock]
            });
        });
    },

    /**
     * Confirms a pre-booked slot.
     * Deducts credit and moves from Lock to Attendees.
     */
    async confirmBooking(slotId: string, studentId: string, userId: string): Promise<void> {
        const slotRef = doc(db, DAILY_SLOTS_COLLECTION, slotId);
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
        const logRef = doc(collection(db, ATTENDANCE_COLLECTION));

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const studentDoc = await transaction.get(studentRef);

            if (!slotDoc.exists() || !studentDoc.exists()) {
                throw new Error("Error: Horario o Alumno no encontrado.");
            }

            const slot = slotDoc.data() as DailySlot;
            const student = studentDoc.data();
            const now = Date.now();

            // 1. Validate Lock
            const myLock = (slot.locks || []).find(l => l.studentId === studentId);
            if (!myLock) {
                // Allow direct booking without lock? For now, enforce lock or check capacity again.
                // If no lock, we check capacity standardly.
                if (slot.attendeeIds.length + (slot.locks || []).filter(l => l.expiresAt > now).length >= slot.capacity) {
                    throw new Error("Horario Completo (Sin reserva previa).");
                }
            } else if (myLock.expiresAt < now) {
                throw new Error("La reserva ha expirado. Intente nuevamente.");
            }

            // 1.5 Validate Debt
            if (student.hasDebt) {
                throw new Error("El alumno tiene deuda pendiente. No puede reservar.");
            }

            // 2. Validate Credits
            if (student.remainingCredits <= 0) {
                throw new Error("Saldo insuficiente de clases.");
            }

            // 3. Update Slot (Remove lock, Add attendee)
            const newLocks = (slot.locks || []).filter(l => l.studentId !== studentId); // Remove my lock
            const newAttendees = [...slot.attendeeIds, studentId];

            transaction.update(slotRef, {
                locks: newLocks,
                attendeeIds: newAttendees
            });

            // 4. Deduct Credit
            transaction.update(studentRef, {
                remainingCredits: student.remainingCredits - 1
            });

            // 5. Log Attendance
            const log: AttendanceLog = {
                id: logRef.id,
                studentId,
                slotId,
                timestamp: now,
                checkedBy: userId
            };
            transaction.set(logRef, log);
        });
    },

    /**
     * Cancels a booking.
     * Returns credit to student.
     */
    async cancelBooking(slotId: string, studentId: string): Promise<void> {
        const slotRef = doc(db, DAILY_SLOTS_COLLECTION, slotId);
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const studentDoc = await transaction.get(studentRef);

            if (!slotDoc.exists() || !studentDoc.exists()) {
                throw new Error("Documento no encontrado");
            }

            const slot = slotDoc.data() as DailySlot;
            const student = studentDoc.data();

            if (!slot.attendeeIds.includes(studentId)) {
                throw new Error("El alumno no está en este horario.");
            }

            // 1. Remove from attendees
            const newAttendees = slot.attendeeIds.filter(id => id !== studentId);
            transaction.update(slotRef, { attendeeIds: newAttendees });

            // 2. Refund Credit
            // TODO: Add Valid cancellation window check (e.g., up to 2 hours before)
            transaction.update(studentRef, {
                remainingCredits: student.remainingCredits + 1
            });
        });
    }
};
