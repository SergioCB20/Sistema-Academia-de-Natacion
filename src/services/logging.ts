import { db } from '../lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { SystemLog, LogType } from '../types/db';

const LOGS_COLLECTION = 'system_logs';

export const loggingService = {
    async addLog(text: string, type: LogType = 'INFO', metadata?: any) {
        try {
            await addDoc(collection(db, LOGS_COLLECTION), {
                text,
                type,
                timestamp: Date.now(),
                metadata: metadata || {}
            });
        } catch (error) {
            // Logs shouldn't break app flow, just console error
            console.error("Failed to write log:", error);
        }
    },

    async getRecentLogs(limitCount: number = 20): Promise<SystemLog[]> {
        const q = query(
            collection(db, LOGS_COLLECTION),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemLog));
    }
};
