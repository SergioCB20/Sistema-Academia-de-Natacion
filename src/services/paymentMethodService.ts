import { db } from '../lib/firebase';
import {
    collection,
    doc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc
} from 'firebase/firestore';
import { PaymentMethodConfig } from '../types/db';

const COLLECTION = 'available_payment_methods';

export const paymentMethodService = {
    async getAll(): Promise<PaymentMethodConfig[]> {
        const snap = await getDocs(collection(db, COLLECTION));
        return snap.docs
            .map(d => d.data() as PaymentMethodConfig)
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    },

    async getActive(): Promise<PaymentMethodConfig[]> {
        const all = await this.getAll();
        return all.filter(m => m.isActive);
    },

    async create(data: Omit<PaymentMethodConfig, 'id' | 'createdAt'>): Promise<void> {
        // Sanitize ID: Uppercase, replace non-alphanumeric with underscore, prevent double underscores
        const id = data.name.toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        const ref = doc(db, COLLECTION, id || 'METHOD_' + Date.now());

        const newMethod: PaymentMethodConfig = {
            ...data,
            id,
            createdAt: Date.now()
        };

        await setDoc(ref, newMethod);
    },

    async update(id: string, data: Partial<Omit<PaymentMethodConfig, 'id'>>): Promise<void> {
        const ref = doc(db, COLLECTION, id);
        await updateDoc(ref, data);
    },

    async delete(id: string): Promise<void> {
        const ref = doc(db, COLLECTION, id);
        await deleteDoc(ref);
    },

    // Seed initial methods if collection is empty
    async seedInitial(): Promise<void> {
        const existing = await this.getAll();
        if (existing.length === 0) {
            await this.create({ name: 'Efectivo', isActive: true });
            await this.create({ name: 'Yape / Plin', isActive: true });
        }
    }
};
