import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, Search, Trash2, X } from 'lucide-react';
import { monthlyScheduleService } from '../services/monthlyScheduleService';
import { categoryService } from '../services/categoryService';
import { studentService } from '../services/students';
import { useSeason } from '../contexts/SeasonContext';
import { formatMonthId, getMonthName, getNextMonth, getPreviousMonth } from '../utils/monthUtils';
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
    const [viewMode, setViewMode] = useState<'list' | 'add'>('list');
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

    const getStatusColor = (capacity: number, enrolled: number) => {
        const ratio = enrolled / capacity;
        if (ratio >= 1) return 'bg-red-50 text-red-700 border-red-200';
        if (ratio >= 0.8) return 'bg-amber-50 text-amber-700 border-amber-200';
        return 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 hover:shadow-sm';
    };

    // Group slots by timeSlot and dayType
    const groupedSlots = slots.reduce((acc, slot) => {
        const key = slot.timeSlot;
        if (!acc[key]) acc[key] = {};
        acc[key][slot.dayType] = slot;
        return acc;
    }, {} as Record<string, Record<string, MonthlySlot>>);

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
                                                const slot = dayTypeSlots[dayType];

                                                if (!slot) {
                                                    return (
                                                        <td key={dayType} className="px-6 py-4">
                                                            <div className="text-center text-slate-300 text-sm">—</div>
                                                        </td>
                                                    );
                                                }

                                                if (slot.isBreak) {
                                                    return (
                                                        <td key={dayType} className="px-6 py-4">
                                                            <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-center">
                                                                <span className="text-xs font-bold text-slate-500 uppercase">Descanso</span>
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                const category = categories.find(c => c.id === slot.categoryId);

                                                // Calculate "Occupied Seats" based on peak concurrency
                                                // If we have spot recycling (Student A leaves Jan 8, B starts Jan 10), 
                                                // we have 4 enrollments but only 3 seats occupied.
                                                const calculateOccupiedSeats = (enrollments: MonthlyEnrollment[]) => {
                                                    if (!enrollments || enrollments.length === 0) return 0;

                                                    // Create events: +1 at start, -1 at end
                                                    const events: { time: number; type: number }[] = [];

                                                    enrollments.forEach(e => {
                                                        const start = (e.enrolledAt as any)?.toDate ? (e.enrolledAt as any).toDate().getTime() : new Date(e.enrolledAt || 0).getTime();
                                                        let end = (e.endsAt as any)?.toDate ? (e.endsAt as any).toDate().getTime() : new Date(e.endsAt).getTime();

                                                        // Ensure end is after start (sanity check)
                                                        if (end < start) end = start;

                                                        events.push({ time: start, type: 1 });
                                                        // Add a small buffer to end time to avoid adjacent-day overlap false positives?
                                                        // Actually, if A ends Jan 8 (23:59?), and B starts Jan 9 (00:00).
                                                        // If we just use raw timestamps, they might not overlap. 
                                                        // But safely, let's treat end as exclusive? 
                                                        // Usually endsAt is end of day. 
                                                        // If A ends Jan 8, slot is free Jan 9.
                                                        // Start Jan 10 is fine.
                                                        // Let's use simple logic: +1 at start, -1 AFTER end.
                                                        events.push({ time: end + 1, type: -1 });
                                                    });

                                                    events.sort((a, b) => a.time - b.time || a.type - b.type); // Process starts before ends if time matches? No, process ends before starts?
                                                    // If A ends at T, and B starts at T. 
                                                    // If we process End (-1) first, count drops, then Start (+1), count rises. Peak is N.
                                                    // If start (+1) first, peak is N+1.
                                                    // If A ends Jan 8 (day), usually effectively 23:59.
                                                    // B starts Jan 9 (00:00). Timestamps differ.
                                                    // So sorting by time is sufficient.

                                                    let maxOccupancy = 0;
                                                    let currentOccupancy = 0;

                                                    events.forEach(event => {
                                                        currentOccupancy += event.type;
                                                        if (currentOccupancy > maxOccupancy) maxOccupancy = currentOccupancy;
                                                    });

                                                    return maxOccupancy;
                                                };


                                                const occupiedSeats = calculateOccupiedSeats(slot.enrolledStudents || []);

                                                // Check for debtors in enrolled students
                                                const hasDebtor = slot.enrolledStudents?.some(enrollment => {
                                                    const student = students.find(s => s.id === enrollment.studentId);
                                                    return student?.hasDebt;
                                                });

                                                const available = slot.capacity - occupiedSeats;
                                                const colorClass = getStatusColor(slot.capacity, occupiedSeats);

                                                return (
                                                    <td key={dayType} className="px-6 py-4">
                                                        <button
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

                        {/* Tabs */}
                        <div className="flex border-b border-slate-100">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'list'
                                    ? 'text-sky-600 border-b-2 border-sky-600'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                Inscritos ({selectedSlot.enrolledStudents?.length || 0})
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
                                (!selectedSlot.enrolledStudents || selectedSlot.enrolledStudents.length === 0) ? (
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
                                    selectedSlot.enrolledStudents.map((enrollment: MonthlyEnrollment) => {
                                        const endDate = (enrollment.endsAt as any)?.toDate ? (enrollment.endsAt as any).toDate() : new Date(enrollment.endsAt);
                                        const startDate = (enrollment.enrolledAt as any)?.toDate ? (enrollment.enrolledAt as any).toDate() : new Date(enrollment.enrolledAt || 0);

                                        const now = new Date();
                                        // Check if future (compare dates only to be safe? No, timestamp comparison is fine)
                                        // If starts today (00:00) and now is (10:00), effectively started.
                                        const isFuture = startDate.getTime() > now.getTime();
                                        const isExpired = endDate < now;

                                        return (
                                            <div
                                                key={enrollment.studentId}
                                                className={`flex items-center justify-between p-3 rounded-xl group transition-colors border border-transparent 
                                                ${isFuture ? 'bg-amber-50 border-amber-100' : 'hover:bg-slate-50 hover:border-slate-100'}`}
                                            >
                                                <div className="flex-1">
                                                    <p className={`font-bold ${isFuture ? 'text-amber-800' : 'text-slate-700'}`}>
                                                        {enrollment.studentName}
                                                        {isFuture && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">FUTURO</span>}
                                                    </p>
                                                    <div className="text-xs space-y-0.5 mt-0.5">
                                                        {isFuture && (
                                                            <p className="text-amber-600 font-bold flex items-center gap-1">
                                                                ⏳ Inicia: {startDate.toLocaleDateString('es-PE')}
                                                            </p>
                                                        )}
                                                        <p className={`${isFuture ? 'text-amber-600/70' : 'text-slate-400'}`}>
                                                            Finaliza: {endDate.toLocaleDateString('es-PE')}
                                                            {isExpired && (
                                                                <span className="ml-2 text-red-600 font-bold">(Expirado)</span>
                                                            )}
                                                        </p>
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
                            Cupos disponibles: {selectedSlot.capacity - (selectedSlot.enrolledStudents?.length || 0)} / {selectedSlot.capacity}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
