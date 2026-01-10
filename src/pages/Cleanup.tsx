import { useState } from 'react';
import { studentService } from '../services/students';

export default function CleanupPage() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

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

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">Limpieza de Duplicados</h1>
            <p className="mb-4 text-slate-600">
                Esta herramienta elimina estudiantes de horarios que no coinciden con su fixedSchedule.
            </p>

            <button
                onClick={runCleanup}
                disabled={loading}
                className="px-6 py-3 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700 disabled:opacity-50"
            >
                {loading ? 'Limpiando...' : 'Ejecutar Limpieza'}
            </button>

            {result && (
                <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <h2 className="font-bold text-emerald-800 mb-2">✅ Resultado:</h2>
                    <p>Estudiantes procesados: {result.studentsProcessed}</p>
                    <p>Duplicados removidos: {result.duplicatesRemoved}</p>
                </div>
            )}
        </div>
    );
}
