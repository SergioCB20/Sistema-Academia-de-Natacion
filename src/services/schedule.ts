import {
    collection,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    runTransaction,
    writeBatch,
    arrayUnion,
    increment
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loggingService } from './logging';
import type { DailySlot } from '../types/db';

const DAILY_SLOTS_COLLECTION = 'daily_slots';
const STUDENTS_COLLECTION = 'students';


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
    async confirmBooking(slotId: string, studentId: string, slotData?: Partial<DailySlot>): Promise<void> {
        const slotRef = doc(db, DAILY_SLOTS_COLLECTION, slotId);
        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);

        await runTransaction(db, async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const studentDoc = await transaction.get(studentRef);

            if (!studentDoc.exists()) {
                throw new Error("Alumno no encontrado.");
            }

            let slot: DailySlot;

            if (!slotDoc.exists()) {
                // If slot doesn't exist (Virtual Slot), we must create it!
                if (!slotData) {
                    throw new Error("El horario no existe y no se proporcionaron datos para crearlo.");
                }

                // Create new slot object from virtual data
                slot = {
                    ...slotData as DailySlot,
                    id: slotId,
                    attendeeIds: [], // Start empty, will add student below
                    locks: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // We don't save it yet, we just prepare the object. 
                // We will set() it at the end.
            } else {
                slot = slotDoc.data() as DailySlot;
            }

            const now = Date.now();
            const student = studentDoc.data();

            // 1. Validate Lock (Only if slot existed)
            if (slotDoc.exists()) {
                const myLock = (slot.locks || []).find(l => l.studentId === studentId);
                // ... logic for lock ...
                // Simplified for brevity/robustness: If recreating, we ignore locks usually?
                // But let's keep logic if it existed.
                if (!myLock) {
                    if (slot.attendeeIds.length + (slot.locks || []).filter(l => l.expiresAt > now).length >= slot.capacity) {
                        throw new Error("Horario Completo (Sin reserva previa).");
                    }
                } else if (myLock.expiresAt < now) {
                    throw new Error("La reserva ha expirado. Intente nuevamente.");
                }
            } else {
                // New slot: Check capacity against 0 (trivial) but just in case
                // Virtual slots usually have capacity, check just to be safe
                if (slotData && slotData.capacity && 0 >= slotData.capacity) {
                    throw new Error("Horario Completo.");
                }
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
            const newLocks = (slot.locks || []).filter(l => l.studentId !== studentId);
            const newAttendees = [...(slot.attendeeIds || []), studentId];

            // If slot didn't exist, we use SET, otherwise UPDATE
            if (!slotDoc.exists()) {
                transaction.set(slotRef, {
                    ...slot,
                    attendeeIds: newAttendees,
                    locks: newLocks
                });
            } else {
                transaction.update(slotRef, {
                    locks: newLocks,
                    attendeeIds: newAttendees
                });
            }

            // 4. Deduct Credit (LAZY - Removed)
        });

        // Trigger lazy deduction immediately
        this.processPastSessions().catch(console.error);
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
            // const student = studentDoc.data();

            if (!slot.attendeeIds.includes(studentId)) {
                throw new Error("El alumno no está en este horario.");
            }

            // 1. Remove from attendees
            const newAttendees = slot.attendeeIds.filter(id => id !== studentId);
            transaction.update(slotRef, { attendeeIds: newAttendees });

            // 2. Refund Credit
            // TODO: Add Valid cancellation window check (e.g., up to 2 hours before)
            /* REMOVED IMMEDIATE REFUND - Lazy Deduction Implementation */
            // Only refund if it was already processed (which is unlikely if we allow cancellation only for future)
            // But with new logic, we just remove attendee. Credit was never taken.
            // transaction.update(studentRef, {
            //     remainingCredits: student.remainingCredits + 1
            // });
        });

        // Trigger lazy deduction immediately
        this.processPastSessions().catch(console.error);
    },

    /**
     * Process past sessions to deduct credits from attendees.
     * Keeps manual and fixed bookings consistent.
     */
    async processPastSessions(): Promise<void> {
        // 1. Find recent past slots (e.g., last 7 days to avoid processing ancient history unnecessarily)
        // We look for slots where date < TODAY.
        // Or specific time? For simplicity and "batch" feel, just process anything from "yesterday" backwards to last 7 days.
        // Dealing with "today's passed hours" is tricky with timezone diffs on client. 
        // Let's stick to "Date < Today" for safety first, or process "Today but hour < currentHour".

        const now = new Date();
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - 7);

        // Query slots in range
        const q = query(
            collection(db, DAILY_SLOTS_COLLECTION),
            where('date', '>=', pastDate.toISOString().split('T')[0]),
            where('date', '<=', now.toISOString().split('T')[0])
        );

        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        let operations = 0;
        const nowTs = now.getTime();

        for (const docSnap of snapshot.docs) {
            const slot = docSnap.data() as DailySlot;

            // Check if slot time has passed
            const [, endStr] = (slot.timeSlot || "23:59-23:59").split('-');
            const slotDateStr = typeof slot.date === 'string' ? slot.date : new Date(slot.date).toISOString().split('T')[0];
            const slotEndTime = new Date(`${slotDateStr}T${endStr || "23:59"}:00`);

            // Buffer of 15 mins to be safe? No, if it ended, it ended.
            if (nowTs > slotEndTime.getTime()) {
                const attendeesDeducted = slot.attendeesDeducted || [];
                const attendeesToProcess = slot.attendeeIds.filter(id => !attendeesDeducted.includes(id));

                if (attendeesToProcess.length > 0) {
                    console.log(`Processing ${attendeesToProcess.length} attendees for slot ${slot.id}`);

                    const validAttendees: string[] = [];

                    // Verify students exist before updating (to avoid "No document to update" error)
                    // We process them one by one to be safe, or in parallel fetches
                    await Promise.all(attendeesToProcess.map(async (studentId) => {
                        const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
                        const studentSnap = await getDoc(doc(db, STUDENTS_COLLECTION, studentId)); // Need to import getDoc

                        if (studentSnap.exists()) {
                            // Student exists, queue credit deduction
                            batch.update(studentRef, {
                                remainingCredits: increment(-1)
                            });
                            validAttendees.push(studentId);
                        } else {
                            console.warn(`Student ${studentId} not found. Skipping credit deduction but marking as processed.`);
                            // We still mark as processed so we don't retry forever.
                            // Ideally we should also remove from attendeeIds, but let's just mark as deducted/handled.
                            validAttendees.push(studentId);
                        }
                    }));

                    if (validAttendees.length > 0) {
                        const slotRef = doc(db, DAILY_SLOTS_COLLECTION, slot.id);
                        batch.update(slotRef, {
                            attendeesDeducted: arrayUnion(...validAttendees)
                        });
                        operations++;

                        // Log activity
                        await loggingService.addLog(
                            `Procesado cobro de ${validAttendees.length} alumnos para la clase ${slotDateStr} ${slot.timeSlot}`,
                            'INFO'
                        );
                    }
                }
            }
        }

        if (operations > 0) {
            await batch.commit();
            console.log(`✅ Processed ${operations} credit deductions for past sessions.`);
        }
    }
};
