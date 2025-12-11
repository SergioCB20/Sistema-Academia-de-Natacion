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
import { loggingService } from './logging';
import type { Package } from '../types/db';

const PACKAGES_COLLECTION = 'packages';

export const packageService = {
    /**
     * Get all packages
     */
    async getAll(): Promise<Package[]> {
        const q = query(
            collection(db, PACKAGES_COLLECTION),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as Package));
    },

    /**
     * Get packages by season
     */
    async getBySeason(seasonId: string): Promise<Package[]> {
        const q = query(
            collection(db, PACKAGES_COLLECTION),
            where('seasonId', '==', seasonId),
            where('isActive', '==', true),
            orderBy('price', 'asc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date()
        } as Package));
    },

    /**
     * Get package by ID
     */
    async getById(id: string): Promise<Package | null> {
        const docRef = doc(db, PACKAGES_COLLECTION, id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return null;
        }

        return {
            ...docSnap.data(),
            id: docSnap.id,
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            updatedAt: docSnap.data().updatedAt?.toDate() || new Date()
        } as Package;
    },

    /**
     * Get available packages for a specific category and season
     */
    async getAvailablePackages(categoryId: string, seasonId: string): Promise<Package[]> {
        const packages = await this.getBySeason(seasonId);

        return packages.filter(pkg =>
            pkg.applicableCategories.includes('all') ||
            pkg.applicableCategories.includes(categoryId)
        );
    },

    /**
     * Validate if a package is compatible with a student's category
     */
    async validatePackageForStudent(packageId: string, studentCategoryId: string): Promise<boolean> {
        const pkg = await this.getById(packageId);

        if (!pkg) {
            return false;
        }

        return pkg.applicableCategories.includes('all') ||
            pkg.applicableCategories.includes(studentCategoryId);
    },

    /**
     * Create a new package
     */
    async create(data: Omit<Package, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const docRef = doc(collection(db, PACKAGES_COLLECTION));

        const newPackage = {
            ...data,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await setDoc(docRef, newPackage);

        await loggingService.addLog(
            `Nuevo paquete creado: ${data.name} - S/ ${data.price}`,
            'SUCCESS'
        );

        return docRef.id;
    },

    /**
     * Update a package
     */
    async update(id: string, data: Partial<Omit<Package, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
        const docRef = doc(db, PACKAGES_COLLECTION, id);

        await updateDoc(docRef, {
            ...data,
            updatedAt: Timestamp.now()
        });

        await loggingService.addLog(
            `Paquete actualizado: ${id}`,
            'INFO'
        );
    },

    /**
     * Delete a package (soft delete)
     */
    async delete(id: string): Promise<void> {
        const docRef = doc(db, PACKAGES_COLLECTION, id);

        await updateDoc(docRef, {
            isActive: false,
            updatedAt: Timestamp.now()
        });

        await loggingService.addLog(
            `Paquete desactivado: ${id}`,
            'WARNING'
        );
    },

    /**
     * Hard delete a package
     */
    async hardDelete(id: string): Promise<void> {
        const docRef = doc(db, PACKAGES_COLLECTION, id);
        await deleteDoc(docRef);

        await loggingService.addLog(
            `Paquete eliminado permanentemente: ${id}`,
            'ERROR'
        );
    },

    /**
     * Duplicate package for a new season
     */
    async duplicateForSeason(packageId: string, newSeasonId: string, priceAdjustment?: number): Promise<string> {
        const originalPackage = await this.getById(packageId);

        if (!originalPackage) {
            throw new Error('Paquete original no encontrado');
        }

        const newPrice = priceAdjustment !== undefined
            ? originalPackage.price + priceAdjustment
            : originalPackage.price;

        const newPackageData: Omit<Package, 'id' | 'createdAt' | 'updatedAt'> = {
            ...originalPackage,
            seasonId: newSeasonId,
            price: newPrice
        };

        const newId = await this.create(newPackageData);

        await loggingService.addLog(
            `Paquete duplicado para nueva temporada: ${originalPackage.name}`,
            'INFO'
        );

        return newId;
    },

    /**
     * Get packages grouped by schedule type
     */
    async getByScheduleType(seasonId: string, scheduleType: string): Promise<Package[]> {
        const packages = await this.getBySeason(seasonId);

        return packages.filter(pkg =>
            pkg.scheduleTypes.includes(scheduleType as any)
        );
    }
};
