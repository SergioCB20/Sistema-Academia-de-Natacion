import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { studentService } from './students';

export const dashboardService = {
    /**
     * Get aggregated stats for the dashboard
     */
    async getStats() {
        // Parallelize fetching for performance
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();

        const [
            classesToday,
            activeStudents,
            newStudentsMonth,
            incomeToday
        ] = await Promise.all([
            this.getClassesTodayCount(now),
            studentService.getActiveStudentsCount(),
            studentService.getNewStudentsCount(now.getMonth(), now.getFullYear()),
            this.getIncomeToday(startOfDay, endOfDay)
        ]);

        return {
            classesToday,
            activeStudents,
            newStudentsMonth,
            incomeToday
        };
    },

    /**
     * Get count of classes for a specific date
     */
    async getClassesTodayCount(date: Date): Promise<number> {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const q = query(
            collection(db, 'daily_slots'),
            where('date', '==', dateStr)
        );
        const snap = await getDocs(q);
        return snap.size;
    },

    /**
     * Get total income for today
     */
    async getIncomeToday(startMs: number, endMs: number): Promise<number> {
        const q = query(
            collection(db, 'payments'),
            where('date', '>=', startMs),
            where('date', '<=', endMs)
        );

        const snap = await getDocs(q);
        let total = 0;
        snap.docs.forEach(doc => {
            const data = doc.data();
            total += (data.amount || 0);
        });
        return total;
    }
};
