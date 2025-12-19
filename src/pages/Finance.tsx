import { useState, useEffect } from 'react';
import { financeService, DailyFinanceData } from '../services/finance';
import { paymentMethodService } from '../services/paymentMethodService';
import { PaymentMethodConfig } from '../types/db';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, Filter } from 'lucide-react';

export default function Finance() {
    const [data, setData] = useState<DailyFinanceData[]>([]);
    const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth());
    const [methodFilter, setMethodFilter] = useState<string>('ALL');
    const [loading, setLoading] = useState(true);

    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadFinanceData();
    }, [year, month]);

    const loadInitialData = async () => {
        try {
            const meths = await paymentMethodService.getAll();
            setMethods(meths);
        } catch (error) {
            console.error("Error loading initial data:", error);
        }
    };

    const loadFinanceData = async () => {
        setLoading(true);
        try {
            const result = await financeService.getMonthlyIncome(year, month);
            setData(result);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getTotal = () => {
        return data.reduce((acc, curr) => {
            if (methodFilter === 'ALL') return acc + curr.total;
            return acc + (curr.methods[methodFilter] || 0);
        }, 0);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-slate-800">Finanzas</h2>

                <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <select
                        className="bg-transparent px-3 py-2 text-sm font-medium text-slate-700 outline-none cursor-pointer"
                        value={month}
                        onChange={(e) => setMonth(Number(e.target.value))}
                    >
                        {months.map((m, i) => (
                            <option key={i} value={i}>{m}</option>
                        ))}
                    </select>
                    <select
                        className="bg-transparent px-3 py-2 text-sm font-medium text-slate-700 outline-none border-l border-slate-200 cursor-pointer"
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                    >
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
                </div>
            ) : (
                <>
                    {/* SUMMARY CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                    <DollarSign className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-400">Total Ingresos ({months[month]})</p>
                                    <p className="text-2xl font-bold text-slate-800">S/ {getTotal().toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* CHART SECTION */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-slate-800">Ingresos Diarios</h3>
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select
                            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                            value={methodFilter}
                            onChange={(e) => setMethodFilter(e.target.value)}
                        >
                            <option value="ALL">Todo</option>
                            {methods.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="day"
                                stroke="#94a3b8"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#94a3b8"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `S/${value}`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                cursor={{ fill: '#f1f5f9' }}
                                formatter={(value: number) => [`S/ ${value.toFixed(2)}`, 'Ingreso']}
                                labelFormatter={(label) => `Día ${label} de ${months[month]}`}
                            />

                            {/* Dynamic Bar Data */}
                            <Bar
                                dataKey={methodFilter === 'ALL' ? 'total' : (d) => d.methods[methodFilter] || 0}
                                fill={methodFilter === 'ALL' ? "#3b82f6" : "#10b981"}
                                radius={[4, 4, 0, 0]}
                                maxBarSize={50}
                                name="Ingreso"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
