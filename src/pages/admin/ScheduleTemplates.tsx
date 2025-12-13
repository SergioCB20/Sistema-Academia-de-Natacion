import React, { useState, useEffect } from 'react';
import { scheduleTemplateService } from '../../services/scheduleTemplateService';
import { categoryService } from '../../services/categoryService';
import { useSeason } from '../../contexts/SeasonContext';
import type { ScheduleTemplate, Category, DayType } from '../../types/db';

export default function ScheduleTemplates() {
    const { currentSeason } = useSeason();
    const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [formData, setFormData] = useState({
        dayType: 'lun-mier-vier' as DayType,
        timeSlot: '06:00-07:00',
        categoryId: '',
        capacity: 12,
        isBreak: false
    });
    const [generateData, setGenerateData] = useState({
        startDate: '',
        endDate: ''
    });

    useEffect(() => {
        loadData();
    }, [currentSeason]);

    const loadData = async () => {
        if (!currentSeason) return;

        try {
            setIsLoading(true);
            const [temps, cats] = await Promise.all([
                scheduleTemplateService.getBySeason(currentSeason.id),
                categoryService.getActive()
            ]);
            setTemplates(temps);
            setCategories(cats);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentSeason) return;

        // 1. Validate Time Format & Logic
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(formData.timeSlot)) {
            alert('Formato de hora inválido. Use HH:MM-HH:MM (ej: 14:00-15:30)');
            return;
        }

        const [startStr, endStr] = formData.timeSlot.split('-');
        const [startHour, startMin] = startStr.split(':').map(Number);
        const [endHour, endMin] = endStr.split(':').map(Number);

        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        const duration = endTime - startTime;

        if (startTime >= endTime) {
            alert('La hora de fin debe ser mayor a la hora de inicio.');
            return;
        }

        // Helper: Check overlap
        const isOverlapping = (start1: number, end1: number, start2: number, end2: number) => {
            return Math.max(start1, start2) < Math.min(end1, end2);
        };

        const existingTemplates = templates.filter(t => t.dayType === formData.dayType);

        // Logic to split into 1-hour chunks if duration > 60 mins
        const newTemplatesToCreate: any[] = []; // Using any to avoid strict type issues with Omit in this scope

        if (duration > 60) {
            // Split logic
            let currentStart = startTime;
            while (currentStart < endTime) {
                let currentEnd = currentStart + 60;
                if (currentEnd > endTime) currentEnd = endTime; // Handle remaining

                // Format back to HH:MM
                const formatTime = (totalMins: number) => {
                    const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
                    const m = (totalMins % 60).toString().padStart(2, '0');
                    return `${h}:${m}`;
                }

                newTemplatesToCreate.push({
                    seasonId: currentSeason.id,
                    ...formData,
                    timeSlot: `${formatTime(currentStart)}-${formatTime(currentEnd)}`
                });

                currentStart = currentEnd;
            }
        } else {
            newTemplatesToCreate.push({
                seasonId: currentSeason.id,
                ...formData
            });
        }

        // Validate ALL new chunks against existing templates
        for (const newTemp of newTemplatesToCreate) {
            const [nStartStr, nEndStr] = newTemp.timeSlot.split('-');
            const [nStartH, nStartM] = nStartStr.split(':').map(Number);
            const [nEndH, nEndM] = nEndStr.split(':').map(Number);
            const nStartTime = nStartH * 60 + nStartM;
            const nEndTime = nEndH * 60 + nEndM;

            const hasOverlap = existingTemplates.some(t => {
                const [tStartStr, tEndStr] = t.timeSlot.split('-');
                const [tStartH, tStartM] = tStartStr.split(':').map(Number);
                const [tEndH, tEndM] = tEndStr.split(':').map(Number);

                const tStartTime = tStartH * 60 + tStartM;
                const tEndTime = tEndH * 60 + tEndM;

                return isOverlapping(nStartTime, nEndTime, tStartTime, tEndTime);
            });

            if (hasOverlap) {
                alert(`El sub-bloque ${newTemp.timeSlot} se superpone con un horario existente.`);
                return;
            }
        }

        try {
            if (newTemplatesToCreate.length > 1) {
                if (!confirm(`Se detectó un rango de ${duration} minutos. Se crearán ${newTemplatesToCreate.length} bloques de hora individual: ${newTemplatesToCreate.map(t => t.timeSlot).join(', ')}. ¿Continuar?`)) {
                    return;
                }
                await scheduleTemplateService.createBulk(newTemplatesToCreate);
            } else {
                await scheduleTemplateService.create(newTemplatesToCreate[0]);
            }

            await loadData();
            handleCloseModal();
        } catch (error) {
            console.error('Error saving template:', error);
            alert('Error al guardar plantilla');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta plantilla?')) return;

        try {
            await scheduleTemplateService.delete(id);
            await loadData();
        } catch (error) {
            console.error('Error deleting template:', error);
        }
    };

    const handleGenerateSlots = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentSeason) return;

        try {
            await scheduleTemplateService.generateDailySlots(
                currentSeason.id,
                generateData.startDate,
                generateData.endDate
            );

            alert(`Se generaró el nuevo horario exitosamente`);
            setShowGenerateModal(false);
        } catch (error) {
            console.error('Error generating slots:', error);
            alert('Error al generar slots');
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setFormData({
            dayType: 'lun-mier-vier',
            timeSlot: '06:00-07:00',
            categoryId: '',
            capacity: 12,
            isBreak: false
        });
    };

    const groupedTemplates = templates.reduce((acc, template) => {
        const key = template.timeSlot;
        if (!acc[key]) acc[key] = [];
        acc[key].push(template);
        return acc;
    }, {} as Record<string, ScheduleTemplate[]>);

    const timeSlots = Object.keys(groupedTemplates).sort();

    if (!currentSeason) {
        return (
            <div className="p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">No hay temporada activa.</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Plantilla de Horario</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Temporada: {currentSeason.name}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowGenerateModal(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        disabled={templates.length === 0}
                    >
                        ⚡ Generar Horario
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        + Modificar Plantilla
                    </button>
                </div>
            </div>

            {templates.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                    <p className="text-gray-600">No hay plantillas de horario. Crea una para comenzar.</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Horario
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                                        Lun-Mier-Vier
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                                        Mar-Juev
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                                        Sab-Dom
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {timeSlots.map((timeSlot) => {
                                    const slotTemplates = groupedTemplates[timeSlot];
                                    const byDayType = {
                                        'lun-mier-vier': slotTemplates.filter(t => t.dayType === 'lun-mier-vier'),
                                        'mar-juev': slotTemplates.filter(t => t.dayType === 'mar-juev'),
                                        'sab-dom': slotTemplates.filter(t => t.dayType === 'sab-dom')
                                    };

                                    return (
                                        <tr key={timeSlot} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                                {timeSlot}
                                            </td>
                                            {(['lun-mier-vier', 'mar-juev', 'sab-dom'] as DayType[]).map(dayType => (
                                                <td key={dayType} className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {byDayType[dayType].map(template => {
                                                            const category = categories.find(c => c.id === template.categoryId);
                                                            return (
                                                                <div
                                                                    key={template.id}
                                                                    className="group relative"
                                                                >
                                                                    <div
                                                                        className="px-2 py-1 rounded text-xs text-center cursor-pointer"
                                                                        style={{
                                                                            backgroundColor: category?.color || '#gray',
                                                                            color: template.isBreak ? 'black' : 'white'
                                                                        }}
                                                                    >
                                                                        {template.isBreak ? (
                                                                            <span>DESCANSO</span>
                                                                        ) : (
                                                                            <>
                                                                                <div className="font-medium">{category?.name || 'Sin categoría'}</div>
                                                                                <div className="text-xs opacity-90">Cap: {template.capacity}</div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleDelete(template.id)}
                                                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create Template Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Nueva Plantilla</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tipo de Día
                                    </label>
                                    <select
                                        value={formData.dayType}
                                        onChange={(e) => setFormData({ ...formData, dayType: e.target.value as DayType })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="lun-mier-vier">Lun-Mier-Vier</option>
                                        <option value="mar-juev">Mar-Juev</option>
                                        <option value="sab-dom">Sab-Dom</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Horario
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.timeSlot}
                                        onChange={(e) => setFormData({ ...formData, timeSlot: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        placeholder="06:00-07:00"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Categoría
                                    </label>
                                    <select
                                        value={formData.categoryId}
                                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        required={!formData.isBreak}
                                        disabled={formData.isBreak}
                                    >
                                        <option value="">Seleccionar categoría</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Capacidad
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.capacity}
                                        onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="isBreak"
                                        checked={formData.isBreak}
                                        onChange={(e) => setFormData({ ...formData, isBreak: e.target.checked })}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="isBreak" className="ml-2 block text-sm text-gray-900">
                                        Es un descanso
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                >
                                    Crear
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Generate Slots Modal */}
            {showGenerateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Generar Slots Diarios</h2>
                        <form onSubmit={handleGenerateSlots}>
                            <div className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-sm text-blue-800">
                                        Se generarán el nuevo horario basados en la plantilla existente para el rango de fechas seleccionado.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Fecha Inicio
                                    </label>
                                    <input
                                        type="date"
                                        value={generateData.startDate}
                                        onChange={(e) => setGenerateData({ ...generateData, startDate: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Fecha Fin
                                    </label>
                                    <input
                                        type="date"
                                        value={generateData.endDate}
                                        onChange={(e) => setGenerateData({ ...generateData, endDate: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowGenerateModal(false)}
                                    className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                >
                                    Generar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
