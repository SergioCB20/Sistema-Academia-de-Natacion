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
    Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
// import { loggingService } from './logging';
import type { Category } from '../types/db';

const CATEGORIES_COLLECTION = 'categories';

export const categoryService = {
    /**
     * Get all categories
     */
    async getAll(): Promise<Category[]> {
        const q = query(
            collection(db, CATEGORIES_COLLECTION),
            orderBy('order', 'asc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as Category));
    },

    /**
     * Get only active categories
     */
    async getActive(): Promise<Category[]> {
        const q = query(
            collection(db, CATEGORIES_COLLECTION),
            where('isActive', '==', true),
            orderBy('order', 'asc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as Category));
    },

    /**
     * Get category by ID
     */
    async getById(id: string): Promise<Category | null> {
        const docRef = doc(db, CATEGORIES_COLLECTION, id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return null;
        }

        return {
            ...docSnap.data(),
            id: docSnap.id,
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            updatedAt: docSnap.data().updatedAt?.toDate() || new Date()
        } as Category;
    },

    /**
     * Create a new category
     */
    async create(data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const docRef = doc(collection(db, CATEGORIES_COLLECTION));

        const newCategory = {
            ...data,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await setDoc(docRef, newCategory);

        /* REMOVED LOG
        await loggingService.addLog(
            `Nueva categoría creada: ${data.name}`,
            'SUCCESS'
        );
        */

        return docRef.id;
    },

    /**
     * Update a category
     */
    async update(id: string, data: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
        const docRef = doc(db, CATEGORIES_COLLECTION, id);

        await updateDoc(docRef, {
            ...data,
            updatedAt: Timestamp.now()
        });

        /* REMOVED LOG
        await loggingService.addLog(
            `Categoría actualizada: ${id}`,
            'INFO'
        );
        */
    },

    /**
     * Delete a category (soft delete by setting isActive to false)
     */
    async delete(id: string): Promise<void> {
        const docRef = doc(db, CATEGORIES_COLLECTION, id);

        await updateDoc(docRef, {
            isActive: false,
            updatedAt: Timestamp.now()
        });

        /* REMOVED LOG
        await loggingService.addLog(
            `Categoría desactivada: ${id}`,
            'WARNING'
        );
        */
    },

    /**
     * Hard delete a category (use with caution)
     */
    async hardDelete(id: string): Promise<void> {
        const docRef = doc(db, CATEGORIES_COLLECTION, id);
        await deleteDoc(docRef);

        /* REMOVED LOG
        await loggingService.addLog(
            `Categoría eliminada permanentemente: ${id}`,
            'ERROR'
        );
        */
    },

    /**
     * Reorder categories
     */
    async reorder(categoryIds: string[]): Promise<void> {
        const batch = categoryIds.map((id, index) => {
            const docRef = doc(db, CATEGORIES_COLLECTION, id);
            return updateDoc(docRef, {
                order: index,
                updatedAt: Timestamp.now()
            });
        });

        await Promise.all(batch);

        /* REMOVED LOG
        await loggingService.addLog(
            `Categorías reordenadas`,
            'INFO'
        );
        */
    },

    /**
     * Find category by age
     */
    async findByAge(age: number): Promise<Category | null> {
        const categories = await this.getActive();

        return categories.find(cat =>
            age >= cat.ageRange.min && age <= cat.ageRange.max
        ) || null;
    }
};
