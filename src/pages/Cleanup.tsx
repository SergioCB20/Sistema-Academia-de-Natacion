import { useState } from 'react';
import { studentService } from '../services/students';
import { monthlyScheduleService } from '../services/monthlyScheduleService';
import { useSeason } from '../contexts/SeasonContext';

export default function CleanupPage() {
    const { currentSeason } = useSeason();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

    const [orphanLoading, setOrphanLoading] = useState(false);
    const [orphanResult, setOrphanResult] = useState<any>(null);

    const runCleanup = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await studentService.cleanupDuplicateEnrollments();
            setResult(res);
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const runOrphanCleanup = async () => {
        if (!currentSeason) {
            alert('No hay temporada activa');
            return;
        }
        setOrphanLoading(true);
        setOrphanResult(null);
        try {
            const res = await monthlyScheduleService.cleanupOrphanEnrollments(currentSeason.id);
            setOrphanResult(res);
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setOrphanLoading(false);
        }
    };

    return (
        <div className="p-8 space-y-8">
            <h1 className="text-2xl font-bold mb-4">Herramientas de Limpieza</h1>

            {/* Limpieza de Duplicados */}
            <div className="bg-white p-6 rounded-xl border border-slate-200">
                <h2 className="text-lg font-bold mb-2">Limpieza de Duplicados</h2>
                <p className="mb-4 text-slate-600 text-sm">
                    Elimina estudiantes de horarios que no coinciden con su fixedSchedule.
                </p>

                <button
                    onClick={runCleanup}
                    disabled={loading}
                    className="px-6 py-3 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700 disabled:opacity-50"
                >
                    {loading ? 'Limpiando...' : 'Ejecutar Limpieza'}
                </button>

                {result && (
                    <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <h3 className="font-bold text-emerald-800 mb-2">✅ Resultado:</h3>
                        <p>Estudiantes procesados: {result.studentsProcessed}</p>
                        <p>Duplicados removidos: {result.duplicatesRemoved}</p>
                    </div>
                )}
            </div>

            {/* Limpieza de Inscripciones Huérfanas */}
            <div className="bg-white p-6 rounded-xl border border-orange-200">
                <h2 className="text-lg font-bold mb-2 text-orange-800">Limpieza de Inscripciones Huérfanas</h2>
                <p className="mb-4 text-slate-600 text-sm">
                    Elimina inscripciones de alumnos que ya no existen (fueron eliminados).
                    Esto corrige el conteo de cupos disponibles.
                </p>

                <button
                    onClick={runOrphanCleanup}
                    disabled={orphanLoading || !currentSeason}
                    className="px-6 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50"
                >
                    {orphanLoading ? 'Limpiando...' : 'Limpiar Inscripciones Huérfanas'}
                </button>

                {orphanResult && (
                    <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <h3 className="font-bold text-emerald-800 mb-2">✅ Resultado:</h3>
                        <p>Horarios procesados: {orphanResult.slotsProcessed}</p>
                        <p>Inscripciones huérfanas eliminadas: {orphanResult.enrollmentsRemoved}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

