import React, { useState, useEffect } from 'react';
import { packageService } from '../../services/packageService';
import { categoryService } from '../../services/categoryService';
import { useSeason } from '../../contexts/SeasonContext';
import type { Package, Category, DayType } from '../../types/db';

export default function Packages() {
    const { currentSeason } = useSeason();
    const [packages, setPackages] = useState<Package[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingPackage, setEditingPackage] = useState<Package | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        classesPerMonth: 8,
        duration: 1,
        price: 0,
        scheduleTypes: [] as DayType[],
        applicableCategories: [] as string[],
        isActive: true
    });

    useEffect(() => {
        loadData();
    }, [currentSeason]);

    const loadData = async () => {
        if (!currentSeason) return;

        try {
            setIsLoading(true);
            const [pkgs, cats] = await Promise.all([
                packageService.getBySeason(currentSeason.id),
                categoryService.getActive()
            ]);
            setPackages(pkgs);
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

        try {
            const packageData = {
                ...formData,
                seasonId: currentSeason.id
            };

            if (editingPackage) {
                await packageService.update(editingPackage.id, packageData);
            } else {
                await packageService.create(packageData);
            }

            await loadData();
            handleCloseModal();
        } catch (error) {
            console.error('Error saving package:', error);
            alert('Error al guardar paquete');
        }
    };

    const handleEdit = (pkg: Package) => {
        setEditingPackage(pkg);
        setFormData({
            name: pkg.name,
            classesPerMonth: pkg.classesPerMonth,
            duration: pkg.duration,
            price: pkg.price,
            scheduleTypes: pkg.scheduleTypes,
            applicableCategories: pkg.applicableCategories,
            isActive: pkg.isActive
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Desactivar este paquete?')) return;

        try {
            await packageService.delete(id);
            await loadData();
        } catch (error) {
            console.error('Error deleting package:', error);
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingPackage(null);
        setFormData({
            name: '',
            classesPerMonth: 8,
            duration: 1,
            price: 0,
            scheduleTypes: [],
            applicableCategories: [],
            isActive: true
        });
    };

    const toggleScheduleType = (type: DayType) => {
        setFormData(prev => ({
            ...prev,
            scheduleTypes: prev.scheduleTypes.includes(type)
                ? prev.scheduleTypes.filter(t => t !== type)
                : [...prev.scheduleTypes, type]
        }));
    };

    const toggleCategory = (categoryId: string) => {
        setFormData(prev => ({
            ...prev,
            applicableCategories: prev.applicableCategories.includes(categoryId)
                ? prev.applicableCategories.filter(c => c !== categoryId)
                : [...prev.applicableCategories, categoryId]
        }));
    };

    const toggleAllCategories = () => {
        setFormData(prev => ({
            ...prev,
            applicableCategories: prev.applicableCategories.includes('all')
                ? []
                : ['all']
        }));
    };

    if (!currentSeason) {
        return (
            <div className="p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">No hay temporada activa. Por favor, crea una temporada primero.</p>
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
                    <h1 className="text-2xl font-bold text-gray-900">Paquetes</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Temporada: {currentSeason.name}
                    </p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                    + Nuevo Paquete
                </button>
            </div>

            <div className="grid gap-4">
                {packages.map((pkg) => (
                    <div key={pkg.id} className="bg-white rounded-lg shadow p-6 border">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    {pkg.name}
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Clases/mes:</span>
                                        <span className="ml-2 font-medium">{pkg.classesPerMonth}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Duración:</span>
                                        <span className="ml-2 font-medium">{pkg.duration} mes(es)</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Precio:</span>
                                        <span className="ml-2 font-medium text-green-600">S/ {pkg.price}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Estado:</span>
                                        <span className={`ml-2 px-2 py-1 text-xs rounded-full ${pkg.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                            {pkg.isActive ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="text-xs text-gray-500">Horarios:</span>
                                    {Array.isArray(pkg.scheduleTypes) && pkg.scheduleTypes.map(type => (
                                        <span key={type} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                            {type}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="text-xs text-gray-500">Categorías:</span>
                                    {Array.isArray(pkg.applicableCategories) && pkg.applicableCategories.includes('all') ? (
                                        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                                            Todas
                                        </span>
                                    ) : (
                                        Array.isArray(pkg.applicableCategories) && pkg.applicableCategories.map(catId => {
                                            const cat = categories.find(c => c.id === catId);
                                            return cat ? (
                                                <span key={catId} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">
                                                    {cat.name}
                                                </span>
                                            ) : null;
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                                <button
                                    onClick={() => handleEdit(pkg)}
                                    className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(pkg.id)}
                                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                    Desactivar
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">
                            {editingPackage ? 'Editar Paquete' : 'Nuevo Paquete'}
                        </h2>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nombre del Paquete
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Ej: 8 clases x mes"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Clases/Mes
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.classesPerMonth}
                                            onChange={(e) => setFormData({ ...formData, classesPerMonth: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Duración (meses)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.duration}
                                            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Precio (S/)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Tipos de Horario
                                    </label>
                                    <div className="space-y-2">
                                        {(['lun-mier-vier', 'mar-juev', 'sab-dom'] as DayType[]).map(type => (
                                            <label key={type} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.scheduleTypes.includes(type)}
                                                    onChange={() => toggleScheduleType(type)}
                                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                />
                                                <span className="ml-2 text-sm text-gray-700">{type}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Categorías Aplicables
                                    </label>
                                    <div className="space-y-2">
                                        <label className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={formData.applicableCategories.includes('all')}
                                                onChange={toggleAllCategories}
                                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                            />
                                            <span className="ml-2 text-sm font-medium text-gray-700">Todas las categorías</span>
                                        </label>
                                        {!formData.applicableCategories.includes('all') && categories.map(cat => (
                                            <label key={cat.id} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.applicableCategories.includes(cat.id)}
                                                    onChange={() => toggleCategory(cat.id)}
                                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                />
                                                <span className="ml-2 text-sm text-gray-700">{cat.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                                        Paquete activo
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
                                    {editingPackage ? 'Actualizar' : 'Crear'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
