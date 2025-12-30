import { useEffect, useState, useCallback } from 'react';
import { dashboardService } from '../services/dashboard';
import { loggingService } from '../services/logging';
import { SystemLog } from '../types/db';
import { Clock, CheckCircle, AlertTriangle, XCircle, Info, RefreshCw, Filter } from 'lucide-react';


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
    const [refreshing, setRefreshing] = useState(false);

    const loadStats = useCallback(async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const statsData = await dashboardService.getStats();
            setStats(statsData);
        } catch (error) {
            console.error("Error loading stats:", error);
        } finally {
            if (isManual) setRefreshing(false);
            setLoading(false);
        }
    }, []);

    const loadLogs = useCallback(async () => {
        setLoadingLogs(true);
        try {
            const logsData = await loggingService.getLogsByDate(selectedDate);
            setLogs(logsData);
        } catch (error) {
            console.error("Error loading logs:", error);
        } finally {
            setLoadingLogs(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

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
                <div>
                    <h2 className="text-3xl font-bold text-slate-800">Panel de Control</h2>
                    <p className="text-sm text-slate-500 mt-1">Estadísticas y actividad en tiempo real</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full">{new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    <button
                        onClick={() => { loadStats(true); loadLogs(); }}
                        disabled={refreshing}
                        className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${refreshing ? 'bg-slate-100 text-slate-400' : 'bg-sky-50 text-sky-600 hover:bg-sky-100'}`}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'ACTUALIZANDO...' : 'ACTUALIZAR DATOS'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DashboardCard
                    title="Alumnos Activos"
                    value={loading ? '...' : stats.activeStudents}
                    helper="Basado en matrícula vigente"
                />
                <DashboardCard
                    title="Nuevos (Mes)"
                    value={loading ? '...' : stats.newStudentsMonth}
                    helper="Registrados desde el día 1"
                />
                <DashboardCard
                    title="Ingresos (Hoy)"
                    value={loading ? '...' : `S/ ${stats.incomeToday.toFixed(2)}`}
                    helper="Pagos registrados hoy"
                />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-slate-400" />
                        <h3 className="font-bold text-slate-800">Actividad del Día</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <input
                            type="date"
                            className="text-sm border-none bg-slate-50 rounded-lg text-slate-600 focus:ring-2 focus:ring-sky-500/20 cursor-pointer px-4 py-2"
                            value={selectedDate.toISOString().split('T')[0]}
                            onChange={(e) => {
                                if (e.target.value) {
                                    const [y, m, d] = e.target.value.split('-').map(Number);
                                    setSelectedDate(new Date(y, m - 1, d));
                                }
                            }}
                        />
                    </div>
                </div>
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                    {loadingLogs ? (
                        <div className="p-12 text-center">
                            <RefreshCw className="w-8 h-8 text-slate-200 animate-spin mx-auto mb-4" />
                            <p className="text-slate-400 text-sm">Cargando actividad...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="p-12 text-center">
                            <Info className="w-8 h-8 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-400 text-sm">No hay actividad registrada para esta fecha</p>
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className="p-4 flex items-start gap-4 hover:bg-slate-50/80 transition-colors group">
                                <div className="mt-1 flex-shrink-0 transition-transform group-hover:scale-110">{getLogIcon(log.type)}</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-slate-800 font-medium text-sm leading-relaxed">{log.text}</p>
                                    <p className="text-slate-400 text-xs mt-1 font-medium bg-slate-50 inline-block px-1.5 py-0.5 rounded">
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

function DashboardCard({ title, value, helper }: { title: string, value: string | number, helper?: string }) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
            <p className="text-4xl font-extrabold text-slate-900 mt-2 tracking-tight">{value}</p>
            {helper && <p className="text-[10px] text-slate-400 font-medium mt-3 uppercase tracking-wide">{helper}</p>}
        </div>
    );
}

