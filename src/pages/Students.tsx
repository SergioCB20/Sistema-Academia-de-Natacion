import { useState, useEffect, useRef, useMemo } from 'react';
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
    Clock,
    AlertCircle,
    AlertTriangle,
    Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { studentService } from '../services/students';
import { categoryService } from '../services/categoryService';
import { scheduleTemplateService } from '../services/scheduleTemplateService';
import { paymentMethodService } from '../services/paymentMethodService';
import { seasonService } from '../services/seasonService';
import { packageValidationService } from '../services/packageValidation';
import { calculateRealRemaining } from '../utils/studentUtils';
import { monthlyScheduleService } from '../services/monthlyScheduleService';
import type { Student, Debt, Category, Package, Season, DayType, ScheduleTemplate, PaymentMethodConfig } from '../types/db';

export default function Students() {
    const navigate = useNavigate();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const isSubmittingRef = useRef(false);

    // Dynamic Data from DB
    const [categories, setCategories] = useState<Category[]>([]);
    const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
    const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [activeSeason, setActiveSeason] = useState<Season | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Capacity Data
    const [capacityInfo, setCapacityInfo] = useState<Record<string, {
        totalCapacity: number;
        currentEnrollment: number;
        available: number;
        isFull: boolean;
        earliestAvailableDate: Date | null;
    }>>({});
    const [loadingCapacity, setLoadingCapacity] = useState(false);
    const [minPackageStartDate, setMinPackageStartDate] = useState<string | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [step, setStep] = useState(1); // 1: Personal, 2: Schedule, 3: Payment, 4: Confirmation
    const [registeredStudentDni, setRegisteredStudentDni] = useState<string | null>(null);

    // DEBT Modal State
    const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
    const [selectedDebts, setSelectedDebts] = useState<Debt[]>([]);
    const [studentForDebt, setStudentForDebt] = useState<Student | null>(null);

    // RECHARGE Modal State
    const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
    const [studentForRecharge, setStudentForRecharge] = useState<Student | null>(null);
    const [rechargeData, setRechargeData] = useState({
        credits: '1',
        amount: '',
        newEndDate: ''
    });

    // ATTENDANCE Modal State
    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
    const [studentForAttendance, setStudentForAttendance] = useState<Student | null>(null);
    const [attendanceData, setAttendanceData] = useState({
        fecha: new Date().toISOString().split('T')[0], // Default to today
        asistencia: true // Default to attended
    });

    // Form Data
    const [formData, setFormData] = useState({
        fullName: '',
        dni: '',
        phone: '',
        email: '',
        birthDate: '',
        age: '',
        categoryId: '',
        packageId: '',
        paymentMethodId: '',
        packageStartDate: '', // Optional future start date
        packageEndDate: ''
    });

    const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
    const [fixedSchedule, setFixedSchedule] = useState<Array<{ dayId: string, timeId: string }>>([]);

    const [paymentData, setPaymentData] = useState({
        amountPaid: '',
        totalCost: '0.00',
        credits: '12',
        methodId: '', // Use ID instead of hardcoded type
        startDate: new Date().toISOString().split('T')[0],
        endDate: ''
    });
    const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethodConfig[]>([]);

    useEffect(() => {
        loadCategories();
        loadActiveSeason();
        loadPaymentMethods();
    }, []);

    // Load students when Active Season is ready
    useEffect(() => {
        if (activeSeason) {
            loadStudents();
        }
    }, [activeSeason]);

    // Load templates when category changes and we're on step 2
    useEffect(() => {
        if (step === 2 && formData.categoryId && activeSeason) {
            loadTemplates(formData.categoryId); // Category-specific templates
        }
    }, [step, formData.categoryId, activeSeason]);

    // Load packages when season and category are available
    useEffect(() => {
        if (activeSeason && formData.categoryId) {
            loadAvailablePackages(formData.categoryId);
        }
    }, [activeSeason, formData.categoryId]);

    // Auto-calculate Package End Date
    useEffect(() => {
        if (paymentData.startDate && Number(paymentData.credits) > 0 && fixedSchedule.length > 0) {
            // Fix: Parse YYYY-MM-DD manually to create Local Date
            const [y, m, d] = paymentData.startDate.split('-').map(Number);
            const start = new Date(y, m - 1, d);

            const selectedDays = Array.from(new Set(fixedSchedule.map(s => s.dayId))); // ['LUN', 'MIE', 'VIE']

            const calculatedEnd = packageValidationService.calculatePreciseEndDate(
                start,
                Number(paymentData.credits),
                selectedDays
            );

            setPaymentData(prev => ({
                ...prev,
                endDate: calculatedEnd.toISOString().split('T')[0]
            }));
        } else {
            setPaymentData(prev => ({ ...prev, endDate: '' }));
        }
    }, [paymentData.startDate, paymentData.credits, fixedSchedule]);

    const loadStudents = async () => {
        if (!activeSeason) return; // Wait for season to load
        setLoading(true);
        try {
            const data = await studentService.getBySeason(activeSeason.id);
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

    const loadPaymentMethods = async () => {
        try {
            await paymentMethodService.seedInitial();
            const meths = await paymentMethodService.getActive();
            setAvailablePaymentMethods(meths);
        } catch (error) {
            console.error("Error loading payment methods:", error);
        }
    };

    // Auto-select first payment method when loaded or when opening a new form
    useEffect(() => {
        if (availablePaymentMethods.length > 0 && !paymentData.methodId) {
            setPaymentData(prev => ({ ...prev, methodId: availablePaymentMethods[0].id }));
        }
    }, [availablePaymentMethods, paymentData.methodId, isModalOpen]);

    const loadAvailablePackages = async (categoryId: string) => {
        if (!activeSeason || !categoryId) return;

        try {
            const packages = await packageValidationService.getAvailablePackages(
                activeSeason.id,
                categoryId
            );
            setAvailablePackages(packages);
        } catch (error) {
            console.error("Error loading packages:", error);
        }
    };

    const dayTypeLabels: Record<DayType, string> = {
        'lun-mier-vier': 'L-M-V (Lun-Mie-Vie)',
        'mar-juev': 'M-J (Mar-Jue)',
        'sab-dom': 'S-D (Sab-Dom)'
    };
    const dayTypeMapMapping: Record<DayType, string[]> = {
        'lun-mier-vier': ['LUN', 'MIE', 'VIE'],
        'mar-juev': ['MAR', 'JUE'],
        'sab-dom': ['SAB', 'DOM']
    };

    const loadTemplates = async (categoryId: string) => {
        if (!activeSeason || !categoryId) return;

        setLoadingTemplates(true);
        try {
            const allTemplates = await scheduleTemplateService.getBySeason(activeSeason.id);
            // Load ALL templates to build the global grid
            setTemplates(allTemplates);

            // Fetch capacity info for all templates
            setLoadingCapacity(true);
            const capacityPromises = allTemplates.map(async (template) => {
                const info = await monthlyScheduleService.getScheduleCapacityInfo(
                    activeSeason.id,
                    template.dayType,
                    template.timeSlot
                );
                return { key: `${template.dayType}-${template.timeSlot}`, info };
            });

            const results = await Promise.all(capacityPromises);
            const newCapacityInfo: any = {};
            results.forEach(res => {
                newCapacityInfo[res.key] = res.info;
            });
            setCapacityInfo(newCapacityInfo);

        } catch (error) {
            console.error("Error loading templates:", error);
        } finally {
            setLoadingTemplates(false);
            setLoadingCapacity(false);
        }
    };



    const handleCreateNew = () => {
        setEditingStudent(null);
        setFormData({
            fullName: '',
            dni: '',
            phone: '',
            email: '',
            birthDate: '',
            age: '',
            categoryId: '',
            packageId: '',
            paymentMethodId: '',
            packageStartDate: '',
            packageEndDate: ''
        });
        setFixedSchedule([]);
        setPaymentData({
            amountPaid: '',
            totalCost: '0.00',
            credits: '0',
            methodId: '', // The useEffect will pick the first one from availablePaymentMethods
            startDate: new Date().toISOString().split('T')[0],
            endDate: ''
        });
        setStep(1);
        setSelectedPackage(null);
        setRegisteredStudentDni(null);
        setIsModalOpen(true);
    };

    const handleEdit = (student: Student) => {
        setEditingStudent(student);
        setFormData({
            fullName: student.fullName,
            dni: student.dni.startsWith('TEMP_') ? '' : student.dni,
            phone: student.phone,
            email: student.email || '',
            birthDate: student.birthDate || '',
            age: student.age ? String(student.age) : '',
            categoryId: student.categoryId || '',
            packageId: student.currentPackageId || '',
            paymentMethodId: '',
            packageStartDate: student.packageStartDate || '',
            packageEndDate: student.packageEndDate || ''
        });
        setFixedSchedule(student.fixedSchedule || []);
        setStep(1);
        setIsModalOpen(true);
    };

    const handleDelete = async (studentId: string) => {
        if (!confirm("¿Estás seguro de eliminar este alumno COMPLETAMENTE?")) return;
        try {
            await studentService.delete(studentId);
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

        if (isSubmittingRef.current || isSaving) return;
        isSubmittingRef.current = true;
        setIsSaving(true);
        try {
            if (editingStudent) {
                await studentService.update(editingStudent.id, {
                    fullName: formData.fullName,
                    dni: formData.dni,
                    phone: formData.phone,
                    email: formData.email,
                    birthDate: formData.birthDate,
                    age: formData.age ? Number(formData.age) : null,
                    categoryId: formData.categoryId,
                    fixedSchedule: fixedSchedule,
                    packageStartDate: formData.packageStartDate || null,
                    packageEndDate: formData.packageEndDate || null
                });
                setIsModalOpen(false);
                loadStudents();
            } else {
                const newStudentDni = formData.dni || `TEMP_${Date.now()}`;

                // Calculate package dates if package is selected or credits are added
                // Prioritize formData.packageStartDate (from Step 2) over paymentData.startDate
                let packageStartDate: string | undefined = formData.packageStartDate || paymentData.startDate || undefined;
                let packageEndDate: string | undefined = paymentData.endDate || undefined;

                await studentService.create({
                    id: newStudentDni,
                    ...formData,
                    birthDate: formData.birthDate,
                    age: formData.age ? Number(formData.age) : null,
                    categoryId: formData.categoryId,
                    seasonId: activeSeason?.id, // Link to current season
                    fixedSchedule: fixedSchedule,
                    currentPackageId: selectedPackage?.id || null,
                    packageStartDate: packageStartDate || null,
                    packageEndDate: packageEndDate || null
                }, {
                    amountPaid: Number(paymentData.amountPaid) || 0,
                    totalCost: Number(paymentData.totalCost) || 0,
                    credits: Number(paymentData.credits) || 0,
                    method: paymentData.methodId
                });

                // Go to step 4 (confirmation) instead of closing
                setRegisteredStudentDni(newStudentDni);
                setStep(4);
                loadStudents();
            }
        } catch (error: any) {
            console.error("Error saving student:", error);
            alert(error.message || "Error al guardar");
        } finally {
            setIsSaving(false);
            isSubmittingRef.current = false;
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
            const defaultMethod = availablePaymentMethods.find(m => m.isActive)?.id || 'CASH';
            await studentService.payDebt(debt.id, payAmount, defaultMethod);
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

    // RECHARGE HANDLERS
    const handleOpenRecharge = (student: Student) => {
        setStudentForRecharge(student);
        setRechargeData({
            credits: '1',
            amount: '',
            newEndDate: student.packageEndDate || ''
        });
        setIsRechargeModalOpen(true);
    };

    const handleRechargeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!studentForRecharge) return;
        if (isSaving) return;

        setIsSaving(true);
        try {
            // Default to first active method or CASH
            const defaultMethod = availablePaymentMethods.find(m => m.isActive)?.id || 'CASH';

            await studentService.addCredits(
                studentForRecharge.id,
                Number(rechargeData.credits),
                Number(rechargeData.amount),
                defaultMethod,
                "ADMIN", // CreatedBy placeholder
                rechargeData.newEndDate || undefined
            );

            // alert("Recarga exitosa");
            setIsRechargeModalOpen(false);
            loadStudents();
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Error en recarga");
        } finally {
            setIsSaving(false);
        }
    };

    // Auto-calculate new end date when credits change in RECHARGE mode
    useEffect(() => {
        if (!isRechargeModalOpen || !studentForRecharge) return;

        const credits = Number(rechargeData.credits);
        if (credits > 0 && studentForRecharge.fixedSchedule && studentForRecharge.fixedSchedule.length > 0) {
            const selectedDays = Array.from(new Set(studentForRecharge.fixedSchedule.map(s => s.dayId)));

            const predictedEnd = packageValidationService.calculateExtensionDate(
                studentForRecharge.packageEndDate || null,
                credits,
                selectedDays
            );

            setRechargeData(prev => ({
                ...prev,
                newEndDate: predictedEnd.toISOString().split('T')[0]
            }));
        }
    }, [rechargeData.credits, studentForRecharge, isRechargeModalOpen]);

    // ATTENDANCE HANDLERS
    const handleOpenAttendance = (student: Student) => {
        setStudentForAttendance(student);
        setAttendanceData({
            fecha: new Date().toISOString().split('T')[0], // Reset to today
            asistencia: true // Default to attended
        });
        setIsAttendanceModalOpen(true);
    };

    const handleAttendanceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!studentForAttendance) return;
        if (isSaving) return;

        setIsSaving(true);
        try {
            await studentService.markAttendance(
                studentForAttendance.id,
                attendanceData.fecha,
                attendanceData.asistencia
            );

            setIsAttendanceModalOpen(false);
            loadStudents(); // Reload to show updated attendance
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Error al marcar asistencia");
        } finally {
            setIsSaving(false);
        }
    };

    // EXPORT TO EXCEL HANDLER
    const handleExportToExcel = () => {
        try {
            // Prepare data for export
            const exportData = students.map(student => {
                const category = getCategoryById(student.categoryId);

                // Format schedule
                let horario = '';
                if (student.fixedSchedule && student.fixedSchedule.length > 0) {
                    const days = Array.from(new Set(student.fixedSchedule.map(s => s.dayId))).join('-');
                    const times = Array.from(new Set(student.fixedSchedule.map(s => s.timeId))).join(', ');
                    horario = `${days} (${times})`;
                }

                // Count attendance (only "asistió" = true)
                const asistenciaCount = student.asistencia
                    ? student.asistencia.filter(a => a.asistencia === true).length
                    : 0;

                return {
                    'Codigo': student.studentCode || '',
                    'Nombre': student.fullName,
                    'Telefono': student.phone || '',
                    'Edad': student.age || '',
                    'Categoria': category?.name || '',
                    'Horario': horario,
                    'Asistencia': asistenciaCount
                };
            });

            // Create worksheet
            const ws = XLSX.utils.json_to_sheet(exportData);

            // Set column widths
            ws['!cols'] = [
                { wch: 10 }, // Codigo
                { wch: 30 }, // Nombre
                { wch: 12 }, // Telefono
                { wch: 6 },  // Edad
                { wch: 20 }, // Categoria
                { wch: 30 }, // Horario
                { wch: 10 }  // Asistencia
            ];

            // Create workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Alumnos');

            // Generate filename with current date
            const fecha = new Date().toISOString().split('T')[0];
            const filename = `Alumnos_Backup_${fecha}.xlsx`;

            // Download file
            XLSX.writeFile(wb, filename);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Error al exportar a Excel');
        }
    };

    // Get category from DB by ID
    const getCategoryById = (id: string): Category | undefined => {
        return categories.find(c => c.id === id);
    };

    // Auto-calculate category from age using DB categories
    const getCategoryIdFromAge = (age: number): string => {
        // Find Adulto for 18+
        if (age >= 18) {
            const adultCat = categories.find(c => c.name.toLowerCase().includes('adult') || (age >= c.ageRange.min && age <= c.ageRange.max && c.name.toLowerCase().includes('adult')));
            if (adultCat) return adultCat.id;
        }

        // Find 12-18 for ages 12-17
        if (age >= 12 && age <= 17) {
            const teenCat = categories.find(c => c.name.includes('12') && c.name.includes('18'));
            if (teenCat) return teenCat.id;
        }

        const category = categories.find(c => age >= c.ageRange.min && age <= c.ageRange.max);
        return category?.id || '';
    };

    // Handle age change and auto-update category
    const handleAgeChange = (ageValue: string) => {
        const age = parseInt(ageValue);
        const newCategoryId = !isNaN(age) && age >= 1 ? getCategoryIdFromAge(age) : '';
        setFormData({ ...formData, age: ageValue, categoryId: newCategoryId });
        // Clear schedule when category/age changes to prevent accumulation
        setFixedSchedule([]);
    };

    const handleNextStep = () => {
        if (step === 1) {
            // Validate Step 1
            if (!formData.fullName.trim()) {
                alert("El nombre es requerido.");
                return;
            }

            // Check for duplicate name (case insensitive, ignoring accents)
            const normalize = (str: string) =>
                str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

            const targetName = normalize(formData.fullName);
            const isDuplicate = students.some(s =>
                normalize(s.fullName) === targetName &&
                (!editingStudent || s.id !== editingStudent.id)
            );

            if (isDuplicate) {
                if (!confirm(`El alumno "${formData.fullName}" ya parece estar registrado. ¿Desea continuar de todos modos?`)) {
                    return;
                }
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

        if (step === 2) {
            if (fixedSchedule.length === 0) {
                if (!confirm("No has seleccionado ningún horario. ¿Deseas continuar?")) {
                    return;
                }
            }

            // Package selection is now manual
            // Auto-select "custom" if no standard packages match the filtered patterns
            if (filteredPackages.length === 0 && selectedDayTypes.length > 0) {
                setFormData(prev => ({ ...prev, packageId: 'custom' }));
            } else {
                setFormData(prev => ({ ...prev, packageId: '' }));
            }
            setSelectedPackage(null);

            // If we have a minimum start date (due to full capacity), pre-fill it
            let initialStartDate = paymentData.startDate;
            if (minPackageStartDate) {
                // Should we enforce this? Yes.
                if (!initialStartDate || initialStartDate < minPackageStartDate) {
                    initialStartDate = minPackageStartDate;
                }
            } else if (!initialStartDate) {
                // If no date set, default to today
                initialStartDate = new Date().toISOString().split('T')[0];
            }

            setPaymentData(prev => ({
                ...prev,
                credits: '',
                totalCost: '0.00',
                startDate: initialStartDate
            }));
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

    // Helper: Calculate which dayTypes are currently selected in the fixedSchedule
    const selectedDayTypes = useMemo(() => {
        const types = new Set<DayType>();
        fixedSchedule.forEach(fs => {
            (Object.entries(dayTypeMapMapping) as [DayType, string[]][]).forEach(([type, days]) => {
                if (days.includes(fs.dayId)) {
                    types.add(type);
                }
            });
        });
        return Array.from(types);
    }, [fixedSchedule]);

    // Filter packages based on selected day pattern
    const filteredPackages = useMemo(() => {
        if (selectedDayTypes.length === 0) return availablePackages;

        // If multiple day patterns are selected (e.g. L-M-V and M-J), show NO standard packages
        if (selectedDayTypes.length > 1) return [];

        const pattern = selectedDayTypes[0];
        if (pattern === 'lun-mier-vier') {
            // L-M-V: 12 or 24 classes
            return availablePackages.filter(p => p.classesPerMonth === 12 || p.classesPerMonth === 24);
        } else {
            // M-J or S-D: 8 or 16 classes
            return availablePackages.filter(p => p.classesPerMonth === 8 || p.classesPerMonth === 16);
        }
    }, [availablePackages, selectedDayTypes]);

    // Helper: Calculate elapsed classes for a student based on schedule and start date
    // calculateRealRemaining is now imported from ../utils/studentUtils
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-slate-800">Alumnos</h2>
                <div className="flex gap-3">
                    <button
                        onClick={handleExportToExcel}
                        className="bg-emerald-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                        title="Exportar a Excel"
                    >
                        <Download className="w-5 h-5" />
                        Exportar Excel
                    </button>
                    <button
                        onClick={handleCreateNew}
                        className="bg-slate-900 text-white px-4 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Alumno
                    </button>
                </div>
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
                                        <button onClick={() => handleDelete(student.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                                    {student.fullName}
                                    {student.hasDebt && (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold ml-2 animate-pulse">
                                            DEUDA
                                        </span>
                                    )}
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
                                <p className="text-sm text-slate-400 font-mono mb-4">
                                    DNI: {student.dni.startsWith('TEMP_') ? '(Sin DNI)' : student.dni}
                                </p>

                                <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                                    <Phone className="w-4 h-4" />
                                    <span>{(!student.phone || student.phone.toUpperCase() === 'SIN OBSERVACIONES') ? 'Sin teléfono' : student.phone}</span>
                                </div>
                                {student.studentCode && (
                                    <div className="flex items-center gap-2 text-sm text-sky-600 font-mono mb-4 bg-sky-50 px-2 py-1 rounded w-fit">
                                        <span className="font-bold">#{student.studentCode}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${calculateRealRemaining(student) > 0
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-100 text-slate-500'
                                        }`}>
                                        {calculateRealRemaining(student)} Clases
                                    </span>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleOpenAttendance(student)}
                                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                            title="Marcar Asistencia"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                            Asistencia
                                        </button>
                                        <button
                                            onClick={() => handleOpenRecharge(student)}
                                            className="bg-sky-50 hover:bg-sky-100 text-sky-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                        >
                                            <CreditCard className="w-4 h-4" />
                                            Recargar
                                        </button>
                                    </div>
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
                                        <div className="relative">
                                            <input required type="text" className={`w-full px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500/50 uppercase ${(() => {
                                                if (!formData.fullName) return 'border-slate-200';
                                                const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                                const target = normalize(formData.fullName);
                                                const isDup = students.some(s => normalize(s.fullName) === target);
                                                return isDup ? 'border-amber-400 bg-amber-50 text-amber-900 focus:border-amber-500 focus:ring-amber-200' : 'border-slate-200';
                                            })()}`}
                                                value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value.toUpperCase() })}
                                            />
                                            {(() => {
                                                if (!formData.fullName) return null;
                                                const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                                const target = normalize(formData.fullName);
                                                const isDup = students.some(s => normalize(s.fullName) === target);
                                                if (isDup) {
                                                    return (
                                                        <div className="absolute right-3 top-2.5 group">
                                                            <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
                                                            <div className="absolute right-0 w-48 p-2 bg-amber-100 text-amber-800 text-xs rounded-lg shadow-lg border border-amber-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none -top-10">
                                                                Nombre ya registrado (posible duplicado)
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
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
                                            <input
                                                disabled={!!editingStudent && !editingStudent.dni.startsWith('TEMP_')}
                                                type="text"
                                                maxLength={8}
                                                className={`w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 ${!!editingStudent && !editingStudent.dni.startsWith('TEMP_') ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                                value={formData.dni}
                                                onChange={e => setFormData({ ...formData, dni: e.target.value.replace(/\D/g, '') })}
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
                            {/* STEP 2: GROUPED SCHEDULE SELECTION */}
                            {step === 2 && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300 h-full flex flex-col">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Paso 2: Selección de Horario</h4>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 bg-sky-50 px-3 py-1 rounded-full border border-sky-100">
                                                <Clock className="w-3.5 h-3.5 text-sky-600" />
                                                <span className="text-xs font-bold text-sky-700">
                                                    {fixedSchedule.length} ses./sem.
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                                <span className="text-xs font-bold text-emerald-700">
                                                    {fixedSchedule.length * 4} clases/mes
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {loadingTemplates ? (
                                        <div className="flex-1 flex items-center justify-center p-12">
                                            <Clock className="w-8 h-8 animate-spin text-sky-500 mr-3" />
                                            <span className="text-slate-500">Cargando horarios disponibles...</span>
                                        </div>
                                    ) : (
                                        <div className="flex-1 overflow-auto space-y-6 pr-2">
                                            {(Object.keys(dayTypeLabels) as DayType[]).map(dayType => {
                                                const typeTemplates = templates.filter(t =>
                                                    t.dayType === dayType &&
                                                    t.categoryId === formData.categoryId &&
                                                    !t.isBreak
                                                ).sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));

                                                if (typeTemplates.length === 0) return null;

                                                return (
                                                    <div key={dayType} className="space-y-3">
                                                        <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                                            <Calendar className="w-3 h-3" /> {dayTypeLabels[dayType]}
                                                        </h5>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                            {typeTemplates.map(template => {
                                                                const days = dayTypeMapMapping[template.dayType as DayType];
                                                                const isSelected = days.every(dayId =>
                                                                    fixedSchedule.some(fs => fs.dayId === dayId && fs.timeId === template.timeSlot)
                                                                );

                                                                // Capacity Info
                                                                const capInfo = capacityInfo[`${template.dayType}-${template.timeSlot}`];
                                                                const isFull = capInfo?.isFull;
                                                                const isLoading = loadingCapacity || !capInfo;

                                                                return (
                                                                    <div key={template.id} className="relative group">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (isSelected) {
                                                                                    // Remove all days for this slot
                                                                                    setFixedSchedule(fixedSchedule.filter(fs =>
                                                                                        !(days.includes(fs.dayId) && fs.timeId === template.timeSlot)
                                                                                    ));
                                                                                    // Clear min start date if we are deselecting the "constraining" schedule.
                                                                                    // Since we only select ONE schedule pattern, clearing it is safe.
                                                                                    setMinPackageStartDate(null);
                                                                                    setFormData(prev => ({ ...prev, packageStartDate: '' }));

                                                                                } else {
                                                                                    // Add all days for this slot
                                                                                    const newSlots = days.map(dayId => ({
                                                                                        dayId,
                                                                                        timeId: template.timeSlot
                                                                                    }));
                                                                                    setFixedSchedule(newSlots); // Replaces existing schedule (assuming single schedule selection)

                                                                                    // If full, set min start date
                                                                                    if (isFull && capInfo?.earliestAvailableDate) {
                                                                                        const nextDate = new Date(capInfo.earliestAvailableDate);
                                                                                        // The availability date is when it BECOMES available or when previous ends?
                                                                                        // Usually "earliestAvailableDate" is the end date of current enrollment.
                                                                                        // So start date should be +1 day or same day if it ends previously?
                                                                                        // Let's assume +1 day to be safe if it's an end date.
                                                                                        // But wait, monthly slots logic: if slot is FULL in Jan, available in Feb.
                                                                                        // Earliest Available IS the start of the free period.
                                                                                        // If logic returns specific date, let's respect it.

                                                                                        const minDateStr = nextDate.toISOString().split('T')[0];
                                                                                        setMinPackageStartDate(minDateStr);

                                                                                        // We DO NOT set packageStartDate here anymore, user must choose in Step 3.
                                                                                        // But we clear it just in case.
                                                                                        setFormData(prev => ({ ...prev, packageStartDate: '' }));
                                                                                    } else {
                                                                                        setMinPackageStartDate(null);
                                                                                        setFormData(prev => ({ ...prev, packageStartDate: '' }));
                                                                                    }
                                                                                }
                                                                            }}
                                                                            className={`w-full p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden ${isSelected
                                                                                ? isFull
                                                                                    ? 'bg-amber-50 border-amber-500 shadow-lg shadow-amber-500/20' // Selected but full
                                                                                    : 'bg-sky-600 border-sky-600 shadow-lg shadow-sky-600/20'
                                                                                : isFull
                                                                                    ? 'bg-slate-50 border-slate-100 opacity-70 hover:opacity-100' // Full not selected
                                                                                    : 'bg-white border-slate-100 hover:border-sky-200 hover:bg-sky-50/10'
                                                                                }`}
                                                                        >
                                                                            <div className="flex justify-between items-start mb-1 relative z-10">
                                                                                <Clock className={`w-4 h-4 ${isSelected ? (isFull ? 'text-amber-600' : 'text-sky-100') : 'text-slate-400'}`} />
                                                                                {isSelected && <CheckCircle className={`w-4 h-4 animate-in zoom-in ${isFull ? 'text-amber-600' : 'text-white'}`} />}
                                                                            </div>
                                                                            <p className={`text-lg font-black relative z-10 ${isSelected ? (isFull ? 'text-amber-900' : 'text-white') : 'text-slate-800'}`}>
                                                                                {template.timeSlot}
                                                                            </p>

                                                                            {/* Capacity Display */}
                                                                            <div className={`mt-1 relative z-10`}>
                                                                                {isLoading ? (
                                                                                    <span className="text-[10px] text-slate-400">Cargando cupos...</span>
                                                                                ) : isFull ? (
                                                                                    <div className="flex flex-col">
                                                                                        <span className={`text-[10px] font-bold uppercase tracking-tight ${isSelected ? 'text-amber-700' : 'text-red-500'}`}>
                                                                                            ⚠️ LLENO ({capInfo.currentEnrollment}/{capInfo.totalCapacity})
                                                                                        </span>
                                                                                        {capInfo.earliestAvailableDate && (
                                                                                            <span className={`text-[9px] mt-0.5 ${isSelected ? 'text-amber-800/70' : 'text-slate-400'}`}>
                                                                                                Libre: {new Date(capInfo.earliestAvailableDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className={`text-[10px] uppercase font-bold tracking-tight ${isSelected ? 'text-sky-100' : 'text-emerald-600'}`}>
                                                                                        {capInfo.available}/{capInfo.totalCapacity} disponibles
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* Decorative background element */}
                                                                            {isSelected && (
                                                                                <div className="absolute -right-2 -bottom-2 w-12 h-12 bg-white/10 rounded-full blur-xl" />
                                                                            )}
                                                                        </button>

                                                                        {/* Informational Message for Full Schedule */}
                                                                        {isSelected && isFull && !editingStudent && capInfo?.earliestAvailableDate && (
                                                                            <div className="absolute top-full left-0 right-0 mt-2 z-20 animate-in slide-in-from-top-2">
                                                                                <div className="bg-amber-50 p-2 rounded-lg border border-amber-200 text-center shadow-sm">
                                                                                    <p className="text-[10px] text-amber-800 leading-tight">
                                                                                        <strong>¡Reserva Futura!</strong><br />
                                                                                        El alumno será inscrito pero su cupo iniciará el <strong>{new Date(capInfo.earliestAvailableDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Date Picker (EDITING STUDENT) */}
                                                                        {isSelected && isFull && editingStudent && (
                                                                            <div className="absolute top-full left-0 right-0 mt-2 z-20 animate-in slide-in-from-top-2">
                                                                                <div className="bg-white p-3 rounded-xl border-2 border-amber-200 shadow-xl">
                                                                                    <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">
                                                                                        Iniciar cambio desde:
                                                                                    </label>
                                                                                    <input
                                                                                        type="date"
                                                                                        required
                                                                                        className="w-full text-xs font-bold text-slate-700 border-b border-amber-200 focus:outline-none focus:border-amber-500 bg-transparent py-1"
                                                                                        value={formData.packageStartDate}
                                                                                        min={minPackageStartDate || ''}
                                                                                        onChange={(e) => setFormData(prev => ({ ...prev, packageStartDate: e.target.value }))}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {templates.filter(t => t.categoryId === formData.categoryId && !t.isBreak).length === 0 && (
                                                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                                    <p className="text-slate-500 font-medium">No hay horarios configurados para {currentCategory?.name}</p>
                                                    <p className="text-xs text-slate-400 mt-1">Configure la plantilla en el panel de administrador.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* STEP 3: PACKAGE & PAYMENT */}
                            {step === 3 && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Paso 3: Matrícula y Pago</h4>

                                    {!editingStudent && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Seleccionar Paquete</label>
                                                <select
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 bg-white font-bold text-slate-700 transition-all"
                                                    value={formData.packageId}
                                                    onChange={(e) => {
                                                        const pkgId = e.target.value;
                                                        setFormData({ ...formData, packageId: pkgId });
                                                        if (pkgId === 'custom') {
                                                            setSelectedPackage(null);
                                                            setPaymentData({ ...paymentData, credits: '', totalCost: '' });
                                                        } else {
                                                            const pkg = availablePackages.find(p => p.id === pkgId);
                                                            if (pkg) {
                                                                setSelectedPackage(pkg);
                                                                setPaymentData({
                                                                    ...paymentData,
                                                                    credits: pkg.classesPerMonth.toString(),
                                                                    totalCost: pkg.price.toString()
                                                                });
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <option value="">Seleccione un paquete...</option>
                                                    {filteredPackages.map(pkg => (
                                                        <option key={pkg.id} value={pkg.id}>
                                                            {pkg.name} - S/ {pkg.price} ({pkg.classesPerMonth} clases)
                                                        </option>
                                                    ))}
                                                    <option value="custom">✨ PAQUETE PERSONALIZADO</option>
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Clases a cargar</label>
                                                    <div className="relative">
                                                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <input
                                                            type="number"
                                                            readOnly={formData.packageId !== 'custom'}
                                                            className={`w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold ${formData.packageId !== 'custom' ? 'bg-slate-50 cursor-not-allowed text-slate-500' : ''}`}
                                                            value={paymentData.credits}
                                                            placeholder="0"
                                                            onChange={e => setPaymentData({ ...paymentData, credits: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Costo Total</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">S/</span>
                                                        <input
                                                            type="number"
                                                            readOnly={formData.packageId !== 'custom'}
                                                            className={`w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold ${formData.packageId !== 'custom' ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'text-sky-600'}`}
                                                            value={paymentData.totalCost}
                                                            placeholder="0.00"
                                                            onChange={e => setPaymentData({ ...paymentData, totalCost: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha Inicio</label>
                                                    <div className="relative">
                                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <input
                                                            type="date"
                                                            className={`w-full pl-10 pr-3 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold ${minPackageStartDate ? 'border-amber-300 bg-amber-50/50 text-amber-900' : 'border-slate-200'}`}
                                                            value={paymentData.startDate}
                                                            min={minPackageStartDate || undefined}
                                                            onChange={e => setPaymentData({ ...paymentData, startDate: e.target.value })}
                                                        />
                                                    </div>
                                                    {minPackageStartDate && (
                                                        <p className="text-[10px] text-amber-600 font-medium">
                                                            ⚠️ Limitada por cupo disponible
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha Fin</label>
                                                    <div className="relative">
                                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <input
                                                            type="date"
                                                            className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold text-slate-700"
                                                            value={paymentData.endDate}
                                                            onChange={e => setPaymentData({ ...paymentData, endDate: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">A Cuenta (Pagado)</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">S/</span>
                                                        <input
                                                            type="number"
                                                            className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold text-emerald-600"
                                                            value={paymentData.amountPaid}
                                                            placeholder="0.00"
                                                            onChange={e => setPaymentData({ ...paymentData, amountPaid: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Método de Pago</label>
                                                    <select
                                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 bg-white font-bold text-slate-700"
                                                        value={paymentData.methodId}
                                                        onChange={e => setPaymentData({ ...paymentData, methodId: e.target.value })}
                                                    >
                                                        {availablePaymentMethods.length === 0 && (
                                                            <option value="">No hay métodos de pago</option>
                                                        )}
                                                        {availablePaymentMethods.map(m => (
                                                            <option key={m.id} value={m.id}>
                                                                {m.name.toUpperCase()}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {debtAmount > 0 && (
                                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex justify-between items-center animate-in zoom-in-95">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-amber-200/50 rounded-full flex items-center justify-center">
                                                            <Calendar className="w-5 h-5 text-amber-700" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-amber-600 uppercase font-black">Deuda Pendiente</p>
                                                            <p className="text-xl font-black text-amber-900">
                                                                S/ {debtAmount.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {editingStudent && (
                                        <div className="space-y-4">
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                                                <div className="flex items-center gap-2 text-amber-800 font-bold mb-1">
                                                    <Calendar className="w-5 h-5" />
                                                    <span>Vigencia del Paquete</span>
                                                </div>
                                                <p className="text-amber-700 text-xs">
                                                    Ajusta las fechas de inicio y fin si es necesario. Esto afectará la visibilidad del alumno en los horarios mensuales.
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha Inicio</label>
                                                    <div className="relative">
                                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <input
                                                            type="date"
                                                            className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold text-slate-700"
                                                            value={formData.packageStartDate}
                                                            onChange={e => setFormData({ ...formData, packageStartDate: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Fecha Fin</label>
                                                    <div className="relative">
                                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <input
                                                            type="date"
                                                            className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-bold text-slate-700"
                                                            value={formData.packageEndDate}
                                                            onChange={e => setFormData({ ...formData, packageEndDate: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-slate-50 p-6 rounded-2xl text-center border-2 border-dashed border-slate-200 mt-6">
                                                <p className="font-bold text-slate-600">Gestión de Finanzas</p>
                                                <p className="text-sm text-slate-400 mt-1">Los pagos se editan desde el módulo de Finanzas.</p>
                                            </div>
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
                                    <button
                                        onClick={handleSubmit}
                                        type="button"
                                        disabled={isSaving}
                                        className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg transition-all ${isSaving
                                            ? 'bg-emerald-400 cursor-not-allowed text-white/80'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                                            }`}
                                    >
                                        {isSaving ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>Guardando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" />
                                                {editingStudent ? 'Actualizar Alumno' : 'Finalizar Registro'}
                                            </>
                                        )}
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
            )
            }
            {/* RECHARGE MODAL */}
            {isRechargeModalOpen && studentForRecharge && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Recargar Créditos</h3>
                            <button onClick={() => setIsRechargeModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <form onSubmit={handleRechargeSubmit} className="p-6 space-y-4">
                            <div className="text-sm text-slate-500 mb-2">
                                Recargando para: <span className="font-bold text-slate-700">{studentForRecharge.fullName}</span>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Créditos a Agregar</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-sky-500/50 outline-none"
                                    value={rechargeData.credits}
                                    onChange={e => setRechargeData({ ...rechargeData, credits: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Monto a Pagar (S/)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-sky-500/50 outline-none"
                                    value={rechargeData.amount}
                                    onChange={e => setRechargeData({ ...rechargeData, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-slate-400 mt-1">Si es recuperación gratuita, ingrese 0.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nueva Fecha Vencimiento <span className="text-slate-300 font-normal">(Auto)</span></label>
                                <input
                                    type="date"
                                    readOnly
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 focus:outline-none cursor-not-allowed"
                                    value={rechargeData.newEndDate}
                                />
                                <p className="text-xs text-slate-400 mt-1">Se calcula automáticamente según los horarios del alumno.</p>
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-sky-600 text-white font-bold py-3 rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 mt-4"
                            >
                                {isSaving ? 'Procesando...' : 'Confirmar Recarga'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ATTENDANCE MODAL */}
            {isAttendanceModalOpen && studentForAttendance && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 bg-emerald-50/50">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Marcar Asistencia</h3>
                                    <p className="text-sm text-slate-500 mt-1">{studentForAttendance.fullName}</p>
                                </div>
                                <button
                                    onClick={() => setIsAttendanceModalOpen(false)}
                                    className="text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleAttendanceSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Fecha</label>
                                <input
                                    type="date"
                                    required
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                    value={attendanceData.fecha}
                                    onChange={e => setAttendanceData({ ...attendanceData, fecha: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Estado</label>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setAttendanceData({ ...attendanceData, asistencia: true })}
                                        className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${attendanceData.asistencia
                                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        ✅ Asistió
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAttendanceData({ ...attendanceData, asistencia: false })}
                                        className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${!attendanceData.asistencia
                                            ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        ❌ Faltó
                                    </button>
                                </div>
                            </div>

                            {/* Attendance History */}
                            {studentForAttendance.asistencia && studentForAttendance.asistencia.length > 0 && (
                                <div className="border-t border-slate-100 pt-4">
                                    <h4 className="text-sm font-bold text-slate-700 mb-3">Historial de Asistencia</h4>
                                    <div className="max-h-48 overflow-y-auto space-y-2">
                                        {studentForAttendance.asistencia.slice(0, 15).map((record, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg"
                                            >
                                                <span className="text-sm text-slate-600 font-mono">
                                                    {new Date(record.fecha).toLocaleDateString('es-PE', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </span>
                                                <span className={`text-sm font-bold ${record.asistencia ? 'text-emerald-600' : 'text-red-600'
                                                    }`}>
                                                    {record.asistencia ? '✅ Asistió' : '❌ Faltó'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 mt-4"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar Asistencia'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div >
    );
}
