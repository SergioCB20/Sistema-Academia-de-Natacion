import React, { useState, useEffect } from 'react';
import { seasonService } from '../../services/seasonService';
import { useSeason } from '../../contexts/SeasonContext';
import type { Season, SeasonType } from '../../types/db';

export default function Seasons() {
    const { refreshSeason } = useSeason();
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSeason, setEditingSeason] = useState<Season | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        type: 'summer' as SeasonType,
        startMonth: '',
        endMonth: '',
        workingHoursStart: '06:00',
        workingHoursEnd: '21:30',
        isActive: false
    });

    useEffect(() => {
        loadSeasons();
    }, []);

    const loadSeasons = async () => {
        try {
            setIsLoading(true);
            const data = await seasonService.getAll();
            setSeasons(data);
        } catch (error) {
            console.error('Error loading seasons:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const seasonData = {
                name: formData.name,
                type: formData.type,
                startMonth: formData.startMonth,
                endMonth: formData.endMonth,
                workingHours: {
                    start: formData.workingHoursStart,
                    end: formData.workingHoursEnd
                },
                isActive: formData.isActive,
                startDate: `${formData.startMonth}-01`,
                endDate: (() => {
                    const [y, m] = formData.endMonth.split('-').map(Number);
                    return new Date(y, m, 0).toISOString().split('T')[0];
                })()
            };

            if (editingSeason) {
                await seasonService.update(editingSeason.id, seasonData);
            } else {
                await seasonService.create(seasonData);
            }

            await loadSeasons();
            await refreshSeason();
            handleCloseModal();
        } catch (error) {
            console.error('Error saving season:', error);
            alert('Error al guardar temporada');
        }
    };

    const handleEdit = (season: Season) => {
        setEditingSeason(season);
        setFormData({
            name: season.name,
            type: season.type,
            startMonth: season.startMonth,
            endMonth: season.endMonth,
            workingHoursStart: season.workingHours.start,
            workingHoursEnd: season.workingHours.end,
            isActive: season.isActive
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta temporada?')) return;

        try {
            await seasonService.delete(id);
            await loadSeasons();
            await refreshSeason();
        } catch (error) {
            console.error('Error deleting season:', error);
            alert('Error al eliminar temporada');
        }
    };

    const handleSetActive = async (id: string) => {
        try {
            await seasonService.setActiveSeason(id);
            await loadSeasons();
            await refreshSeason();
        } catch (error) {
            console.error('Error setting active season:', error);
            alert('Error al activar temporada');
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingSeason(null);
        setFormData({
            name: '',
            type: 'summer',
            startMonth: '',
            endMonth: '',
            workingHoursStart: '06:00',
            workingHoursEnd: '21:30',
            isActive: false
        });
    };

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
                <h1 className="text-2xl font-bold text-gray-900">Temporadas</h1>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                    + Nueva Temporada
                </button>
            </div>

            <div className="grid gap-4">
                {seasons.map((season) => (
                    <div
                        key={season.id}
                        className={`bg-white rounded-lg shadow p-6 border-2 ${season.isActive ? 'border-indigo-500' : 'border-transparent'
                            }`}
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl">
                                        {season.type === 'summer' ? '☀️' : '❄️'}
                                    </span>
                                    <h3 className="text-xl font-bold text-gray-900">
                                        {season.name}
                                    </h3>
                                    {season.isActive && (
                                        <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full">
                                            ACTIVA
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Inicio:</span>
                                        <span className="ml-2 font-medium">
                                            {season.startMonth}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Fin:</span>
                                        <span className="ml-2 font-medium">
                                            {season.endMonth}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Horario:</span>
                                        <span className="ml-2 font-medium">
                                            {season.workingHours.start} - {season.workingHours.end}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {!season.isActive && (
                                    <button
                                        onClick={() => handleSetActive(season.id)}
                                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                                    >
                                        Activar
                                    </button>
                                )}
                                <button
                                    onClick={() => handleEdit(season)}
                                    className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(season.id)}
                                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">
                            {editingSeason ? 'Editar Temporada' : 'Nueva Temporada'}
                        </h2>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nombre
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Ej: Verano 2026"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tipo
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as SeasonType })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="summer">Verano ☀️</option>
                                        <option value="winter">Invierno ❄️</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Mes Inicio (YYYY-MM)
                                        </label>
                                        <input
                                            type="month"
                                            value={formData.startMonth}
                                            onChange={(e) => setFormData({ ...formData, startMonth: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Mes Fin (YYYY-MM)
                                        </label>
                                        <input
                                            type="month"
                                            value={formData.endMonth}
                                            onChange={(e) => setFormData({ ...formData, endMonth: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Hora Inicio
                                        </label>
                                        <input
                                            type="time"
                                            value={formData.workingHoursStart}
                                            onChange={(e) => setFormData({ ...formData, workingHoursStart: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Hora Fin
                                        </label>
                                        <input
                                            type="time"
                                            value={formData.workingHoursEnd}
                                            onChange={(e) => setFormData({ ...formData, workingHoursEnd: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
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
                                    {editingSeason ? 'Actualizar' : 'Crear'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
