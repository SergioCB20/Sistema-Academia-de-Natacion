import React, { useState, useEffect } from 'react';
import { scheduleTemplateService } from '../../services/scheduleTemplateService';
import { categoryService } from '../../services/categoryService';
import { seasonService } from '../../services/seasonService';
import { useSeason } from '../../contexts/SeasonContext';
import type { ScheduleTemplate, Category, DayType, Season } from '../../types/db';

export default function ScheduleTemplates() {
    const { currentSeason } = useSeason();
    const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<ScheduleTemplate | null>(null);
    const [formData, setFormData] = useState({
        dayType: 'lun-mier-vier' as DayType,
        timeSlot: '06:00-07:00',
        categoryId: '',
        capacity: 12,
        isBreak: false
    });

    // Load all seasons on mount
    useEffect(() => {
        loadSeasons();
    }, []);

    // Set initial selected season when currentSeason loads
    useEffect(() => {
        if (currentSeason && !selectedSeasonId) {
            setSelectedSeasonId(currentSeason.id);
        }
    }, [currentSeason]);

    // Load templates when selected season changes
    useEffect(() => {
        if (selectedSeasonId) {
            loadTemplates();
        }
    }, [selectedSeasonId]);

    const loadSeasons = async () => {
        try {
            const allSeasons = await seasonService.getAll();
            setSeasons(allSeasons);
            // Also load categories
            const cats = await categoryService.getActive();
            setCategories(cats);
        } catch (error) {
            console.error('Error loading seasons:', error);
        }
    };

    const loadTemplates = async () => {
        if (!selectedSeasonId) return;

        try {
            setIsLoading(true);
            const temps = await scheduleTemplateService.getBySeason(selectedSeasonId);
            setTemplates(temps);
        } catch (error) {
            console.error('Error loading templates:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const openEditModal = (template: ScheduleTemplate) => {
        setEditingTemplate(template);
        setFormData({
            dayType: template.dayType,
            timeSlot: template.timeSlot,
            categoryId: template.categoryId || '',
            capacity: template.capacity,
            isBreak: template.isBreak
        });
        setShowModal(true);
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

        // If editing, skip complex validation and just update
        if (editingTemplate) {
            try {
                await scheduleTemplateService.update(editingTemplate.id, {
                    dayType: formData.dayType,
                    timeSlot: formData.timeSlot,
                    categoryId: formData.categoryId,
                    capacity: formData.capacity,
                    isBreak: formData.isBreak
                });

                // Sync capacity to existing monthly slots if capacity changed
                if (selectedSeasonId) {
                    const { monthlyScheduleService } = await import('../../services/monthlyScheduleService');
                    await monthlyScheduleService.syncCapacityFromTemplates(selectedSeasonId);
                }

                await loadTemplates();
                handleCloseModal();
                return;
            } catch (error) {
                console.error('Error updating template:', error);
                alert('Error al actualizar plantilla');
                return;
            }
        }

        // Helper: Check overlap (only for new templates)
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
                    seasonId: selectedSeasonId,
                    ...formData,
                    timeSlot: `${formatTime(currentStart)}-${formatTime(currentEnd)}`
                });

                currentStart = currentEnd;
            }
        } else {
            newTemplatesToCreate.push({
                seasonId: selectedSeasonId,
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
            // Creating new template(s)
            if (newTemplatesToCreate.length > 1) {
                if (!confirm(`Se detectó un rango de ${duration} minutos. Se crearán ${newTemplatesToCreate.length} bloques de hora individual: ${newTemplatesToCreate.map(t => t.timeSlot).join(', ')}. ¿Continuar?`)) {
                    return;
                }
                await scheduleTemplateService.createBulk(newTemplatesToCreate);
            } else {
                await scheduleTemplateService.create(newTemplatesToCreate[0]);
            }

            await loadTemplates();
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
            await loadTemplates();
        } catch (error) {
            console.error('Error deleting template:', error);
        }
    };

    const handleSyncSchedules = async () => {
        if (!selectedSeasonId) return;

        const selectedSeason = seasons.find(s => s.id === selectedSeasonId);
        if (!selectedSeason) {
            alert('No se encontró la temporada seleccionada');
            return;
        }

        if (templates.length === 0) {
            alert('No hay plantillas para sincronizar. Crea al menos una plantilla primero.');
            return;
        }

        const confirmMsg = `¿Sincronizar horarios para "${selectedSeason.name}"?\n\nEsto generará horarios mensuales desde ${selectedSeason.startMonth} hasta ${selectedSeason.endMonth} basándose en la plantilla actual.`;

        if (!confirm(confirmMsg)) return;

        setIsSyncing(true);
        try {
            const { monthlyScheduleService } = await import('../../services/monthlyScheduleService');

            const slotsCreated = await monthlyScheduleService.generateMonthlySlots(
                selectedSeasonId,
                selectedSeason.startMonth,
                selectedSeason.endMonth
            );

            // Sync capacity from templates to ensure all slots have correct capacity
            await monthlyScheduleService.syncCapacityFromTemplates(selectedSeasonId);

            alert(`✅ Sincronización completada!\n\nSe generaron ${slotsCreated} horarios mensuales para "${selectedSeason.name}".\n\nCapacidades actualizadas desde las plantillas.`);
        } catch (error) {
            console.error('Error syncing schedules:', error);
            alert('Error al sincronizar horarios');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingTemplate(null);
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

    if (seasons.length === 0) {
        return (
            <div className="p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">No hay temporadas creadas. Ve a Configuración → Temporadas para crear una.</p>
                </div>
            </div>
        );
    }

    if (isLoading && templates.length === 0) {
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
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm text-gray-500">Temporada:</span>
                        <select
                            value={selectedSeasonId}
                            onChange={(e) => setSelectedSeasonId(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        >
                            {seasons.map(season => (
                                <option key={season.id} value={season.id}>
                                    {season.type === 'summer' ? '☀️' : '❄️'} {season.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleSyncSchedules}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        disabled={templates.length === 0 || isSyncing}
                    >
                        {isSyncing ? (
                            <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Sincronizando...
                            </>
                        ) : (
                            <>🔄 Sincronizar Horarios</>
                        )}
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        + Nueva Plantilla
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
                                                                        onClick={() => openEditModal(template)}
                                                                        className="px-2 py-1 rounded text-xs text-center cursor-pointer hover:opacity-80 transition-opacity"
                                                                        style={{
                                                                            backgroundColor: category?.color || '#gray',
                                                                            color: template.isBreak ? 'black' : 'white'
                                                                        }}
                                                                        title="Click para editar"
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
                        <h2 className="text-xl font-bold mb-4">{editingTemplate ? 'Editar Plantilla' : 'Nueva Plantilla'}</h2>
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
                                    <div className="flex">
                                        <input
                                            type="text"
                                            value={formData.timeSlot}
                                            onChange={(e) => setFormData({ ...formData, timeSlot: e.target.value })}
                                            className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                            placeholder="06:00-07:00"
                                            required
                                        />
                                        <div className="flex flex-col border-t border-b border-r rounded-r-lg overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const [start, end] = formData.timeSlot.split('-');
                                                    if (!start || !end) return;
                                                    const [startH, startM] = start.split(':').map(Number);
                                                    const [endH, endM] = end.split(':').map(Number);
                                                    if (endH >= 23) return; // Prevent going past 23:00
                                                    const newStart = `${String(startH + 1).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
                                                    const newEnd = `${String(endH + 1).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                                                    setFormData({ ...formData, timeSlot: `${newStart}-${newEnd}` });
                                                }}
                                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors flex items-center justify-center"
                                                title="Subir 1 hora"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const [start, end] = formData.timeSlot.split('-');
                                                    if (!start || !end) return;
                                                    const [startH, startM] = start.split(':').map(Number);
                                                    const [endH, endM] = end.split(':').map(Number);
                                                    if (startH <= 0) return; // Prevent going below 00:00
                                                    const newStart = `${String(startH - 1).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
                                                    const newEnd = `${String(endH - 1).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                                                    setFormData({ ...formData, timeSlot: `${newStart}-${newEnd}` });
                                                }}
                                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors flex items-center justify-center border-t"
                                                title="Bajar 1 hora"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Usa las flechas o edita manualmente (ej: 11:30-12:30)</p>
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
                                    {editingTemplate ? 'Guardar' : 'Crear'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
