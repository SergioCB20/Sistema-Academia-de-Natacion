import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Payment } from '../types/db';

export interface DailyFinanceData {
    day: number;
    total: number;
    methods: Record<string, number>; // Dynamic totals per method ID
}

export const financeService = {
    async getMonthlyIncome(year: number, month: number): Promise<DailyFinanceData[]> {
        const start = new Date(year, month, 1).getTime();
        const end = new Date(year, month + 1, 0, 23, 59, 59).getTime();

        const q = query(
            collection(db, 'payments'),
            where('date', '>=', start),
            where('date', '<=', end)
        );

        const snap = await getDocs(q);
        const payments = snap.docs.map(doc => doc.data() as Payment);

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyData: DailyFinanceData[] = Array.from({ length: daysInMonth }, (_, i) => ({
            day: i + 1,
            total: 0,
            methods: {}
        }));

        payments.forEach(p => {
            const date = new Date(p.date);
            const day = date.getDate();
            const entry = dailyData[day - 1];

            if (entry && p.amount) {
                entry.total += p.amount;
                const methodId = p.method || 'OTHER';
                entry.methods[methodId] = (entry.methods[methodId] || 0) + p.amount;
            }
        });

        return dailyData;
    },

    async getDailyReportData(date: number, seasonId?: string) {
        // Start and End of the selected day
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const start = d.getTime();
        d.setHours(23, 59, 59, 999);
        const end = d.getTime();

        let q = query(
            collection(db, 'payments'),
            where('date', '>=', start),
            where('date', '<=', end)
        );

        // Fetch all payments for the day
        const snap = await getDocs(q);
        let payments = snap.docs.map(doc => doc.data() as Payment);

        // Filter by season if provided
        if (seasonId) {
            payments = payments.filter(p => p.seasonId === seasonId);
        }

        return payments;
    }
};
