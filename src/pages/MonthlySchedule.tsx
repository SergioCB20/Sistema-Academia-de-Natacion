import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, Search, Trash2, X, CheckCircle } from 'lucide-react';
import { monthlyScheduleService } from '../services/monthlyScheduleService';
import { categoryService } from '../services/categoryService';
import { studentService } from '../services/students';
import { useSeason } from '../contexts/SeasonContext';
import { formatMonthId, getMonthName, getNextMonth, getPreviousMonth, parseMonthId } from '../utils/monthUtils';
import { calculateRealRemaining } from '../utils/studentUtils';
import { dateUtils } from '../utils/date';
import type { MonthlySlot, MonthlyEnrollment, Student, Category } from '../types/db';

export default function MonthlySchedule() {
    const { currentSeason } = useSeason();

    // Get initial month (current month or first month of season)
    const getInitialMonth = () => {
        if (!currentSeason) return formatMonthId(new Date());

        const now = formatMonthId(new Date());
        // If current month is within season, use it, otherwise use season start
        if (now >= currentSeason.startMonth && now <= currentSeason.endMonth) {
            return now;
        }
        return currentSeason.startMonth;
    };

    const [currentMonth, setCurrentMonth] = useState(getInitialMonth());
    const [slots, setSlots] = useState<MonthlySlot[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal state
    const [selectedSlot, setSelectedSlot] = useState<MonthlySlot | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'add' | 'attendance'>('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [bookingLoading, setBookingLoading] = useState(false);

    // Update month when season changes
    useEffect(() => {
        if (currentSeason) {
            setCurrentMonth(getInitialMonth());
        }
    }, [currentSeason?.id]);

    useEffect(() => {
        loadData();
    }, [currentMonth, currentSeason]);

    const loadData = async () => {
        if (!currentSeason) return;

        setLoading(true);
        try {
            const [slotsData, studentsData, categoriesData] = await Promise.all([
                monthlyScheduleService.getBySeasonAndMonth(currentSeason.id, currentMonth),
                studentService.getAllActive(),
                categoryService.getActive()
            ]);

            setSlots(slotsData);
            setStudents(studentsData);
            setCategories(categoriesData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePrevMonth = () => {
        if (!currentSeason) return;
        const prev = getPreviousMonth(currentMonth);
        if (prev >= currentSeason.startMonth) {
            setCurrentMonth(prev);
        }
    };

    const handleNextMonth = () => {
        if (!currentSeason) return;
        const next = getNextMonth(currentMonth);
        if (next <= currentSeason.endMonth) {
            setCurrentMonth(next);
        }
    };

    const canGoPrev = currentSeason ? currentMonth > currentSeason.startMonth : false;
    const canGoNext = currentSeason ? currentMonth < currentSeason.endMonth : false;

    const openModal = (slot: MonthlySlot) => {
        setSelectedSlot(slot);
        setSearchTerm('');
        setViewMode('list');
        setIsModalOpen(true);
    };

    const handleEnroll = async (student: Student) => {
        if (!selectedSlot) return;

        if (!confirm(`¿Inscribir a ${student.fullName} en este horario mensual?`)) return;

        setBookingLoading(true);
        try {
            await monthlyScheduleService.enrollStudent(selectedSlot.id, student.id);
            await loadData();

            // Update selected slot
            const updatedSlot = await monthlyScheduleService.getById(selectedSlot.id);
            if (updatedSlot) {
                setSelectedSlot(updatedSlot);
            }
        } catch (error: any) {
            console.error(error);
            alert(error.message || 'Error al inscribir');
        } finally {
            setBookingLoading(false);
        }
    };

    const handleUnenroll = async (studentId: string, studentName: string) => {
        if (!selectedSlot) return;

        if (!confirm(`¿Desinscribir a ${studentName} de este horario?`)) return;

        setBookingLoading(true);
        try {
            await monthlyScheduleService.unenrollStudent(selectedSlot.id, studentId);
            await loadData();

            // Update selected slot
            const updatedSlot = await monthlyScheduleService.getById(selectedSlot.id);
            if (updatedSlot) {
                setSelectedSlot(updatedSlot);
            }
        } catch (error: any) {
            console.error(error);
            alert(error.message || 'Error al desinscribir');
        } finally {
            setBookingLoading(false);
        }
    };

    const filteredStudents = students.filter(s =>
        s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.dni.includes(searchTerm)
    );

    // Calculate "Occupied Seats" based on peak concurrency
    const calculateOccupiedSeats = (enrollments: MonthlyEnrollment[], slot: MonthlySlot) => {
        if (!enrollments || enrollments.length === 0) return 0;

        // Use the month of the slot to filter
        const slotMonthDate = parseMonthId(slot.month);
        const slotStart = slotMonthDate.getTime();
        // End of month
        const slotEnd = new Date(slotMonthDate.getFullYear(), slotMonthDate.getMonth() + 1, 0, 23, 59, 59).getTime();

        // Filter out orphaned enrollments (deleted students) 
        // AND enrollments that don't overlap with THIS specific month
        const validEnrollments = enrollments.filter(e => {
            const hasStudent = students.some(s => s.id === e.studentId);
            if (!hasStudent) return false;

            const start = (e.enrolledAt as any)?.toDate ? (e.enrolledAt as any).toDate().getTime() : new Date(e.enrolledAt || 0).getTime();
            const end = (e.endsAt as any)?.toDate ? (e.endsAt as any).toDate().getTime() : new Date(e.endsAt).getTime();

            // Overlap check
            return start <= slotEnd && end >= slotStart;
        });

        if (validEnrollments.length === 0) return 0;

        // Create events: +1 at start, -1 at end
        const events: { time: number; type: number }[] = [];

        validEnrollments.forEach(e => {
            const start = (e.enrolledAt as any)?.toDate ? (e.enrolledAt as any).toDate().getTime() : new Date(e.enrolledAt || 0).getTime();
            let end = (e.endsAt as any)?.toDate ? (e.endsAt as any).toDate().getTime() : new Date(e.endsAt).getTime();

            if (end < start) end = start;

            // Only count overlap within this month for concurrency calculation
            const effectiveStart = Math.max(start, slotStart);
            const effectiveEnd = Math.min(end, slotEnd);

            events.push({ time: effectiveStart, type: 1 });
            events.push({ time: effectiveEnd + 1, type: -1 });
        });

        events.sort((a, b) => a.time - b.time || a.type - b.type);

        let maxOccupancy = 0;
        let currentOccupancy = 0;

        events.forEach(event => {
            currentOccupancy += event.type;
            if (currentOccupancy > maxOccupancy) maxOccupancy = currentOccupancy;
        });

        return maxOccupancy;
    };

    const getStatusColor = (capacity: number, enrolled: number) => {
        const ratio = enrolled / capacity;
        if (ratio >= 1) return 'bg-red-50 text-red-700 border-red-200';
        if (ratio >= 0.8) return 'bg-amber-50 text-amber-700 border-amber-200';
        return 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 hover:shadow-sm';
    };

    // Group slots by timeSlot and dayType (allowing multiple slots/categories per cell)
    const groupedSlots = slots.reduce((acc, slot) => {
        const key = slot.timeSlot;
        if (!acc[key]) acc[key] = {};
        if (!acc[key][slot.dayType]) acc[key][slot.dayType] = [];
        (acc[key][slot.dayType] as any).push(slot);
        return acc;
    }, {} as Record<string, Record<string, MonthlySlot[]>>);

    const timeSlots = Object.keys(groupedSlots).sort();

    return (
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                        <CalendarIcon className="w-8 h-8 text-sky-600" />
                        Horarios Mensuales
                    </h2>
                    <p className="text-slate-500">Gestión de inscripciones mensuales</p>
                </div>

                <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                    <button
                        onClick={handlePrevMonth}
                        disabled={!canGoPrev}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-bold text-slate-700 px-4 min-w-[180px] text-center capitalize">
                        {getMonthName(currentMonth)}
                    </span>
                    <button
                        onClick={handleNextMonth}
                        disabled={!canGoNext}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Schedule Grid */}
            <div className="flex-1 overflow-auto bg-white rounded-2xl shadow-sm border border-slate-200">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-slate-400">Cargando...</div>
                ) : timeSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <CalendarIcon className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No hay horarios para este mes</p>
                        <p className="text-sm">Sincroniza las plantillas desde Admin → Plantillas de Horario</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Horario
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Lun-Mier-Vier
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Mar-Juev
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Sab-Dom
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {timeSlots.map((timeSlot) => {
                                    const dayTypeSlots = groupedSlots[timeSlot];

                                    return (
                                        <tr key={timeSlot} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900 font-mono">
                                                {timeSlot}
                                            </td>
                                            {(['lun-mier-vier', 'mar-juev', 'sab-dom'] as const).map(dayType => {
                                                const slotsInCell = (dayTypeSlots?.[dayType] || []) as MonthlySlot[];

                                                if (slotsInCell.length === 0) {
                                                    return (
                                                        <td key={dayType} className="px-6 py-4">
                                                            <div className="text-center text-slate-300 text-sm">—</div>
                                                        </td>
                                                    );
                                                }

                                                return (
                                                    <td key={dayType} className="px-6 py-4">
                                                        <div className="flex flex-col gap-2">
                                                            {slotsInCell.map((slot) => {
                                                                if (slot.isBreak) {
                                                                    return (
                                                                        <div key={slot.id} className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-center">
                                                                            <span className="text-xs font-bold text-slate-500 uppercase">Descanso</span>
                                                                        </div>
                                                                    );
                                                                }

                                                                const category = categories.find(c => c.id === slot.categoryId);
                                                                const occupiedSeats = calculateOccupiedSeats(slot.enrolledStudents || [], slot);
                                                                const hasDebtor = slot.enrolledStudents?.some(enrollment => {
                                                                    const student = students.find(s => s.id === enrollment.studentId);
                                                                    return student?.hasDebt;
                                                                });
                                                                const available = slot.capacity - occupiedSeats;
                                                                const colorClass = getStatusColor(slot.capacity, occupiedSeats);

                                                                return (
                                                                    <button
                                                                        key={slot.id}
                                                                        onClick={() => openModal(slot)}
                                                                        className={`w-full rounded-lg border p-3 transition-all ${hasDebtor
                                                                            ? 'bg-orange-100 border-orange-300 ring-2 ring-orange-400 ring-offset-1 shadow-sm'
                                                                            : `${colorClass} hover:shadow-md`
                                                                            }`}
                                                                    >
                                                                        <div className="flex flex-col gap-2">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className={`text-xs font-bold ${hasDebtor ? 'text-orange-900' : ''}`}>
                                                                                    {category?.name || 'Sin categoría'}
                                                                                </span>
                                                                                {occupiedSeats >= slot.capacity && !hasDebtor && (
                                                                                    <span className="text-[10px] font-bold bg-white/50 px-1.5 rounded">LLENO</span>
                                                                                )}
                                                                                {hasDebtor && (
                                                                                    <span className="text-[10px] font-bold bg-white/50 text-orange-800 px-1.5 rounded animate-pulse">DEUDA</span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center justify-between">
                                                                                <div className="flex items-center gap-1">
                                                                                    {hasDebtor ? (
                                                                                        <div className="flex items-center gap-1 text-orange-700">
                                                                                            <Users className="w-3 h-3" />
                                                                                            <span className="text-xs font-mono font-bold">
                                                                                                {occupiedSeats}/{slot.capacity}
                                                                                            </span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="flex items-center gap-1">
                                                                                            <Users className="w-3 h-3" />
                                                                                            <span className="text-xs font-mono font-bold">
                                                                                                {occupiedSeats}/{slot.capacity}
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <span className={`text-[10px] font-medium ${hasDebtor ? 'text-orange-800/70' : 'opacity-70'}`}>
                                                                                    {available} disponible{available !== 1 ? 's' : ''}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Enrollment Modal */}
            {isModalOpen && selectedSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800">Inscripciones - {selectedSlot.timeSlot}</h3>
                                <p className="text-sm text-slate-500">
                                    {getMonthName(selectedSlot.month)} • {selectedSlot.dayType}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Filter out orphaned enrollments (deleted students) */}
                        {(() => {
                            const slotMonthDate = parseMonthId(selectedSlot.month);
                            const slotStart = slotMonthDate.getTime();
                            const slotEnd = new Date(slotMonthDate.getFullYear(), slotMonthDate.getMonth() + 1, 0, 23, 59, 59).getTime();

                            const validEnrollments = (selectedSlot.enrolledStudents || []).filter(
                                (e: MonthlyEnrollment) => {
                                    const hasStudent = students.some(s => s.id === e.studentId);
                                    if (!hasStudent) return false;

                                    const start = (e.enrolledAt as any)?.toDate ? (e.enrolledAt as any).toDate().getTime() : new Date(e.enrolledAt || 0).getTime();
                                    const end = (e.endsAt as any)?.toDate ? (e.endsAt as any).toDate().getTime() : new Date(e.endsAt).getTime();

                                    return start <= slotEnd && end >= slotStart;
                                }
                            );
                            const validCount = validEnrollments.length;
                            const availableSlots = selectedSlot.capacity - validCount;

                            return (
                                <>
                                    {/* Tabs */}
                                    <div className="flex border-b border-slate-100">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'list'
                                                ? 'text-sky-600 border-b-2 border-sky-600'
                                                : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                        >
                                            Inscritos ({validCount})
                                        </button>
                                        <button
                                            onClick={() => setViewMode('attendance')}
                                            className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'attendance'
                                                ? 'text-sky-600 border-b-2 border-sky-600'
                                                : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                        >
                                            Asistencia
                                        </button>
                                        <button
                                            onClick={() => setViewMode('add')}
                                            className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'add'
                                                ? 'text-sky-600 border-b-2 border-sky-600'
                                                : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                        >
                                            Agregar
                                        </button>
                                    </div>

                                    {/* Search Box (Only in Add mode) */}
                                    {viewMode === 'add' && (
                                        <div className="p-4 border-b border-slate-100">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar alumno..."
                                                    autoFocus
                                                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                    value={searchTerm}
                                                    onChange={e => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Content Area */}
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {viewMode === 'list' ? (
                                            // LIST VIEW
                                            (validCount === 0) ? (
                                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                                    <Users className="w-12 h-12 mb-3 opacity-20" />
                                                    <p>No hay alumnos inscritos</p>
                                                    <button
                                                        onClick={() => setViewMode('add')}
                                                        className="mt-4 text-sky-600 font-bold hover:underline"
                                                    >
                                                        Inscribir al primero
                                                    </button>
                                                </div>
                                            ) : (
                                                validEnrollments.map((enrollment: MonthlyEnrollment) => {
                                                    const endDate = (enrollment.endsAt as any)?.toDate ? (enrollment.endsAt as any).toDate() : new Date(enrollment.endsAt);
                                                    const startDate = (enrollment.enrolledAt as any)?.toDate ? (enrollment.enrolledAt as any).toDate() : new Date(enrollment.enrolledAt || 0);

                                                    const now = new Date();
                                                    const isFuture = startDate.getTime() > now.getTime();
                                                    const isExpired = endDate < now;

                                                    const student = students.find(s => s.id === enrollment.studentId);

                                                    return (
                                                        <div
                                                            key={enrollment.studentId}
                                                            className={`flex items-center justify-between p-3 rounded-xl group transition-colors border border-transparent 
                                                ${isFuture ? 'bg-amber-50 border-amber-100' : 'hover:bg-slate-50 hover:border-slate-100'}
                                                ${!student ? 'bg-red-50 border-red-100' : ''}
                                                `}
                                                        >
                                                            <div className="flex-1">
                                                                <div className='flex justify-between items-center mr-2'>
                                                                    <div className="flex items-center gap-2">
                                                                        <p className={`font-bold ${isFuture ? 'text-amber-800' : !student ? 'text-red-700' : 'text-slate-700'}`}>
                                                                            {enrollment.studentName}
                                                                        </p>
                                                                        {(() => {
                                                                            const tCredits = student?.remainingCredits || 0;
                                                                            const aCount = student?.asistencia?.filter(a => a.asistencia).length || 0;
                                                                            const finished = aCount >= tCredits && tCredits > 0;
                                                                            if (finished) {
                                                                                return (
                                                                                    <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded border border-sky-200 font-bold flex items-center gap-1">
                                                                                        <CheckCircle className="w-3 h-3" /> LISTO
                                                                                    </span>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()}
                                                                        {isFuture && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">FUTURO</span>}
                                                                        {student?.hasDebt && (
                                                                            <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 font-bold animate-pulse">
                                                                                DEUDA
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {student && (() => {
                                                                        const available = calculateRealRemaining(student);
                                                                        const total = student.remainingCredits;
                                                                        return (
                                                                            <span className="text-xs font-mono font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                                                                                {available}/{total}
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="text-xs space-y-0.5 mt-0.5">
                                                                    {isFuture && (
                                                                        <p className="text-amber-600 font-bold flex items-center gap-1">
                                                                            ⏳ Inicia: {dateUtils.formatDateUTC(startDate)}
                                                                        </p>
                                                                    )}
                                                                    <p className={`${isFuture ? 'text-amber-600/70' : 'text-slate-400'}`}>
                                                                        Finaliza: {dateUtils.formatDateUTC(endDate)}
                                                                        {isExpired && (
                                                                            <span className="ml-2 text-red-600 font-bold">(Expirado)</span>
                                                                        )}
                                                                    </p>
                                                                    {!student && (
                                                                        <p className="text-red-500 font-bold flex items-center gap-1">
                                                                            ⚠️ Alumno no encontrado o eliminado
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <button
                                                                onClick={() => handleUnenroll(enrollment.studentId, enrollment.studentName)}
                                                                disabled={bookingLoading}
                                                                className={`p-2 rounded-lg transition-colors ${isFuture
                                                                    ? 'text-amber-400 hover:text-red-600 hover:bg-amber-100'
                                                                    : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                                                                title="Desinscribir"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            )
                                        ) : viewMode === 'attendance' ? (
                                            // ATTENDANCE VIEW
                                            <>
                                                <div className="p-3 sticky top-0 bg-white z-10 border-b border-slate-100 mb-2">
                                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha de Asistencia</label>
                                                    <input
                                                        type="date"
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                                                        defaultValue={new Date().toISOString().split('T')[0]}
                                                        id="attendance-date"
                                                        // Force reload when date changes? No, just let logic read it.
                                                        onChange={(e) => {
                                                            // Trigger re-render to update 'hasAttendedToday'
                                                            // We can just use a state for the date if we want reactivity
                                                            // For now simple approach
                                                            const val = e.target.value;
                                                            // Force update?
                                                            setSearchTerm(val); // Hack to force render, or add explicit state
                                                            // Better: add explicit state in next iteration if needed, 
                                                            // but actually just switching viewMode re-renders. 
                                                            // Let's add a wrapper state for date later if needed.
                                                            // Actually, using searchTerm (which is unused in attendance mode) 
                                                            // is a convenient hack to force re-render without new state.
                                                        }}
                                                    />
                                                </div>

                                                <div className="space-y-2 pb-10">
                                                    {validEnrollments.map((enrollment: MonthlyEnrollment) => {
                                                        const student = students.find(s => s.id === enrollment.studentId);
                                                        if (!student) return null;

                                                        const totalCredits = student.remainingCredits || 0;
                                                        const attendedCount = student.asistencia?.filter(a => a.asistencia).length || 0;
                                                        const isFinished = attendedCount >= totalCredits && totalCredits > 0;

                                                        // Get Date
                                                        const dateInput = document.getElementById('attendance-date') as HTMLInputElement;
                                                        const selectedDate = dateInput?.value || new Date().toISOString().split('T')[0];

                                                        const hasAttended = student.asistencia?.some(a => a.fecha === selectedDate && a.asistencia);

                                                        return (
                                                            <div key={student.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${hasAttended ? 'bg-emerald-50 border-emerald-200' : 'border-slate-100 hover:bg-slate-50'}`}>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="font-bold text-slate-700">{student.fullName}</p>
                                                                        {student.hasDebt && (
                                                                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 font-bold">
                                                                                DEUDA
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isFinished ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                            {attendedCount} / {totalCredits} clases
                                                                        </span>
                                                                        {isFinished && (
                                                                            <span className="text-[10px] font-bold text-sky-600 flex items-center gap-0.5">
                                                                                <CheckCircle className="w-3 h-3" /> COMPLETADO
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    onClick={async () => {
                                                                        const dateInput = document.getElementById('attendance-date') as HTMLInputElement;
                                                                        const date = dateInput.value;
                                                                        if (!date) return;

                                                                        const newStatus = !hasAttended;
                                                                        try {
                                                                            // 1. Update DB (1 read + 1 write inside transaction)
                                                                            await studentService.markAttendance(student.id, date, newStatus);

                                                                            // 2. OPTIMIZATION: Update Local State instead of re-fetching ALL students (saves N reads)
                                                                            setStudents(prevStudents => prevStudents.map(s => {
                                                                                if (s.id === student.id) {
                                                                                    const currentAttendance = s.asistencia ? [...s.asistencia] : [];
                                                                                    const existingIndex = currentAttendance.findIndex(a => a.fecha === date);

                                                                                    if (existingIndex >= 0) {
                                                                                        currentAttendance[existingIndex] = { fecha: date, asistencia: newStatus };
                                                                                    } else {
                                                                                        currentAttendance.push({ fecha: date, asistencia: newStatus });
                                                                                    }

                                                                                    // Sort by date desc
                                                                                    currentAttendance.sort((a, b) => b.fecha.localeCompare(a.fecha));

                                                                                    return { ...s, asistencia: currentAttendance };
                                                                                }
                                                                                return s;
                                                                            }));

                                                                        } catch (e) {
                                                                            alert('Error al marcar asistencia');
                                                                            console.error(e);
                                                                        }
                                                                    }}
                                                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${hasAttended
                                                                        ? 'bg-emerald-500 text-white shadow-emerald-500/30 shadow-lg'
                                                                        : 'bg-white border-2 border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-600'
                                                                        }`}
                                                                >
                                                                    <CheckCircle className={`w-4 h-4 ${hasAttended ? 'animate-in zoom-in' : ''}`} />
                                                                    {hasAttended ? 'Asistió' : 'Marcar'}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        ) : (
                                            // ADD VIEW
                                            filteredStudents.length === 0 ? (
                                                <p className="text-center text-slate-400 py-8">No se encontraron alumnos</p>
                                            ) : (
                                                filteredStudents.map(student => {
                                                    const isEnrolled = selectedSlot.enrolledStudents?.some(e => e.studentId === student.id);
                                                    const hasCredits = student.remainingCredits > 0;
                                                    const canEnroll = !isEnrolled && hasCredits && !student.hasDebt;

                                                    return (
                                                        <div
                                                            key={student.id}
                                                            className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors"
                                                        >
                                                            <div>
                                                                <p className="font-bold text-slate-700">{student.fullName}</p>
                                                                <p className="text-xs text-slate-400">{student.dni}</p>
                                                            </div>

                                                            <div className="flex items-center gap-3">
                                                                {student.hasDebt ? (
                                                                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                                                                        DEUDA
                                                                    </span>
                                                                ) : (
                                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${hasCredits ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                                        }`}>
                                                                        {student.remainingCredits} créd.
                                                                    </span>
                                                                )}

                                                                {isEnrolled ? (
                                                                    <span className="text-xs text-emerald-600 font-bold px-2">✓ Inscrito</span>
                                                                ) : (
                                                                    <button
                                                                        disabled={!canEnroll || bookingLoading}
                                                                        onClick={() => handleEnroll(student)}
                                                                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${canEnroll
                                                                            ? 'bg-sky-100 text-sky-600 hover:bg-sky-600 hover:text-white'
                                                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                            }`}
                                                                    >
                                                                        Inscribir
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-center text-slate-400">
                                        Cupos disponibles: {availableSlots} / {selectedSlot.capacity}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
