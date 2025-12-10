import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, RefreshCw, Search, CheckCircle, AlertCircle, DollarSign, Trash2 } from 'lucide-react';
import { scheduleService } from '../services/schedule';
import { dateUtils } from '../utils/date';
import { masterService, HOURS } from '../services/master';
import { studentService } from '../services/students';
import type { DailySlot, Student } from '../types/db';

export default function Schedule() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [slots, setSlots] = useState<DailySlot[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);

    // Modal State
    // Modal State
    const [selectedSlot, setSelectedSlot] = useState<DailySlot | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'add'>('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [bookingLoading, setBookingLoading] = useState(false);

    // Helper: Get start of week (Monday)
    const getStartOfWeek = (date: Date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const weekStart = getStartOfWeek(currentDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
    });

    useEffect(() => {
        loadData();
    }, [currentDate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const startStr = dateUtils.formatDateId(weekDays[0]);
            const endStr = dateUtils.formatDateId(weekDays[6]);

            // Parallel fetch
            const [slotsData, studentsData] = await Promise.all([
                scheduleService.getRangeSlots(startStr, endStr),
                studentService.getAllActive()
            ]);

            setSlots(slotsData);
            setStudents(studentsData);
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handlePrevWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    const handleNextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    const handleSeed = async () => {
        if (!confirm("Esto generará horarios para esta semana. ¿Continuar?")) return;
        setSeeding(true);
        try {
            await masterService.generateSlots(weekStart, 7);
            await loadData(); // Reload all
            alert(`Horarios generados correctamente.\nSemana: ${dateUtils.formatDateId(weekStart)}`);
        } catch (error) {
            console.error(error);
            alert("Error al generar horarios");
        } finally {
            setSeeding(false);
        }
    };

    const openBookingModal = (slot: DailySlot) => {
        setSelectedSlot(slot);
        setSearchTerm('');
        setViewMode('list');
        setIsModalOpen(true);
    };

    const handleBooking = async (student: Student) => {
        if (!selectedSlot) return;

        if (!confirm(`¿Confirmar reserva para ${student.fullName}? Se descontará 1 crédito.`)) return;

        setBookingLoading(true);
        try {
            // Using "ADMIN_TEST" as placeholder for user ID until Auth is fully set
            await scheduleService.confirmBooking(selectedSlot.id, student.id, "ADMIN_TEST");

            // Refresh data
            await loadData();
            setIsModalOpen(false);
            // alert("Reserva exitosa");
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Error al reservar");
        } finally {
            setBookingLoading(false);
        }
    };

    const filteredStudents = students.filter(s =>
        s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.dni.includes(searchTerm)
    );

    const handleCancelBooking = async (student: Student) => {
        if (!selectedSlot) return;

        if (!confirm(`¿Eliminar a ${student.fullName} de esta clase?`)) return;

        setBookingLoading(true);
        try {
            await scheduleService.cancelBooking(selectedSlot.id, student.id);
            await loadData();
            // Update the selected slot with new data
            const updatedSlot = slots.find(s => s.id === selectedSlot.id);
            if (updatedSlot) {
                setSelectedSlot({ ...updatedSlot, attendeeIds: updatedSlot.attendeeIds.filter(id => id !== student.id) });
            }
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Error al cancelar reserva");
        } finally {
            setBookingLoading(false);
        }
    };

    const getSlot = (dateStr: string, timeId: string) => {
        return slots.find(s => s.date === dateStr && s.timeId === timeId);
    };

    const getStatusColor = (capacity: number, attendees: number) => {
        const ratio = attendees / capacity;
        if (ratio >= 1) return 'bg-red-50 text-red-700 border-red-200';
        if (ratio >= 0.8) return 'bg-amber-50 text-amber-700 border-amber-200';
        return 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 hover:shadow-sm';
    };

    return (
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                        <CalendarIcon className="w-8 h-8 text-sky-600" />
                        Horarios
                    </h2>
                    <p className="text-slate-500">Gestión de reservas y asistencia</p>
                </div>

                <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                    <button onClick={handlePrevWeek} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-mono font-bold text-slate-700 px-4 min-w-[140px] text-center">
                        {weekStart.toLocaleDateString('es-PE', { month: 'short', day: 'numeric' })} - {' '}
                        {weekDays[6].toLocaleDateString('es-PE', { month: 'short', day: 'numeric' })}
                    </span>
                    <button onClick={handleNextWeek} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <button
                    onClick={handleSeed}
                    disabled={seeding}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-mono disabled:opacity-50"
                >
                    <RefreshCw className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} />
                    {seeding ? 'Generando...' : 'Generar Horarios (Debug)'}
                </button>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 overflow-auto bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-w-[800px]">
                <div className="grid grid-cols-8 border-b border-slate-100 bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <div className="p-4 font-bold text-slate-400 text-center text-xs uppercase tracking-wider flex items-center justify-center">
                        Hora
                    </div>
                    {weekDays.map((day, i) => (
                        <div key={i} className={`p-3 text-center border-l border-slate-100 ${day.toDateString() === new Date().toDateString() ? 'bg-sky-50/50' : ''
                            }`}>
                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">
                                {day.toLocaleDateString('es-PE', { weekday: 'short' })}
                            </div>
                            <div className={`text-xl font-bold ${day.toDateString() === new Date().toDateString() ? 'text-sky-600' : 'text-slate-700'
                                }`}>
                                {day.getDate()}
                            </div>
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {HOURS.map(hour => (
                            <div key={hour.id} className="grid grid-cols-8 hover:bg-slate-50/30 transition-colors">
                                <div className="p-3 text-xs font-bold text-slate-400 border-r border-slate-100 flex items-center justify-center font-mono bg-slate-50/30">
                                    {hour.label.split(' - ')[0]}
                                </div>
                                {weekDays.map((day, i) => {
                                    const dateStr = dateUtils.formatDateId(day);
                                    const slot = getSlot(dateStr, hour.id);

                                    if (!slot) return (
                                        <div key={i} className="p-1 border-l border-slate-100 min-h-[80px]"></div>
                                    );

                                    const isFull = (slot.attendeeIds?.length ?? 0) >= slot.capacity;
                                    const colorClass = getStatusColor(slot.capacity, slot.attendeeIds?.length ?? 0);
                                    const hasDebtor = slot.attendeeIds?.some(id => students.find(s => s.id === id)?.hasDebt);

                                    return (
                                        <div key={i} className="p-1 border-l border-slate-100 min-h-[80px]">
                                            <button
                                                onClick={() => openBookingModal(slot)}
                                                className={`w-full h-full rounded-lg border p-2 flex flex-col justify-between transition-all ${colorClass} ${hasDebtor ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <span className="text-[10px] font-bold opacity-70">
                                                        {hour.label.split(' - ')[0]}
                                                    </span>
                                                    {isFull && <span className="text-[10px] font-bold bg-white/50 px-1.5 rounded">FULL</span>}
                                                </div>

                                                <div className="flex items-center gap-1.5 self-end">
                                                    {hasDebtor && (
                                                        <DollarSign className="w-3 h-3 text-red-600 animate-pulse" />
                                                    )}
                                                    <Users className="w-3 h-3" />
                                                    <span className="text-xs font-bold font-mono">
                                                        {slot.attendeeIds?.length ?? 0}/{slot.capacity}
                                                    </span>
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Booking Modal */}
            {isModalOpen && selectedSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800">Reservar Clase</h3>
                                <p className="text-sm text-slate-500">
                                    {selectedSlot.timeId} • {selectedSlot.date}
                                </p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        {/* Search Box */}
                        {/* Tabs */}
                        <div className="flex border-b border-slate-100">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'list' ? 'text-sky-600 border-b-2 border-sky-600' : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                Asistentes ({selectedSlot.attendeeIds?.length ?? 0})
                            </button>
                            <button
                                onClick={() => setViewMode('add')}
                                className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'add' ? 'text-sky-600 border-b-2 border-sky-600' : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                Inscribir (+ New)
                            </button>
                        </div>

                        {/* Search Box (Only in Add mode) */}
                        {viewMode === 'add' && (
                            <div className="p-4 border-b border-slate-100">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar alumno para inscribir..."
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
                                // --- LIST VIEW ---
                                (!selectedSlot.attendeeIds || selectedSlot.attendeeIds.length === 0) ? (
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
                                    selectedSlot.attendeeIds.map(studentId => {
                                        const student = students.find(s => s.id === studentId);
                                        if (!student) return null;
                                        return (
                                            <div key={student.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl group transition-colors border border-transparent hover:border-slate-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-xs">
                                                        {student.fullName.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-700">{student.fullName}</p>
                                                        <p className="text-xs text-slate-400">{student.dni}</p>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleCancelBooking(student)}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar reserva"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })
                                )
                            ) : (
                                // --- ADD VIEW ---
                                filteredStudents.length === 0 ? (
                                    <p className="text-center text-slate-400 py-8">No se encontraron alumnos</p>
                                ) : (
                                    filteredStudents.map(student => {
                                        const isEnrolled = selectedSlot.attendeeIds?.includes(student.id);
                                        const hasCredits = student.remainingCredits > 0;
                                        const canBook = !isEnrolled && hasCredits;

                                        return (
                                            <div key={student.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl group transition-colors">
                                                <div>
                                                    <p className="font-bold text-slate-700">{student.fullName}</p>
                                                    <p className="text-xs text-slate-400">{student.dni}</p>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {student.hasDebt ? (
                                                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                                                            DEUDA
                                                        </span>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${hasCredits ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {student.remainingCredits} créd.
                                                        </span>
                                                    )}

                                                    {bookingLoading ? (
                                                        <div className="w-8 h-8 flex items-center justify-center">...</div>
                                                    ) : isEnrolled ? (
                                                        <span className="text-xs text-emerald-600 font-bold px-2">Inscrito</span>
                                                    ) : (
                                                        <button
                                                            disabled={!canBook || student.hasDebt}
                                                            onClick={() => handleBooking(student)}
                                                            className={`p-2 rounded-lg transition-colors ${canBook && !student.hasDebt
                                                                ? 'bg-sky-100 text-sky-600 hover:bg-sky-600 hover:text-white'
                                                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                }`}
                                                        >
                                                            {student.hasDebt ? <DollarSign className="w-5 h-5" /> : (hasCredits ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />)}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-center text-slate-400">
                            Cupos disponibles: {selectedSlot.capacity - (selectedSlot.attendeeIds?.length ?? 0)} / {selectedSlot.capacity}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
