import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
// import { loggingService } from './logging';
import type { ScheduleTemplate, DayType } from '../types/db';

const TEMPLATES_COLLECTION = 'schedule_templates';
const DAILY_SLOTS_COLLECTION = 'daily_slots';

export const scheduleTemplateService = {
    /**
     * Get all templates
     */
    async getAll(): Promise<ScheduleTemplate[]> {
        const q = query(
            collection(db, TEMPLATES_COLLECTION),
            orderBy('timeSlot', 'asc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as ScheduleTemplate));
    },

    /**
     * Get templates by season
     */
    async getBySeason(seasonId: string): Promise<ScheduleTemplate[]> {
        const q = query(
            collection(db, TEMPLATES_COLLECTION),
            where('seasonId', '==', seasonId),
            orderBy('timeSlot', 'asc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as ScheduleTemplate));
    },

    /**
     * Get template by ID
     */
    async getById(id: string): Promise<ScheduleTemplate | null> {
        const docRef = doc(db, TEMPLATES_COLLECTION, id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return null;
        }

        return {
            ...docSnap.data(),
            id: docSnap.id,
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            updatedAt: docSnap.data().updatedAt?.toDate() || new Date()
        } as ScheduleTemplate;
    },

    /**
     * Get templates by day type
     */
    async getByDayType(seasonId: string, dayType: DayType): Promise<ScheduleTemplate[]> {
        const q = query(
            collection(db, TEMPLATES_COLLECTION),
            where('seasonId', '==', seasonId),
            where('dayType', '==', dayType),
            orderBy('timeSlot', 'asc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as ScheduleTemplate));
    },

    /**
     * Create a new template
     */
    async create(data: Omit<ScheduleTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const docRef = doc(collection(db, TEMPLATES_COLLECTION));

        const newTemplate = {
            ...data,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await setDoc(docRef, newTemplate);

        /* REMOVED LOG
        await loggingService.addLog(
            `Nueva plantilla de horario creada: ${data.timeSlot} - ${data.dayType}`,
            'SUCCESS'
        );
        */

        return docRef.id;
    },

    /**
     * Create multiple templates at once
     */
    async createBulk(templates: Omit<ScheduleTemplate, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
        const batch = writeBatch(db);
        const ids: string[] = [];

        templates.forEach(template => {
            const docRef = doc(collection(db, TEMPLATES_COLLECTION));
            ids.push(docRef.id);

            batch.set(docRef, {
                ...template,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
        });

        await batch.commit();

        /* REMOVED LOG
        await loggingService.addLog(
            `${templates.length} plantillas de horario creadas`,
            'SUCCESS'
        );
        */

        return ids;
    },

    /**
     * Update a template
     */
    async update(id: string, data: Partial<Omit<ScheduleTemplate, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
        const docRef = doc(db, TEMPLATES_COLLECTION, id);

        await updateDoc(docRef, {
            ...data,
            updatedAt: Timestamp.now()
        });

        /* REMOVED LOG
        await loggingService.addLog(
            `Plantilla de horario actualizada: ${id}`,
            'INFO'
        );
        */
    },

    /**
     * Delete a template
     */
    async delete(id: string): Promise<void> {
        const docRef = doc(db, TEMPLATES_COLLECTION, id);
        await deleteDoc(docRef);

        /* REMOVED LOG
        await loggingService.addLog(
            `Plantilla de horario eliminada: ${id}`,
            'WARNING'
        );
        */
    },

    /**
     * Duplicate templates from one season to another
     */
    async duplicateForSeason(sourceSeasonId: string, targetSeasonId: string): Promise<number> {
        const sourceTemplates = await this.getBySeason(sourceSeasonId);

        const newTemplates = sourceTemplates.map(template => ({
            seasonId: targetSeasonId,
            dayType: template.dayType,
            timeSlot: template.timeSlot,
            categoryId: template.categoryId,
            capacity: template.capacity,
            isBreak: template.isBreak
        }));

        await this.createBulk(newTemplates);

        /* REMOVED LOG
        await loggingService.addLog(
            `${newTemplates.length} plantillas duplicadas a nueva temporada`,
            'SUCCESS'
        );
        */

        return newTemplates.length;
    },

    /**
     * Generate daily slots from templates for a date range (String dates required: YYYY-MM-DD)
     */
    async generateDailySlots(seasonId: string, startDateStr: string, endDateStr: string): Promise<number> {
        const templates = await this.getBySeason(seasonId);

        if (templates.length === 0) {
            throw new Error('No hay plantillas de horario para esta temporada');
        }

        // Helper to parse "YYYY-MM-DD" into a local Date object (00:00:00)
        const parseDate = (str: string) => {
            const [y, m, d] = str.split('-').map(Number);
            return new Date(y, m - 1, d);
        };

        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);

        // Ensure end date handles the full day
        endDate.setHours(23, 59, 59, 999);

        // STEP 1: Delete existing slots in this date range to avoid conflicts
        const existingSlotsQuery = query(
            collection(db, DAILY_SLOTS_COLLECTION),
            where('date', '>=', startDateStr),
            where('date', '<=', endDateStr)
        );

        const existingSnapshot = await getDocs(existingSlotsQuery);

        if (!existingSnapshot.empty) {
            const deleteBatch = writeBatch(db);
            existingSnapshot.docs.forEach(docSnapshot => {
                deleteBatch.delete(doc(db, DAILY_SLOTS_COLLECTION, docSnapshot.id));
            });
            await deleteBatch.commit();

            /* REMOVED LOG
            await loggingService.addLog(
                `${existingSnapshot.size} slots existentes eliminados antes de regenerar`,
                'INFO'
            );
            */
        }

        // STEP 2: Create new slots
        const batch = writeBatch(db);
        let slotsCreated = 0;

        // Map day types to actual days of week
        const dayTypeMap: Record<DayType, number[]> = {
            'lun-mier-vier': [1, 3, 5], // Monday, Wednesday, Friday
            'mar-juev': [2, 4], // Tuesday, Thursday
            'sab-dom': [6, 0] // Saturday, Sunday
        };

        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday

            // Format current date back to YYYY-MM-DD string locally
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            // Find templates that apply to this day
            const applicableTemplates = templates.filter(template =>
                dayTypeMap[template.dayType].includes(dayOfWeek)
            );

            // Create a slot for each applicable template
            applicableTemplates.forEach(template => {
                const slotId = `${dateStr}_${template.timeSlot.replace(':', '-')}`;
                const slotRef = doc(db, DAILY_SLOTS_COLLECTION, slotId);

                batch.set(slotRef, {
                    id: slotId,
                    date: dateStr,
                    dayType: template.dayType, // Add dayType from template
                    scheduleTemplateId: template.id,
                    seasonId: seasonId,
                    categoryId: template.categoryId,
                    timeSlot: template.timeSlot,
                    timeId: template.timeSlot.replace(':', '-'), // Legacy field
                    capacity: template.capacity,
                    attendeeIds: [],
                    locks: [],
                    isBreak: template.isBreak ?? false,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });

                slotsCreated++;
            });

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

        await batch.commit();

        /* REMOVED LOG
        await loggingService.addLog(
            `${slotsCreated} slots diarios generados desde plantillas (${startDateStr} a ${endDateStr})`,
            'SUCCESS'
        );
        */

        return slotsCreated;
    },

    /**
     * Get templates grouped by time slot
     */
    async getGroupedByTimeSlot(seasonId: string): Promise<Record<string, ScheduleTemplate[]>> {
        const templates = await this.getBySeason(seasonId);

        return templates.reduce((acc, template) => {
            if (!acc[template.timeSlot]) {
                acc[template.timeSlot] = [];
            }
            acc[template.timeSlot].push(template);
            return acc;
        }, {} as Record<string, ScheduleTemplate[]>);
    }
};
