import { useState, useEffect } from 'react';
import {
    User,
    Search,
    Trash2,
    Pencil,
    Phone,
    CreditCard,
    Plus,
    // X,
    Calendar,
    ArrowRight,
    ArrowLeft,
    CheckCircle,
    DollarSign
} from 'lucide-react';
import { studentService } from '../services/students';
import { DAYS, HOURS } from '../services/master';
import type { Student, PaymentMethod, Debt, StudentCategory } from '../types/db';

export default function Students() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [step, setStep] = useState(1); // 1: Personal, 2: Schedule, 3: Payment

    // DEBT Modal State
    const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
    const [selectedDebts, setSelectedDebts] = useState<Debt[]>([]);
    const [studentForDebt, setStudentForDebt] = useState<Student | null>(null);

    // Form Data
    const [formData, setFormData] = useState({
        fullName: '',
        dni: '',
        phone: '',
        email: '',
        category: 'Niños' as StudentCategory
    });

    const [fixedSchedule, setFixedSchedule] = useState<Array<{ dayId: string, timeId: string }>>([]);

    const [paymentData, setPaymentData] = useState({
        amountPaid: '',
        totalCost: '0.00',
        credits: '12',
        method: 'CASH' as PaymentMethod
    });

    useEffect(() => {
        loadStudents();
    }, []);

    const loadStudents = async () => {
        setLoading(true);
        try {
            const data = await studentService.getAllActive();
            console.log(data)
            setStudents(data);
        } catch (error) {
            console.error("Error loading students:", error);
        } finally {
            setLoading(false);
        }
    };

    // ... (rest of the create/edit flow) ...

    const handleCreateNew = () => {
        setEditingStudent(null);
        setFormData({ fullName: '', dni: '', phone: '', email: '', category: 'Niños' });
        setFixedSchedule([]);
        setPaymentData({ amountPaid: '', totalCost: '0.00', credits: '12', method: 'CASH' });
        setStep(1);
        setIsModalOpen(true);
    };

    const handleEdit = (student: Student) => {
        setEditingStudent(student);
        setFormData({
            fullName: student.fullName,
            dni: student.dni,
            phone: student.phone,
            email: student.email || '',
            category: student.category || 'Niños'
        });
        setFixedSchedule(student.fixedSchedule || []);
        setStep(1);
        setIsModalOpen(true);
    };

    const handleDelete = async (dni: string) => {
        if (!confirm("¿Estás seguro de eliminar este alumno COMPLETAMENTE?")) return;
        try {
            await studentService.delete(dni);
            loadStudents();
        } catch (error) {
            console.error("Error deleting student:", error);
            alert("Error al eliminar");
        }
    };

    const toggleSlot = (dayId: string, timeId: string) => {
        const exists = fixedSchedule.find(s => s.dayId === dayId && s.timeId === timeId);
        if (exists) {
            setFixedSchedule(fixedSchedule.filter(s => !(s.dayId === dayId && s.timeId === timeId)));
        } else {
            setFixedSchedule([...fixedSchedule, { dayId, timeId }]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingStudent) {
                await studentService.update(editingStudent.dni, {
                    fullName: formData.fullName,
                    phone: formData.phone,
                    email: formData.email,
                    category: formData.category,
                    fixedSchedule: fixedSchedule
                });
            } else {
                await studentService.create({
                    id: formData.dni,
                    ...formData,
                    category: formData.category,
                    fixedSchedule: fixedSchedule
                }, {
                    amountPaid: Number(paymentData.amountPaid) || 0,
                    totalCost: Number(paymentData.totalCost) || 0,
                    credits: Number(paymentData.credits) || 0,
                    method: paymentData.method
                });
            }
            setIsModalOpen(false);
            loadStudents();
        } catch (error: any) {
            console.error("Error saving student:", error);
            alert(error.message || "Error al guardar");
        }
    };

    // DEBT HANDLERS
    const handleOpenDebt = async (student: Student) => {
        setStudentForDebt(student);
        setIsDebtModalOpen(true);
        setSelectedDebts([]);
        try {
            const debts = await studentService.getDebts(student.dni);
            setSelectedDebts(debts);
        } catch (e) {
            console.error(e);
            alert("Error cargando deudas");
        }
    };

    const handlePayDebt = async (debt: Debt) => {
        const amount = prompt(`Monto a pagar para esta deuda(Saldo: S / ${debt.balance.toFixed(2)})`, debt.balance.toString());
        if (!amount) return;

        const payAmount = Number(amount);
        if (isNaN(payAmount) || payAmount <= 0) {
            alert("Monto inválido");
            return;
        }

        try {
            await studentService.payDebt(debt.id, payAmount, 'CASH'); // Default CASH for now
            alert("Deuda actualizada");

            // Refresh
            const updatedDebts = await studentService.getDebts(studentForDebt!.dni);
            setSelectedDebts(updatedDebts);

            // If cleared, reload students
            if (updatedDebts.length === 0) {
                loadStudents();
                setIsDebtModalOpen(false);
            } else {
                // If specific debt paid but others remain
                // loadStudents(); // to update the red line if partial? No only if full clear.
                // We keep modal open.
            }
        } catch (e: any) {
            alert(e.message);
        }
    };


    const getCategoryLabel = (cat: StudentCategory) => cat;

    const getCategoryColor = (cat: StudentCategory) => {
        switch (cat) {
            case 'Niños': return 'bg-orange-100 text-orange-700';
            case 'Adolescentes': return 'bg-purple-100 text-purple-700';
            case 'Adultos': return 'bg-blue-100 text-blue-700';
            default: return 'bg-slate-100 text-slate-500';
        }
    };

    const filteredStudents = students.filter(s =>
        s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.dni.includes(searchTerm)
    );

    const debtAmount = Number(paymentData.totalCost) - Number(paymentData.amountPaid);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-slate-800">Alumnos</h2>
                <button
                    onClick={handleCreateNew}
                    className="bg-slate-900 text-white px-4 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Alumno
                </button>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
                <Search className="w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por nombre o DNI..."
                    className="flex-1 outline-none text-slate-700 placeholder-slate-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {loading ? (
                    <p className="text-center text-slate-500 col-span-full py-12">Cargando...</p>
                ) : filteredStudents.length === 0 ? (
                    <div className="text-center text-slate-500 col-span-full py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                        <p>No se encontraron alumnos</p>
                    </div>
                ) : (
                    filteredStudents.map(student => (
                        <div key={student.id} className={`bg-white p-6 rounded-2xl shadow-sm border ${student.hasDebt ? 'border-red-200' : 'border-slate-100'} hover:shadow-md transition-all group relative overflow-hidden`}>
                            {student.hasDebt && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />
                            )}

                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-sky-50 group-hover:text-sky-600 transition-colors">
                                    <User className="w-6 h-6" />
                                </div>
                                <div className="flex gap-2">
                                    {student.hasDebt && (
                                        <button
                                            onClick={() => handleOpenDebt(student)}
                                            className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors flex items-center gap-1"
                                            title="Pagar Deuda"
                                        >
                                            <DollarSign className="w-3 h-3" /> Pagar
                                        </button>
                                    )}
                                    <button onClick={() => handleEdit(student)} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(student.dni)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                                {student.fullName}
                                {student.category && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${getCategoryColor(student.category)}`}>
                                        {getCategoryLabel(student.category)}
                                    </span>
                                )}
                            </h3>
                            <p className="text-sm text-slate-400 font-mono mb-4">DNI: {student.dni}</p>

                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                                <Phone className="w-4 h-4" />
                                <span>{student.phone}</span>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                <span className={`inline - block px - 3 py - 1 rounded - full text - xs font - bold ${student.remainingCredits > 0
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-slate-100 text-slate-500'
                                    } `}>
                                    {student.remainingCredits} Clases
                                </span>

                                <button className="bg-sky-50 hover:bg-sky-100 text-sky-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" />
                                    Recargar
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* WIZARD MODAL (Create/Edit) */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    {/* ... (Existing Modal Code) ... */}
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">
                                    {editingStudent ? 'Editar Alumno' : 'Nuevo Registro'}
                                </h3>
                                <p className="text-sm text-slate-500">Paso {step} de 3</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        {/* Steps Indicator */}
                        <div className="flex p-4 gap-2">
                            <div className={`h - 1 flex - 1 rounded - full ${step >= 1 ? 'bg-sky-600' : 'bg-slate-200'} `} />
                            <div className={`h - 1 flex - 1 rounded - full ${step >= 2 ? 'bg-sky-600' : 'bg-slate-200'} `} />
                            <div className={`h - 1 flex - 1 rounded - full ${step >= 3 ? 'bg-sky-600' : 'bg-slate-200'} `} />
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">

                            {/* STEP 1: PERSONAL DATA */}
                            {step === 1 && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Datos Personales</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                                        <input required type="text" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                            value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">DNI (ID)</label>
                                            <input required disabled={!!editingStudent} type="text" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                value={formData.dni} onChange={e => setFormData({ ...formData, dni: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                                            <input required type="tel" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                                            <select
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 bg-white"
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value as StudentCategory })}
                                            >
                                                <option value="Niños">Niños</option>
                                                <option value="Adolescentes">Adolescentes</option>
                                                <option value="Adultos">Adultos</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-slate-300">(Opcional)</span></label>
                                            <input type="email" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: SCHEDULE */}
                            {step === 2 && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Horario Fijo (Matrícula)</h4>
                                    <p className="text-xs text-slate-500 mb-4">Selecciona los días y horas que el alumno asistirá regularmente.</p>

                                    <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 text-xs overflow-x-auto pb-4">
                                        <div className="p-2 font-bold text-slate-400"></div>
                                        {DAYS.map(d => (
                                            <div key={d.id} className="p-2 text-center font-bold text-slate-600 bg-slate-50 rounded">{d.id}</div>
                                        ))}

                                        {HOURS.map(h => (
                                            <div key={h.id} className="contents">
                                                <div className="p-2 font-mono text-slate-400 whitespace-nowrap flex items-center justify-end pr-4">
                                                    {h.label.split(' - ')[0]}
                                                </div>
                                                {DAYS.map(d => {
                                                    const isSelected = fixedSchedule.some(s => s.dayId === d.id && s.timeId === h.id);
                                                    return (
                                                        <button
                                                            key={`${d.id}_${h.id} `}
                                                            type="button"
                                                            onClick={() => toggleSlot(d.id, h.id)}
                                                            className={`p - 2 rounded border transition - colors flex items - center justify - center ${isSelected
                                                                ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                                                                : 'bg-white text-transparent border-slate-100 hover:border-sky-300 hover:bg-sky-50'
                                                                } `}
                                                        >
                                                            <CheckCircle className="w-4 h-4" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-sm text-right text-slate-500 font-bold">{fixedSchedule.length} Clases / semana</p>
                                </div>
                            )}

                            {/* STEP 3: PAYMENT */}
                            {step === 3 && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Pago Inicial y Deuda</h4>

                                    {editingStudent ? (
                                        <div className="bg-slate-50 p-4 rounded-xl text-center text-slate-500">
                                            <p>La edición de pagos se realiza en el módulo de Finanzas.</p>
                                            <p className="text-xs mt-2">Sólo se guardarán los cambios de Datos Personales y Horario.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Número de clases </label>
                                                    <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                        value={paymentData.credits} onChange={e => setPaymentData({ ...paymentData, credits: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Costo Total</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2 text-slate-400">S/</span>
                                                        <input type="number" className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                            value={paymentData.totalCost} onChange={e => setPaymentData({ ...paymentData, totalCost: e.target.value })}
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">A Cuenta (Pagado)</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2 text-slate-400">S/</span>
                                                        <input type="number" className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold"
                                                            value={paymentData.amountPaid} onChange={e => setPaymentData({ ...paymentData, amountPaid: e.target.value })}
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Método de Pago</label>
                                                    <select className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 bg-white"
                                                        value={paymentData.method} onChange={e => setPaymentData({ ...paymentData, method: e.target.value as PaymentMethod })}
                                                    >
                                                        <option value="CASH">EFECTIVO</option>
                                                        <option value="YAPE">YAPE / PLIN</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {debtAmount > 0 && (
                                                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl border border-red-100 flex justify-between items-center animate-in zoom-in duration-200">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-5 h-5" />
                                                        <span className="text-sm font-medium">Deuda Pendiente</span>
                                                    </div>
                                                    <span className="text-xl font-bold">S/ {debtAmount.toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </form>

                        {/* Footer / Navigation */}
                        <div className="p-4 border-t border-slate-100 flex justify-between bg-slate-50/50">
                            {step > 1 ? (
                                <button type="button" onClick={() => setStep(step - 1)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium flex items-center gap-2">
                                    <ArrowLeft className="w-4 h-4" /> Anterior
                                </button>
                            ) : (
                                <div /> /* Spacer */
                            )}

                            {step < 3 ? (
                                <button type="button" onClick={() => setStep(step + 1)} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 flex items-center gap-2">
                                    Siguiente <ArrowRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button onClick={handleSubmit} type="button" className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-lg shadow-emerald-600/20">
                                    <CheckCircle className="w-4 h-4" />
                                    {editingStudent ? 'Actualizar Alumno' : 'Finalizar Registro'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DEBT MODAL */}
            {isDebtModalOpen && studentForDebt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-red-50">
                            <div>
                                <h3 className="text-xl font-bold text-red-800">Pagos Pendientes</h3>
                                <p className="text-sm text-red-600">{studentForDebt.fullName}</p>
                            </div>
                            <button onClick={() => setIsDebtModalOpen(false)} className="text-red-400 hover:text-red-600">✕</button>
                        </div>

                        <div className="p-6 space-y-4">
                            {selectedDebts.length === 0 ? (
                                <p className="text-center text-slate-500">Cargando deudas o no tiene pendientes...</p>
                            ) : (
                                selectedDebts.map(debt => (
                                    <div key={debt.id} className="border border-slate-100 rounded-xl p-4 shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-bold text-slate-700">{debt.slotId}</span>
                                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">PENDIENTE</span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-xs text-slate-400">Total: S/ {debt.amountTotal}</p>
                                                <p className="text-xs text-slate-400">Pagado: S/ {debt.amountPaid}</p>
                                                <p className="text-lg font-bold text-slate-800 mt-1">Saldo: S/ {debt.balance.toFixed(2)}</p>
                                            </div>
                                            <button
                                                onClick={() => handlePayDebt(debt)}
                                                className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                                            >
                                                Pagar
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
