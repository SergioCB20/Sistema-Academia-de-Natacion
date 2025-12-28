import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X, Loader2 } from 'lucide-react';
import { importService, TransformedStudent, ImportResult } from '../../services/importService';
import { categoryService } from '../../services/categoryService';
import { seasonService } from '../../services/seasonService';

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

export default function MassImport() {
    const [step, setStep] = useState<ImportStep>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [transformedData, setTransformedData] = useState<TransformedStudent[]>([]);
    const [rawRows, setRawRows] = useState<any[]>([]);
    const [fixSummary, setFixSummary] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [result, setResult] = useState<ImportResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Manejar drop de archivo
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
            setFile(droppedFile);
            processFile(droppedFile);
        } else {
            setError('Por favor, sube un archivo Excel (.xlsx o .xls)');
        }
    }, []);

    // Manejar selección de archivo
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            processFile(selectedFile);
        }
    };

    // Procesar archivo Excel
    const processFile = async (file: File) => {
        setIsLoading(true);
        setError(null);

        try {
            // Parsear Excel
            const rows = await importService.parseExcelFile(file);

            setRawRows(rows);
            setFixSummary([]);

            if (rows.length === 0) {
                throw new Error('El archivo está vacío');
            }

            // Obtener categorías y temporada activa
            const categories = await categoryService.getAll();
            const activeSeason = await seasonService.getActiveSeason();

            if (!activeSeason) {
                throw new Error('No hay temporada activa. Crea una temporada antes de importar.');
            }

            // Crear mapa de categorías (id -> { name, ageMin, ageMax })
            const categoryMap = new Map<string, { name: string; ageMin: number; ageMax: number }>();
            categories.forEach(cat => {
                categoryMap.set(cat.id, {
                    name: cat.name,
                    ageMin: cat.ageRange.min,
                    ageMax: cat.ageRange.max
                });
            });

            // Transformar datos
            const transformed = importService.transformAllRows(rows, categoryMap, activeSeason.id);
            setTransformedData(transformed);
            setStep('preview');
        } catch (err: any) {
            setError(err.message || 'Error al procesar el archivo');
        } finally {
            setIsLoading(false);
        }
    };

    // Aplicar correcciones automáticas
    const handleAutoFix = async () => {
        setIsLoading(true);
        try {
            const { fixedRows, summary } = importService.applyAutoFixes(rawRows);
            setRawRows(fixedRows);
            setFixSummary(summary);

            // Re-transformar con los datos corregidos
            const categories = await categoryService.getAll();
            const activeSeason = await seasonService.getActiveSeason();
            if (!activeSeason) return;

            const categoryMap = new Map<string, { name: string; ageMin: number; ageMax: number }>();
            categories.forEach(cat => {
                categoryMap.set(cat.id, {
                    name: cat.name,
                    ageMin: cat.ageRange.min,
                    ageMax: cat.ageRange.max
                });
            });

            const transformed = importService.transformAllRows(fixedRows, categoryMap, activeSeason.id);
            setTransformedData(transformed);
        } catch (err: any) {
            setError('Error al aplicar correcciones: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Ejecutar importación
    const handleImport = async () => {
        setStep('importing');
        setProgress({ current: 0, total: transformedData.filter(s => s.isValid).length });

        try {
            const result = await importService.importStudents(
                transformedData,
                (current, total) => setProgress({ current, total })
            );
            setResult(result);
            setStep('complete');
        } catch (err: any) {
            setError(err.message || 'Error durante la importación');
            setStep('preview');
        }
    };


    const handleReset = () => {
        setStep('upload');
        setFile(null);
        setTransformedData([]);
        setRawRows([]);
        setFixSummary([]);
        setError(null);
        setProgress({ current: 0, total: 0 });
        setResult(null);
    };

    // Estadísticas
    const validCount = transformedData.filter(s => s.isValid).length;
    const invalidCount = transformedData.filter(s => !s.isValid).length;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Importación Masiva de Alumnos</h1>
                <p className="text-gray-600 mt-1">
                    Sube un archivo Excel exportado del sistema antiguo (Access) para migrar los alumnos.
                </p>
            </div>

            {/* Error global */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <span className="text-red-700">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-4 h-4 text-red-500" />
                    </button>
                </div>
            )}

            {/* Step 1: Upload */}
            {step === 'upload' && (
                <div className="space-y-6">
                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-indigo-400 transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileSelect}
                            className="hidden"
                        />

                        {isLoading ? (
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                                <p className="text-gray-600">Procesando archivo...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                                    <Upload className="w-8 h-8 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-lg font-medium text-gray-900">
                                        Arrastra tu archivo Excel aquí
                                    </p>
                                    <p className="text-gray-500 mt-1">
                                        o haz clic para seleccionar
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <FileSpreadsheet className="w-4 h-4" />
                                    <span>Formatos soportados: .xlsx, .xls</span>
                                </div>
                            </div>
                        )}
                    </div>


                    {/* Zona de Peligro */}
                    <div className="bg-red-50 border border-red-100 rounded-xl p-6">
                        <h3 className="text-red-800 font-bold flex items-center gap-2 mb-2">
                            <X className="w-5 h-5" />
                            Zona de Peligro
                        </h3>
                        <p className="text-red-600 text-sm mb-4">
                            Si cometiste un error en la importación (como códigos incorrectos), puedes borrar todos los alumnos y reiniciar los contadores para intentarlo de nuevo. **Esta acción es irreversible**.
                        </p>
                        <button
                            disabled={isLoading}
                            onClick={async () => {
                                if (confirm('¿ESTÁS ABSOLUTAMENTE SEGURO? Se borrarán TODOS los alumnos del sistema y se reiniciarán los códigos a cero.')) {
                                    setIsLoading(true);
                                    try {
                                        await importService.deleteAllStudents();
                                        alert('Base de datos de alumnos limpiada con éxito.');
                                        handleReset();
                                    } catch (err: any) {
                                        setError('Error al borrar los alumnos: ' + err.message);
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-bold disabled:opacity-50"
                        >
                            {isLoading ? 'Borrando...' : 'Borrar TODOS los Alumnos'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Preview */}
            {step === 'preview' && (
                <div className="space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                            <p className="text-sm text-gray-500">Total de registros</p>
                            <p className="text-2xl font-bold text-gray-900">{transformedData.length}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                            <p className="text-sm text-gray-500">Válidos para importar</p>
                            <p className="text-2xl font-bold text-green-600">{validCount}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
                            <p className="text-sm text-gray-500">Con errores</p>
                            <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                        </div>
                    </div>

                    {/* Auto-Fix Section */}
                    {invalidCount > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-500" />
                                <div>
                                    <p className="text-amber-900 font-medium">Se detectaron inconsistencias en los datos</p>
                                    <p className="text-amber-700 text-sm">
                                        Hay {invalidCount} filas con problemas (fechas invertidas o categorías incorrectas).
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleAutoFix}
                                disabled={isLoading}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium flex items-center gap-2"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <CheckCircle className="w-4 h-4" />
                                )}
                                Corregir Errores Automáticamente
                            </button>
                        </div>
                    )}

                    {/* Fix Summary */}
                    {fixSummary.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 transition-all animate-in fade-in slide-in-from-top-2">
                            <h4 className="text-indigo-900 font-medium mb-2 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-indigo-500" />
                                Correcciones aplicadas:
                            </h4>
                            <ul className="list-disc list-inside text-indigo-700 text-sm space-y-1">
                                {fixSummary.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* File info */}
                    <div className="bg-gray-50 p-4 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-8 h-8 text-green-600" />
                            <div>
                                <p className="font-medium text-gray-900">{file?.name}</p>
                                <p className="text-sm text-gray-500">
                                    {(file?.size ? file.size / 1024 : 0).toFixed(1)} KB
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleReset}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Preview table */}
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="max-h-96 overflow-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Estado
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Nombre
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Edad
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Horario
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Inicio
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Fin
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Clases
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Teléfono
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Errores
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {transformedData.map((item, index) => (
                                        <tr
                                            key={index}
                                            className={item.isValid ? 'hover:bg-gray-50' : 'bg-red-50'}
                                        >
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {item.isValid ? (
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                ) : (
                                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="font-medium text-gray-900">
                                                    {item.student.fullName}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                                                {item.student.age || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {item.student.fixedSchedule?.length ? (
                                                    <span>
                                                        {item.student.fixedSchedule[0]?.dayId} - {item.student.fixedSchedule[0]?.timeId}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {item.student.packageStartDate || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {item.student.packageEndDate || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                                                {item.student.remainingCredits}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                                                {item.student.phone || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-red-600">
                                                {item.errors.join(', ') || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-4">
                        <button
                            onClick={handleReset}
                            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={validCount === 0}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Importar {validCount} Alumnos
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Importing */}
            {step === 'importing' && (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                    <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mx-auto mb-6" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Importando alumnos...
                    </h2>
                    <p className="text-gray-600 mb-6">
                        Por favor no cierres esta página
                    </p>

                    {/* Progress bar */}
                    <div className="max-w-md mx-auto">
                        <div className="flex justify-between text-sm text-gray-500 mb-2">
                            <span>{progress.current} de {progress.total}</span>
                            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                        </div>
                        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-600 transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Step 4: Complete */}
            {step === 'complete' && result && (
                <div className="bg-white rounded-lg shadow p-8">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            ¡Importación Completada!
                        </h2>
                        <p className="text-gray-600">
                            Se han procesado todos los registros
                        </p>
                    </div>

                    {/* Results */}
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-8">
                        <div className="bg-green-50 p-4 rounded-lg text-center">
                            <p className="text-3xl font-bold text-green-600">{result.success}</p>
                            <p className="text-sm text-green-700">Importados</p>
                        </div>
                        <div className="bg-red-50 p-4 rounded-lg text-center">
                            <p className="text-3xl font-bold text-red-600">{result.failed}</p>
                            <p className="text-sm text-red-700">Fallidos</p>
                        </div>
                    </div>

                    {/* Errors list */}
                    {result.errors.length > 0 && (
                        <div className="mb-8">
                            <h3 className="font-medium text-gray-900 mb-3">Errores:</h3>
                            <div className="bg-red-50 rounded-lg p-4 max-h-48 overflow-auto">
                                <ul className="space-y-2">
                                    {result.errors.map((err, index) => (
                                        <li key={index} className="text-sm text-red-700">
                                            <span className="font-medium">Fila {err.row}:</span> {err.name} - {err.error}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={handleReset}
                            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Importar Más
                        </button>
                        <a
                            href="/alumnos"
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            Ver Alumnos
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
