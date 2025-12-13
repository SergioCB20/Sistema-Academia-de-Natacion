import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User,
    Search,
    Trash2,
    Pencil,
    Phone,
    CreditCard,
    Plus,
    Calendar,
    ArrowRight,
    ArrowLeft,
    CheckCircle,
    DollarSign,
    Printer,
    Clock
} from 'lucide-react';
import { studentService } from '../services/students';
import { categoryService } from '../services/categoryService';


import { seasonService } from '../services/seasonService';
import { packageValidationService } from '../services/packageValidation';
import type { Student, PaymentMethod, Debt, Category, Package, Season, DayType } from '../types/db';

export default function Students() {
    const navigate = useNavigate();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Dynamic Data from DB
    const [categories, setCategories] = useState<Category[]>([]);
    const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
    const [loadingPackages, setLoadingPackages] = useState(false);
    const [activeSeason, setActiveSeason] = useState<Season | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [step, setStep] = useState(1); // 1: Personal, 2: Schedule, 3: Payment, 4: Confirmation
    const [registeredStudentDni, setRegisteredStudentDni] = useState<string | null>(null);

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
        birthDate: '',
        age: '',
        categoryId: ''
    });

    const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
    const [selectedSchedulePattern, setSelectedSchedulePattern] = useState<{
        dayType: DayType;
        timeSlot: string;
    } | null>(null);
    const [fixedSchedule, setFixedSchedule] = useState<Array<{ dayId: string, timeId: string }>>([]);

    const [paymentData, setPaymentData] = useState({
        amountPaid: '',
        totalCost: '0.00',
        credits: '12',
        method: 'CASH' as PaymentMethod
    });

    useEffect(() => {
        loadStudents();
        loadCategories();
        loadActiveSeason();
    }, []);

    // Load packages when category changes and we're on step 2
    useEffect(() => {
        if (step === 2 && formData.categoryId && !editingStudent && activeSeason) {
            loadAvailablePackagesForCategory(formData.categoryId);
            // Clear previously selected package and schedule when category changes
            setSelectedPackage(null);
            setSelectedSchedulePattern(null);
            setFixedSchedule([]);
        }
    }, [step, formData.categoryId, activeSeason]);

    const loadStudents = async () => {
        setLoading(true);
        try {
            const data = await studentService.getAllActive();
            setStudents(data);
        } catch (error) {
            console.error("Error loading students:", error);
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            const cats = await categoryService.getAll();
            setCategories(cats.filter(c => c.isActive).sort((a, b) => a.order - b.order));
        } catch (error) {
            console.error("Error loading categories:", error);
        }
    };

    const loadActiveSeason = async () => {
        try {
            const season = await seasonService.getActiveSeason();
            setActiveSeason(season);
        } catch (error) {
            console.error("Error loading active season:", error);
        }
    };

    const loadAvailablePackagesForCategory = async (categoryId: string) => {
        if (!categoryId || !activeSeason) return;

        setLoadingPackages(true);
        try {
            const packages = await packageValidationService.getAvailablePackages(
                activeSeason.id,
                categoryId
            );
            setAvailablePackages(packages);
        } catch (error) {
            console.error("Error loading packages:", error);
        } finally {
            setLoadingPackages(false);
        }
    };



    const handleCreateNew = () => {
        setEditingStudent(null);
        setFormData({ fullName: '', dni: '', phone: '', email: '', birthDate: '', age: '', categoryId: '' });
        setFixedSchedule([]);
        setPaymentData({ amountPaid: '', totalCost: '0.00', credits: '12', method: 'CASH' });
        setStep(1);
        setRegisteredStudentDni(null);

        setIsModalOpen(true);
    };

    const handleEdit = (student: Student) => {
        setEditingStudent(student);
        setFormData({
            fullName: student.fullName,
            dni: student.dni,
            phone: student.phone,
            email: student.email || '',
            birthDate: student.birthDate || '',
            age: student.age ? String(student.age) : '',
            categoryId: student.categoryId || ''
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


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // VALIDATIONS
        if (formData.dni && !/^\d{8}$/.test(formData.dni)) {
            alert("El DNI debe tener 8 números exactos.");
            return;
        }
        if (formData.phone && !/^\d{9}$/.test(formData.phone)) {
            alert("El Teléfono debe tener 9 números exactos.");
            return;
        }
        if (!formData.categoryId) {
            alert("Debe seleccionar una edad para asignar la categoría.");
            return;
        }

        try {
            if (editingStudent) {
                await studentService.update(editingStudent.dni, {
                    fullName: formData.fullName,
                    phone: formData.phone,
                    email: formData.email,
                    birthDate: formData.birthDate,
                    age: formData.age ? Number(formData.age) : undefined,
                    categoryId: formData.categoryId,
                    fixedSchedule: fixedSchedule
                });
                setIsModalOpen(false);
                loadStudents();
            } else {
                const newStudentDni = formData.dni || `TEMP_${Date.now()}`;

                // Calculate package dates if package is selected
                let packageStartDate: string | undefined;
                let packageEndDate: string | undefined;

                if (selectedPackage && selectedSchedulePattern) {
                    const startDate = new Date();
                    packageStartDate = startDate.toISOString().split('T')[0]; // YYYY-MM-DD

                    const endDate = packageValidationService.calculatePackageEndDate(
                        startDate,
                        selectedPackage,
                        selectedSchedulePattern.dayType
                    );
                    packageEndDate = endDate.toISOString().split('T')[0]; // YYYY-MM-DD
                }

                await studentService.create({
                    id: newStudentDni,
                    ...formData,
                    birthDate: formData.birthDate,
                    age: formData.age ? Number(formData.age) : undefined,
                    categoryId: formData.categoryId,
                    fixedSchedule: fixedSchedule,
                    currentPackageId: selectedPackage?.id,
                    packageStartDate,
                    packageEndDate
                }, {
                    amountPaid: Number(paymentData.amountPaid) || 0,
                    totalCost: Number(paymentData.totalCost) || 0,
                    credits: Number(paymentData.credits) || 0,
                    method: paymentData.method
                });

                // Go to step 4 (confirmation) instead of closing
                setRegisteredStudentDni(newStudentDni);
                setStep(4);
                loadStudents();
            }
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
        const amount = prompt(`Monto a pagar para esta deuda (Saldo: S/ ${debt.balance.toFixed(2)})`, debt.balance.toString());
        if (!amount) return;

        const payAmount = Number(amount);
        if (isNaN(payAmount) || payAmount <= 0) {
            alert("Monto inválido");
            return;
        }

        try {
            await studentService.payDebt(debt.id, payAmount, 'CASH');
            alert("Deuda actualizada");

            const updatedDebts = await studentService.getDebts(studentForDebt!.dni);
            setSelectedDebts(updatedDebts);

            if (updatedDebts.length === 0) {
                loadStudents();
                setIsDebtModalOpen(false);
            }
        } catch (e: any) {
            alert(e.message);
        }
    };

    // Get category from DB by ID
    const getCategoryById = (id: string): Category | undefined => {
        return categories.find(c => c.id === id);
    };

    // Auto-calculate category from age using DB categories
    const getCategoryIdFromAge = (age: number): string => {
        const category = categories.find(c => age >= c.ageRange.min && age <= c.ageRange.max);
        return category?.id || '';
    };

    // Handle age change and auto-update category
    const handleAgeChange = (ageValue: string) => {
        const age = parseInt(ageValue);
        const newCategoryId = !isNaN(age) && age >= 1 ? getCategoryIdFromAge(age) : '';
        setFormData({ ...formData, age: ageValue, categoryId: newCategoryId });
    };

    const handleNextStep = () => {
        if (step === 1) {
            // Validate Step 1
            if (!formData.fullName.trim()) {
                alert("El nombre es requerido.");
                return;
            }
            if (formData.dni && !/^\d{8}$/.test(formData.dni)) {
                alert("El DNI debe tener 8 números exactos.");
                return;
            }
            if (formData.phone && !/^\d{9}$/.test(formData.phone)) {
                alert("El Teléfono debe tener 9 números exactos.");
                return;
            }
            if (!formData.categoryId) {
                alert("Debe ingresar una edad para asignar la categoría.");
                return;
            }
        }

        if (step === 2 && !editingStudent) {
            if (activeSeason && !selectedPackage && fixedSchedule.length === 0) {
                if (!confirm("No has seleccionado ningún paquete. ¿Deseas continuar sin matrícula?")) {
                    return;
                }
            } else if (selectedPackage && fixedSchedule.length === 0) {
                if (!confirm("Has seleccionado un paquete pero no has elegido el patrón de horario. ¿Deseas continuar sin definir el horario?")) {
                    return;
                }
            } else if (!selectedPackage && fixedSchedule.length === 0) {
                if (!confirm("No has seleccionado ningún horario. ¿Deseas continuar sin horario fijo?")) {
                    return;
                }
            }
        }

        setStep(step + 1);
    };

    const handlePrevStep = () => {
        setStep(step - 1);
    };

    const filteredStudents = students.filter(s =>
        s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.dni.includes(searchTerm)
    );

    const debtAmount = Number(paymentData.totalCost) - Number(paymentData.amountPaid);

    const currentCategory = formData.categoryId ? getCategoryById(formData.categoryId) : null;

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
                    filteredStudents.map(student => {
                        const studentCategory = student.categoryId ? getCategoryById(student.categoryId) : null;

                        return (
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
                                    {studentCategory && (
                                        <span
                                            className="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider"
                                            style={{
                                                backgroundColor: studentCategory.color ? `${studentCategory.color}20` : '#f1f5f9',
                                                color: studentCategory.color || '#64748b'
                                            }}
                                        >
                                            {studentCategory.name}
                                        </span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-400 font-mono mb-4">DNI: {student.dni}</p>

                                <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                                    <Phone className="w-4 h-4" />
                                    <span>{student.phone}</span>
                                </div>

                                <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${student.remainingCredits > 0
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-100 text-slate-500'
                                        }`}>
                                        {student.remainingCredits} Clases
                                    </span>

                                    <button className="bg-sky-50 hover:bg-sky-100 text-sky-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                                        <CreditCard className="w-4 h-4" />
                                        Recargar
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* WIZARD MODAL (Create/Edit) */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">
                                    {editingStudent ? 'Editar Alumno' : 'Nuevo Registro'}
                                </h3>
                                <p className="text-sm text-slate-500">Paso {step} de {editingStudent ? 3 : 4}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        {/* Steps Indicator */}
                        <div className="flex p-4 gap-2">
                            <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-sky-600' : 'bg-slate-200'}`} />
                            <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-sky-600' : 'bg-slate-200'}`} />
                            <div className={`h-1 flex-1 rounded-full ${step >= 3 ? 'bg-sky-600' : 'bg-slate-200'}`} />
                            {!editingStudent && (
                                <div className={`h-1 flex-1 rounded-full ${step >= 4 ? 'bg-sky-600' : 'bg-slate-200'}`} />
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">

                            {/* STEP 1: PERSONAL DATA */}
                            {step === 1 && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Datos Personales</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo *</label>
                                        <input required type="text" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                            value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Edad *</label>
                                        <input required type="number" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                            value={formData.age} onChange={e => handleAgeChange(e.target.value)}
                                            placeholder="Ej. 6"
                                            min="1"
                                            max="100"
                                        />
                                        {formData.age && !formData.categoryId && (
                                            <p className="text-xs text-red-500 mt-1">No hay categoría disponible para esta edad</p>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">DNI (ID) <span className="text-slate-300 font-normal">(Opcional)</span></label>
                                            <input disabled={!!editingStudent} type="text" maxLength={8} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                value={formData.dni} onChange={e => setFormData({ ...formData, dni: e.target.value.replace(/\D/g, '') })}
                                                placeholder="8 dígitos"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono <span className="text-slate-300 font-normal">(Opcional)</span></label>
                                            <input type="tel" maxLength={9} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                                                placeholder="9 dígitos"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Categoría <span className="text-slate-300 font-normal">(Auto)</span></label>
                                            <input
                                                type="text"
                                                disabled
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                                                value={currentCategory?.name || 'Ingrese edad'}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-slate-300 font-normal">(Opcional)</span></label>
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
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Selección de Paquete</h4>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Selecciona un paquete disponible para <span className="font-bold">{currentCategory?.name}</span>
                                    </p>

                                    {loadingPackages ? (
                                        <div className="text-center py-12">
                                            <Clock className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
                                            <p className="text-slate-500">Cargando paquetes disponibles...</p>
                                        </div>
                                    ) : availablePackages.length === 0 ? (
                                        <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                            <p className="text-slate-500">No hay paquetes disponibles para esta categoría.</p>
                                            <p className="text-xs text-slate-400 mt-2">Crea paquetes desde "Paquetes"</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* Package Selection */}
                                            {!selectedPackage ? (
                                                <div className="space-y-3">
                                                    <p className="text-xs font-bold text-slate-600 mb-2">PASO 1: Elige un paquete</p>
                                                    {availablePackages.map((pkg) => (
                                                        <button
                                                            key={pkg.id}
                                                            type="button"
                                                            onClick={() => setSelectedPackage(pkg)}
                                                            className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-sky-300 hover:shadow-sm transition-all text-left bg-white"
                                                        >
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div>
                                                                    <h6 className="font-bold text-slate-800 mb-1">{pkg.name}</h6>
                                                                    <p className="text-xs text-slate-500">
                                                                        {pkg.classesPerMonth} clases/mes × {pkg.duration} {pkg.duration === 1 ? 'mes' : 'meses'}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-lg font-bold text-sky-600">S/ {pkg.price}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2 flex-wrap mt-2">
                                                                {(Array.isArray(pkg.scheduleTypes) ? pkg.scheduleTypes : []).map((dayType) => (
                                                                    <span key={dayType} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">
                                                                        {dayType === 'lun-mier-vier' ? 'Lun-Mié-Vie' : dayType === 'mar-juev' ? 'Mar-Jue' : 'Sáb-Dom'}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {/* Selected Package Summary */}
                                                    <div className="bg-sky-50 p-4 rounded-xl border border-sky-200">
                                                        <div className="flex items-start justify-between">
                                                            <div>
                                                                <p className="text-xs text-sky-600 font-bold mb-1">PAQUETE SELECCIONADO</p>
                                                                <h6 className="font-bold text-slate-800">{selectedPackage.name}</h6>
                                                                <p className="text-xs text-slate-600 mt-1">
                                                                    {selectedPackage.classesPerMonth} clases/mes × {selectedPackage.duration} {selectedPackage.duration === 1 ? 'mes' : 'meses'} = {selectedPackage.classesPerMonth * selectedPackage.duration} clases totales
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedPackage(null);
                                                                    setSelectedSchedulePattern(null);
                                                                    setFixedSchedule([]);
                                                                }}
                                                                className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                                                            >
                                                                Cambiar
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Schedule Pattern Selection */}
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-600 mb-2">PASO 2: Elige el patrón de horario</p>
                                                        <div className="space-y-2">
                                                            {(Array.isArray(selectedPackage.scheduleTypes) ? selectedPackage.scheduleTypes : []).map((dayType) => {
                                                                const canComplete = activeSeason && packageValidationService.canCompleteBeforeSeasonEnd(
                                                                    selectedPackage,
                                                                    dayType,
                                                                    activeSeason.endDate
                                                                );
                                                                const isSelected = selectedSchedulePattern?.dayType === dayType;

                                                                // Calculate actual classes if cannot complete
                                                                const actualClasses = !canComplete && activeSeason
                                                                    ? packageValidationService.calculateActualClasses(new Date(), activeSeason.endDate, dayType)
                                                                    : 0;

                                                                return (
                                                                    <button
                                                                        key={dayType}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            // Allow selection even if time is insufficient, just warn visibly (UI already shows warning)
                                                                            setSelectedSchedulePattern({ dayType, timeSlot: '' });
                                                                            setFixedSchedule([{ dayId: dayType, timeId: '' }]);
                                                                        }}
                                                                        className={`w-full p-3 rounded-lg border-2 transition-all text-left ${isSelected
                                                                            ? 'bg-sky-600 text-white border-sky-600 shadow-md'
                                                                            : !canComplete
                                                                                ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                                                                                : 'bg-white border-slate-200 hover:border-sky-300 hover:shadow-sm'
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <div>
                                                                                <p className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                                                                                    {dayType === 'lun-mier-vier' ? 'Lunes, Miércoles, Viernes' :
                                                                                        dayType === 'mar-juev' ? 'Martes, Jueves' :
                                                                                            'Sábado, Domingo'}
                                                                                </p>
                                                                                <p className={`text-xs ${isSelected ? 'text-sky-100' : 'text-slate-500'}`}>
                                                                                    {packageValidationService.getClassesPerWeek(dayType)} clases por semana
                                                                                </p>
                                                                                {!canComplete && (
                                                                                    <div className={`text-xs mt-1 font-bold ${isSelected ? 'text-red-200' : 'text-amber-600'}`}>
                                                                                        <p>⚠️ La temporada termina antes de completar el paquete</p>
                                                                                        <p className="mt-0.5 opacity-90">
                                                                                            Solo se podrán dar {actualClasses} clases (El precio se mantiene)
                                                                                        </p>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            {isSelected && <CheckCircle className="w-5 h-5" />}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <p className="text-sm text-right text-slate-500 font-bold mt-4">
                                        {!selectedPackage
                                            ? 'Selecciona un paquete para continuar'
                                            : !selectedSchedulePattern
                                                ? '⚠️ Debes seleccionar un patrón de horario'
                                                : '✓ Paquete y horario seleccionados'}
                                    </p>
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

                            {/* STEP 4: CONFIRMATION (Only for new students) */}
                            {step === 4 && !editingStudent && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 text-center py-8">
                                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle className="w-12 h-12 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h4 className="text-2xl font-bold text-slate-800 mb-2">¡Alumno Registrado!</h4>
                                        <p className="text-slate-600">El alumno ha sido registrado exitosamente en el sistema.</p>
                                    </div>

                                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-6">
                                        <Printer className="w-8 h-8 text-sky-600 mx-auto mb-3" />
                                        <h5 className="font-bold text-slate-800 mb-2">¿Desea imprimir el carnet ahora?</h5>
                                        <p className="text-sm text-slate-600 mb-4">Puede imprimir el carnet del alumno para entregárselo</p>

                                        <div className="flex gap-3 justify-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsModalOpen(false);
                                                }}
                                                className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition-colors"
                                            >
                                                Ahora No
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsModalOpen(false);
                                                    if (registeredStudentDni) {
                                                        navigate(`/carnet?dni=${registeredStudentDni}`);
                                                    }
                                                }}
                                                className="px-6 py-2 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700 transition-colors flex items-center gap-2 shadow-lg shadow-sky-600/20"
                                            >
                                                <Printer className="w-4 h-4" />
                                                Imprimir Carnet
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </form>

                        {/* Footer / Navigation */}
                        {step < 4 && (
                            <div className="p-4 border-t border-slate-100 flex justify-between bg-slate-50/50">
                                {step > 1 ? (
                                    <button type="button" onClick={handlePrevStep} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium flex items-center gap-2">
                                        <ArrowLeft className="w-4 h-4" /> Anterior
                                    </button>
                                ) : (
                                    <div /> /* Spacer */
                                )}

                                {step < 3 ? (
                                    <button type="button" onClick={handleNextStep} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 flex items-center gap-2">
                                        Siguiente <ArrowRight className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button onClick={handleSubmit} type="button" className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-lg shadow-emerald-600/20">
                                        <CheckCircle className="w-4 h-4" />
                                        {editingStudent ? 'Actualizar Alumno' : 'Finalizar Registro'}
                                    </button>
                                )}
                            </div>
                        )}
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
