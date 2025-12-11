import { db } from '../lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Payment, PaymentMethod } from '../types/db';

export interface DailyFinanceData {
    day: number;
    total: number;
    cash: number;
    yape: number;
    // Add other methods if needed
}

export const financeService = {
    async getMonthlyIncome(year: number, month: number): Promise<DailyFinanceData[]> {
        // Month is 0-indexed in JS Date, but input usually 1-12 or 0-11. Let's assume 0-11.
        const start = new Date(year, month, 1).getTime();
        const end = new Date(year, month + 1, 0, 23, 59, 59).getTime();

        const q = query(
            collection(db, 'payments'),
            where('date', '>=', start),
            where('date', '<=', end)
        );

        const snap = await getDocs(q);
        const payments = snap.docs.map(doc => doc.data() as Payment);

        // Initialize array for all days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyData: DailyFinanceData[] = Array.from({ length: daysInMonth }, (_, i) => ({
            day: i + 1,
            total: 0,
            cash: 0,
            yape: 0
        }));

        payments.forEach(p => {
            const date = new Date(p.date);
            const day = date.getDate(); // 1-31
            const entry = dailyData[day - 1];

            if (entry) {
                entry.total += (p.amount || 0);
                if (p.method === 'CASH') entry.cash += (p.amount || 0);
                else if (p.method === 'YAPE') entry.yape += (p.amount || 0);
            }
        });

        return dailyData;
    }
};
