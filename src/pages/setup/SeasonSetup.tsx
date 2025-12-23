import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { seasonService } from '../../services/seasonService';
import { useSeason } from '../../contexts/SeasonContext';
import type { SeasonType } from '../../types/db';

export default function SeasonSetup() {
    const navigate = useNavigate();
    const { refreshSeason } = useSeason();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        type: 'summer' as SeasonType,
        startMonth: '',
        endMonth: '',
        workingHoursStart: '06:00',
        workingHoursEnd: '21:30'
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            setIsLoading(true);

            // Create the first season
            await seasonService.create({
                name: formData.name,
                type: formData.type,
                startMonth: formData.startMonth,
                endMonth: formData.endMonth,
                workingHours: {
                    start: formData.workingHoursStart,
                    end: formData.workingHoursEnd
                },
                isActive: true // First season is automatically active
            });

            // Refresh season context
            await refreshSeason();

            // Redirect to dashboard
            navigate('/');
        } catch (error) {
            console.error('Error creating season:', error);
            alert('Error al crear temporada');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        ¡Bienvenido! 🏊‍♂️
                    </h1>
                    <p className="text-gray-600">
                        Configuremos tu primera temporada para comenzar
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-900 mb-2">
                            Paso 1: Crear Temporada
                        </h3>
                        <p className="text-sm text-blue-700">
                            Define la temporada actual (verano o invierno) con sus meses y horarios de trabajo. Después podrás configurar categorías, paquetes y horarios.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nombre de la Temporada
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Ej: Verano 2026"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Tipo de Temporada
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, type: 'summer' })}
                                className={`p-4 border-2 rounded-lg transition-all ${formData.type === 'summer'
                                    ? 'border-orange-500 bg-orange-50'
                                    : 'border-gray-200 hover:border-orange-300'
                                    }`}
                            >
                                <div className="text-3xl mb-2">☀️</div>
                                <div className="font-semibold">Verano</div>
                                <div className="text-xs text-gray-500">Mayor demanda</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, type: 'winter' })}
                                className={`p-4 border-2 rounded-lg transition-all ${formData.type === 'winter'
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300'
                                    }`}
                            >
                                <div className="text-3xl mb-2">❄️</div>
                                <div className="font-semibold">Invierno</div>
                                <div className="text-xs text-gray-500">Menor demanda</div>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Mes de Inicio
                            </label>
                            <input
                                type="month"
                                value={formData.startMonth}
                                onChange={(e) => setFormData({ ...formData, startMonth: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                placeholder="YYYY-MM"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">Formato: 2026-01</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Mes de Fin
                            </label>
                            <input
                                type="month"
                                value={formData.endMonth}
                                onChange={(e) => setFormData({ ...formData, endMonth: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                placeholder="YYYY-MM"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">Formato: 2026-02</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Hora de Inicio
                            </label>
                            <input
                                type="time"
                                value={formData.workingHoursStart}
                                onChange={(e) => setFormData({ ...formData, workingHoursStart: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Hora de Fin
                            </label>
                            <input
                                type="time"
                                value={formData.workingHoursEnd}
                                onChange={(e) => setFormData({ ...formData, workingHoursEnd: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-sm text-gray-600">
                            <strong>Próximos pasos:</strong> Después de crear la temporada, podrás configurar:
                        </p>
                        <ul className="mt-2 text-sm text-gray-600 space-y-1 ml-4">
                            <li>• Categorías de edad</li>
                            <li>• Paquetes y precios</li>
                            <li>• Plantillas de horarios</li>
                        </ul>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Creando temporada...' : 'Crear Temporada y Comenzar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
