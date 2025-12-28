import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, CreditCard } from 'lucide-react';
import { cardConfigService } from '../../services/cardConfig';
import type { CardConfig, CardFieldConfig } from '../../types/db';

export default function CardSettings() {
    const [config, setConfig] = useState<CardConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await cardConfigService.getConfig();
            // Ensure printMargins exists for backward compatibility
            if (!data.printMargins) {
                data.printMargins = {
                    top: '0mm',
                    right: '45mm',
                    bottom: '0mm',
                    left: '58mm'
                };
            }
            setConfig(data);
        } catch (error) {
            console.error('Error loading config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            await cardConfigService.saveConfig(config);
            alert('✅ Configuración guardada exitosamente');
        } catch (error) {
            console.error('Error saving config:', error);
            alert('❌ Error al guardar la configuración');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('¿Estás seguro de resetear a la configuración por defecto?')) return;
        setLoading(true);
        try {
            const defaultConfig = await cardConfigService.resetToDefault();
            setConfig(defaultConfig);
            alert('✅ Configuración reseteada');
        } catch (error) {
            console.error('Error resetting config:', error);
            alert('❌ Error al resetear la configuración');
        } finally {
            setLoading(false);
        }
    };

    const updateField = (fieldName: keyof CardConfig['fields'], property: keyof CardFieldConfig, value: string) => {
        if (!config) return;
        setConfig({
            ...config,
            fields: {
                ...config.fields,
                [fieldName]: {
                    ...config.fields[fieldName],
                    [property]: value
                }
            }
        });
    };

    const updateDimension = (dimension: 'width' | 'height', value: string) => {
        if (!config) return;
        setConfig({
            ...config,
            [dimension]: value
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-500">Cargando configuración...</p>
                </div>
            </div>
        );
    }

    if (!config) return null;

    const fieldLabels: Record<keyof CardConfig['fields'], string> = {
        nombre: 'Nombre',
        codigo: 'Código',
        edad: 'Edad',
        categoria: 'Categoría',
        horarioTime: 'Horario (Hora)',
        horarioDays: 'Horario (Días)',
        fechaInicio: 'Fecha Inicio',
        fechaFinal: 'Fecha Final',
        clases: 'Clases'
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center">
                        <Settings className="w-6 h-6 text-sky-600" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-slate-800">Configuración de Carnet</h2>
                        <p className="text-sm text-slate-500">Ajusta la posición de cada campo del carnet</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Resetear
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-sky-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-sky-700 transition-colors flex items-center gap-2 shadow-lg shadow-sky-600/20 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Configuration Panel */}
                <div className="space-y-6">
                    {/* Card Dimensions */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-sky-600" />
                            Dimensiones del Carnet
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Ancho</label>
                                <input
                                    type="text"
                                    value={config.width}
                                    onChange={(e) => updateDimension('width', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-sm font-mono"
                                    placeholder="99mm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Alto</label>
                                <input
                                    type="text"
                                    value={config.height}
                                    onChange={(e) => updateDimension('height', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-sm font-mono"
                                    placeholder="69mm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Print Margins */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">Márgenes de Impresión</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Superior</label>
                                <input
                                    type="text"
                                    value={config.printMargins.top}
                                    onChange={(e) => setConfig({ ...config, printMargins: { ...config.printMargins, top: e.target.value } })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-sm font-mono"
                                    placeholder="0mm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Derecha</label>
                                <input
                                    type="text"
                                    value={config.printMargins.right}
                                    onChange={(e) => setConfig({ ...config, printMargins: { ...config.printMargins, right: e.target.value } })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-sm font-mono"
                                    placeholder="45mm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Inferior</label>
                                <input
                                    type="text"
                                    value={config.printMargins.bottom}
                                    onChange={(e) => setConfig({ ...config, printMargins: { ...config.printMargins, bottom: e.target.value } })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-sm font-mono"
                                    placeholder="0mm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Izquierda</label>
                                <input
                                    type="text"
                                    value={config.printMargins.left}
                                    onChange={(e) => setConfig({ ...config, printMargins: { ...config.printMargins, left: e.target.value } })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-sm font-mono"
                                    placeholder="58mm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Field Configuration */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-h-[600px] overflow-y-auto">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">Posición de Campos</h3>
                        <div className="space-y-6">
                            {(Object.keys(config.fields) as Array<keyof CardConfig['fields']>).map((fieldName) => {
                                const field = config.fields[fieldName];
                                return (
                                    <div key={fieldName} className="border-b border-slate-100 pb-4 last:border-0">
                                        <h4 className="text-sm font-bold text-slate-700 mb-3">{fieldLabels[fieldName]}</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Top</label>
                                                <input
                                                    type="text"
                                                    value={field.top || ''}
                                                    onChange={(e) => updateField(fieldName, 'top', e.target.value)}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-xs font-mono"
                                                    placeholder="20mm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Bottom</label>
                                                <input
                                                    type="text"
                                                    value={field.bottom || ''}
                                                    onChange={(e) => updateField(fieldName, 'bottom', e.target.value)}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-xs font-mono"
                                                    placeholder="10mm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Left</label>
                                                <input
                                                    type="text"
                                                    value={field.left || ''}
                                                    onChange={(e) => updateField(fieldName, 'left', e.target.value)}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-xs font-mono"
                                                    placeholder="15mm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Right</label>
                                                <input
                                                    type="text"
                                                    value={field.right || ''}
                                                    onChange={(e) => updateField(fieldName, 'right', e.target.value)}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-xs font-mono"
                                                    placeholder="25mm"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Tamaño Fuente</label>
                                                <input
                                                    type="text"
                                                    value={field.fontSize}
                                                    onChange={(e) => updateField(fieldName, 'fontSize', e.target.value)}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-xs font-mono"
                                                    placeholder="8pt"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Preview Panel */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky top-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Vista Previa</h3>
                    <div className="bg-slate-50 p-8 rounded-xl flex items-center justify-center">
                        <div
                            className="relative bg-pink-200 border-2 border-pink-300 shadow-lg"
                            style={{
                                width: config.width,
                                height: config.height,
                                transform: 'scale(0.8)',
                                transformOrigin: 'center'
                            }}
                        >
                            {/* Render each field */}
                            <div
                                className="absolute uppercase font-bold"
                                style={{
                                    top: config.fields.nombre.top,
                                    bottom: config.fields.nombre.bottom,
                                    left: config.fields.nombre.left,
                                    right: config.fields.nombre.right,
                                    fontSize: config.fields.nombre.fontSize
                                }}
                            >
                                JUAN PÉREZ
                            </div>

                            <div
                                className="absolute font-bold"
                                style={{
                                    top: config.fields.codigo.top,
                                    bottom: config.fields.codigo.bottom,
                                    left: config.fields.codigo.left,
                                    right: config.fields.codigo.right,
                                    fontSize: config.fields.codigo.fontSize,
                                    textAlign: config.fields.codigo.right ? 'right' : 'left'
                                }}
                            >
                                12345678
                            </div>

                            <div
                                className="absolute font-bold"
                                style={{
                                    top: config.fields.edad.top,
                                    bottom: config.fields.edad.bottom,
                                    left: config.fields.edad.left,
                                    right: config.fields.edad.right,
                                    fontSize: config.fields.edad.fontSize
                                }}
                            >
                                25 AÑOS
                            </div>

                            <div
                                className="absolute uppercase font-bold"
                                style={{
                                    top: config.fields.categoria.top,
                                    bottom: config.fields.categoria.bottom,
                                    left: config.fields.categoria.left,
                                    right: config.fields.categoria.right,
                                    fontSize: config.fields.categoria.fontSize
                                }}
                            >
                                ADULTOS
                            </div>

                            <div
                                className="absolute font-bold"
                                style={{
                                    top: config.fields.horarioTime.top,
                                    bottom: config.fields.horarioTime.bottom,
                                    left: config.fields.horarioTime.left,
                                    right: config.fields.horarioTime.right,
                                    fontSize: config.fields.horarioTime.fontSize
                                }}
                            >
                                06:00 - 07:00
                            </div>

                            <div
                                className="absolute uppercase font-bold"
                                style={{
                                    top: config.fields.horarioDays.top,
                                    bottom: config.fields.horarioDays.bottom,
                                    left: config.fields.horarioDays.left,
                                    right: config.fields.horarioDays.right,
                                    fontSize: config.fields.horarioDays.fontSize
                                }}
                            >
                                LUN - MIE - VIE
                            </div>

                            <div
                                className="absolute font-bold"
                                style={{
                                    top: config.fields.fechaInicio.top,
                                    bottom: config.fields.fechaInicio.bottom,
                                    left: config.fields.fechaInicio.left,
                                    right: config.fields.fechaInicio.right,
                                    fontSize: config.fields.fechaInicio.fontSize
                                }}
                            >
                                01/01/2025
                            </div>

                            <div
                                className="absolute font-bold"
                                style={{
                                    top: config.fields.fechaFinal.top,
                                    bottom: config.fields.fechaFinal.bottom,
                                    left: config.fields.fechaFinal.left,
                                    right: config.fields.fechaFinal.right,
                                    fontSize: config.fields.fechaFinal.fontSize
                                }}
                            >
                                31/01/2025
                            </div>

                            <div
                                className="absolute font-bold"
                                style={{
                                    top: config.fields.clases.top,
                                    bottom: config.fields.clases.bottom,
                                    left: config.fields.clases.left,
                                    right: config.fields.clases.right,
                                    fontSize: config.fields.clases.fontSize
                                }}
                            >
                                12
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-4 text-center">
                        Los cambios se reflejan en tiempo real. Guarda cuando estés satisfecho.
                    </p>
                </div>
            </div>
        </div>
    );
}
