import { useState, useEffect } from 'react';
import { paymentMethodService } from '../../services/paymentMethodService';
import { PaymentMethodConfig } from '../../types/db';
import { Plus, Pencil, Trash2, Wallet, CheckCircle, XCircle } from 'lucide-react';

export default function PaymentMethods() {
    const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMethod, setEditingMethod] = useState<PaymentMethodConfig | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        isActive: true
    });

    useEffect(() => {
        loadMethods();
    }, []);

    const loadMethods = async () => {
        setLoading(true);
        try {
            await paymentMethodService.seedInitial();
            const data = await paymentMethodService.getAll();
            setMethods(data);
        } catch (error) {
            console.error("Error loading methods:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingMethod) {
                await paymentMethodService.update(editingMethod.id, formData);
            } else {
                await paymentMethodService.create(formData);
            }
            setIsModalOpen(false);
            setEditingMethod(null);
            setFormData({ name: '', isActive: true });
            loadMethods();
        } catch (error) {
            console.error("Error saving method:", error);
            alert("Error al guardar el método de pago");
        }
    };

    const handleEdit = (method: PaymentMethodConfig) => {
        setEditingMethod(method);
        setFormData({
            name: method.name,
            isActive: method.isActive
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este método de pago? Los registros de ingresos antiguos que usen este método podrían no filtrarse correctamente.")) return;
        try {
            await paymentMethodService.delete(id);
            loadMethods();
        } catch (error) {
            console.error("Error deleting method:", error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800">Métodos de Pago</h2>
                    <p className="text-slate-500">Configura las opciones de pago disponibles en el sistema</p>
                </div>
                <button
                    onClick={() => {
                        setEditingMethod(null);
                        setFormData({ name: '', isActive: true });
                        setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-sky-200"
                >
                    <Plus className="w-5 h-5" />
                    <span>Nuevo Método</span>
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {methods.map((method) => (
                        <div key={method.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center">
                                    <Wallet className="w-6 h-6" />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEdit(method)} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(method.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-xl font-bold text-slate-800 mb-1">{method.name}</h3>
                            <p className="text-xs font-mono text-slate-400 mb-4">ID: {method.id}</p>

                            <div className="flex items-center gap-2">
                                {method.isActive ? (
                                    <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                                        <CheckCircle className="w-3 h-3" />
                                        ACTIVO
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold">
                                        <XCircle className="w-3 h-3" />
                                        INACTIVO
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">
                                {editingMethod ? 'Editar Método' : 'Nuevo Método de Pago'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Método</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all font-medium"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej: Transferencia BCP"
                                />
                            </div>

                            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    className="w-5 h-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    checked={formData.isActive}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                />
                                <label htmlFor="isActive" className="text-sm font-bold text-slate-700 cursor-pointer">
                                    Método Activo (Disponible para nuevos registros)
                                </label>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                            >
                                {editingMethod ? 'Guardar Cambios' : 'Crear Método'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
