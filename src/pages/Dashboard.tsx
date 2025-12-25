import { useEffect, useState } from 'react';
import { dashboardService } from '../services/dashboard';
import { loggingService } from '../services/logging';
import { SystemLog } from '../types/db';
import { Clock, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

import { Calendar } from 'lucide-react';

export default function Dashboard() {
    const [stats, setStats] = useState({
        activeStudents: 0,
        newStudentsMonth: 0,
        incomeToday: 0
    });
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [loading, setLoading] = useState(true);
    const [loadingLogs, setLoadingLogs] = useState(false);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const statsData = await dashboardService.getStats();
                setStats(statsData);
            } catch (error) {
                console.error("Error loading stats:", error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();
    }, []);

    useEffect(() => {
        const loadLogs = async () => {
            setLoadingLogs(true);
            try {
                // When selecting a date, we use the date filter. 
                // Note: The previous logic was just "Recent Logs", but now we default to "Today" via selectedDate init
                const logsData = await loggingService.getLogsByDate(selectedDate);
                setLogs(logsData);
            } catch (error) {
                console.error("Error loading logs:", error);
            } finally {
                setLoadingLogs(false);
            }
        };

        loadLogs();
    }, [selectedDate]);

    const getLogIcon = (type: string) => {
        switch (type) {
            case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'WARNING': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'ERROR': return <XCircle className="w-5 h-5 text-red-500" />;
            default: return <Info className="w-5 h-5 text-sky-500" />;
        }
    };

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-slate-800">Panel de Control</h2>
                <span className="text-sm text-slate-500">{new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DashboardCard title="Alumnos Activos" value={loading ? '...' : stats.activeStudents} />
                <DashboardCard title="Nuevos (Mes)" value={loading ? '...' : stats.newStudentsMonth} />
                <DashboardCard title="Ingresos (Hoy)" value={loading ? '...' : `S/ ${stats.incomeToday.toFixed(2)}`} />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-slate-400" />
                        <h3 className="font-bold text-slate-800">Actividad del Día</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <input
                            type="date"
                            className="text-sm border-none bg-slate-50 rounded-lg text-slate-600 focus:ring-0 cursor-pointer"
                            value={selectedDate.toISOString().split('T')[0]}
                            onChange={(e) => {
                                if (e.target.value) {
                                    // Store date as local date to avoid timezone issues when querying
                                    const [y, m, d] = e.target.value.split('-').map(Number);
                                    setSelectedDate(new Date(y, m - 1, d));
                                }
                            }}
                        />
                    </div>
                </div>
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                    {loadingLogs ? (
                        <div className="p-8 text-center text-slate-400">Cargando actividad...</div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">No hay actividad para este día</div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                                <div className="mt-1">{getLogIcon(log.type)}</div>
                                <div className="flex-1">
                                    <p className="text-slate-800 font-medium text-sm">{log.text}</p>
                                    <p className="text-slate-400 text-xs mt-1">
                                        {formatTime(log.timestamp)}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function DashboardCard({ title, value }: { title: string, value: string | number }) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</h3>
            <p className="text-3xl font-bold text-slate-800 mt-2">{value}</p>
        </div>
    );
}

