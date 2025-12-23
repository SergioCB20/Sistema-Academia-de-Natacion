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
    writeBatch,
    limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getMonthsInRange, formatMonthId } from '../utils/monthUtils';
// import { loggingService } from './logging';
import type { Season } from '../types/db';

const SEASONS_COLLECTION = 'seasons';

/**
 * Helper to delete documents in batches (Firestore limit 500)
 */
async function deleteCollectionBySeason(collectionName: string, seasonId: string) {
    while (true) {
        const q = query(
            collection(db, collectionName),
            where('seasonId', '==', seasonId),
            limit(500)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) break;

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }
}

export const seasonService = {
    /**
     * Get all seasons
     */
    async getAll(): Promise<Season[]> {
        const q = query(
            collection(db, SEASONS_COLLECTION),
            orderBy('startMonth', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as Season));
    },

    /**
     * Get active season based on current date
     */
    async getActiveSeason(): Promise<Season | null> {
        const now = new Date();
        const currentMonth = formatMonthId(now);
        const seasons = await this.getAll();

        // First, check for manually set active season
        const manuallyActive = seasons.find(s => s.isActive);
        if (manuallyActive) {
            return manuallyActive;
        }

        // Otherwise, find season that contains current month
        const currentSeason = seasons.find(s => {
            return currentMonth >= s.startMonth && currentMonth <= s.endMonth;
        });

        return currentSeason || null;
    },

    /**
     * Check if season setup is needed
     */
    async needsSeasonSetup(): Promise<boolean> {
        const activeSeason = await this.getActiveSeason();
        return activeSeason === null;
    },

    /**
     * Get season by ID
     */
    async getById(id: string): Promise<Season | null> {
        const docRef = doc(db, SEASONS_COLLECTION, id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return null;
        }

        return {
            ...docSnap.data(),
            id: docSnap.id,
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            updatedAt: docSnap.data().updatedAt?.toDate() || new Date()
        } as Season;
    },

    /**
     * Create a new season
     */
    async create(data: Omit<Season, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const docRef = doc(collection(db, SEASONS_COLLECTION));

        const newSeason = {
            ...data,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await setDoc(docRef, newSeason);

        /* REMOVED LOG
        await loggingService.addLog(
            `Nueva temporada creada: ${data.name}`,
            'SUCCESS'
        );
        */

        return docRef.id;
    },

    /**
     * Update a season
     */
    async update(id: string, data: Partial<Omit<Season, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
        const docRef = doc(db, SEASONS_COLLECTION, id);

        const updateData: any = {
            ...data,
            updatedAt: Timestamp.now()
        };

        await updateDoc(docRef, updateData);

        /* REMOVED LOG
        await loggingService.addLog(
            `Temporada actualizada: ${id}`,
            'INFO'
        );
        */
    },

    /**
     * Delete a season and all related data (CASCADING DELETE)
     */
    async delete(id: string): Promise<void> {
        // 1. Delete Daily Slots (Schedule)
        await deleteCollectionBySeason('daily_slots', id);

        // 2. Delete Students
        await deleteCollectionBySeason('students', id);

        // 3. Delete the Season itself
        const docRef = doc(db, SEASONS_COLLECTION, id);
        await deleteDoc(docRef);

        /* REMOVED LOG
        await loggingService.addLog(
            `Temporada eliminada: ${id}`,
            'WARNING'
        );
        */
    },

    /**
     * Set a season as active (deactivates all others)
     */
    async setActiveSeason(id: string): Promise<void> {
        const seasons = await this.getAll();

        // Deactivate all seasons
        const deactivatePromises = seasons.map(season => {
            const docRef = doc(db, SEASONS_COLLECTION, season.id);
            return updateDoc(docRef, {
                isActive: false,
                updatedAt: Timestamp.now()
            });
        });

        await Promise.all(deactivatePromises);

        // Activate the selected season
        const docRef = doc(db, SEASONS_COLLECTION, id);
        await updateDoc(docRef, {
            isActive: true,
            updatedAt: Timestamp.now()
        });

        /* REMOVED LOG
        await loggingService.addLog(
            `Temporada activada: ${id}`,
            'SUCCESS'
        );
        */
    },

    /**
     * Get seasons by type
     */
    async getByType(type: 'summer' | 'winter'): Promise<Season[]> {
        const q = query(
            collection(db, SEASONS_COLLECTION),
            where('type', '==', type),
            orderBy('startMonth', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as Season));
    },

    /**
     * Get array of month IDs in a season
     */
    getMonthsInSeason(season: Season): string[] {
        return getMonthsInRange(season.startMonth, season.endMonth);
    }
};
