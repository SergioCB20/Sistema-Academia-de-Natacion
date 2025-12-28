
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Printer, X } from 'lucide-react';
import { studentService } from '../services/students';
import { cardConfigService } from '../services/cardConfig';
import { categoryService } from '../services/categoryService';
import type { Student, CardConfig, Category } from '../types/db';

export default function IDCard() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [students, setStudents] = useState<Student[]>([]);
    const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [cardConfig, setCardConfig] = useState<CardConfig | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);

    useEffect(() => {
        const init = async () => {
            const data = await studentService.getAllActive();
            setStudents(data);

            // Load card configuration
            const config = await cardConfigService.getConfig();
            // Ensure printMargins exists for backward compatibility
            if (!config.printMargins) {
                config.printMargins = {
                    top: '0mm',
                    right: '45mm',
                    bottom: '0mm',
                    left: '58mm'
                };
            }
            setCardConfig(config);

            // Load categories
            const cats = await categoryService.getAll();
            setCategories(cats);

            // Auto-open if DNI in URL
            const dni = searchParams.get('dni');
            if (dni) {
                const found = data.find(s => s.dni === dni);
                if (found) {
                    setSelectedStudent(found);
                    // Clear param
                    setSearchParams({});
                }
            }
        };
        init();
    }, []);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setFilteredStudents([]);
            return;
        }
        const lower = searchTerm.toLowerCase();
        const filtered = students.filter(s =>
            s.fullName.toLowerCase().includes(lower) ||
            s.dni.includes(lower)
        );
        setFilteredStudents(filtered);
    }, [searchTerm, students]);

    const getCategoryName = (student: Student): string => {
        if (!student.categoryId) return student.category || '-';
        const cat = categories.find(c => c.id === student.categoryId);
        return cat?.name || student.category || '-';
    };

    const formatStudentCode = (student: Student): string => {
        const code = student.studentCode || student.dni || '0';
        return code.padStart(8, '0');
    };

    const calculateAge = (student: Student) => {
        if (student.age !== undefined && student.age !== null) return student.age;
        if (!student.birthDate) return '-';
        const birth = new Date(student.birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const formatSchedule = (schedule: Student['fixedSchedule']): { days: string, time: string } => {
        if (!schedule || schedule.length === 0) return { days: '-', time: '-' };
        // Group by time? or just list days?
        // Simple format: "LUN - MIE - VIE" (Assuming same time for simplicity or taking first)
        // Let's list unique days
        const dayOrder = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
        const uniqueDays = [...new Set(schedule.map(s => s.dayId))].sort((a, b) => {
            return dayOrder.indexOf(a) - dayOrder.indexOf(b);
        });

        const dayStr = uniqueDays.join(' - ');

        // Find common time range if possible
        const timeStr = schedule[0]?.timeId || ''; // Can be improved to look up labels
        // We know timeId is like "06-07", let's format it loosely
        const cleanTime = (t: string) => {
            const [start, end] = t.split('-');
            const formatHour = (hour: string) => {
                const h = parseInt(hour);
                if (h === 0) return '12:00am';
                if (h < 12) return `${h}:00am`;
                if (h === 12) return '12:00pm';
                return `${h - 12}:00pm`;
            };
            return `${formatHour(start)} - ${formatHour(end)}`;
        };

        return { days: dayStr || '-', time: cleanTime(timeStr) || '-' };
    };

    const formatDate = (ts: number | string) => {
        if (!ts) return '-';

        // If string in format YYYY-MMM-DD (e.g., "2026-Jan-29")
        if (typeof ts === 'string' && ts.includes('-')) {
            // Try to parse as Date first
            const date = new Date(ts);
            if (!isNaN(date.getTime())) {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}/${month}/${year}`;
            }
        }

        // If timestamp - format as DD/MM/YYYY
        const date = new Date(ts);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const getEndDate = (startDate: number) => {
        if (!startDate) return '-';
        const d = new Date(startDate);
        d.setDate(d.getDate() + 28);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            {/* Dynamic print margins */}
            {cardConfig && (
                <style>{`
                    @page {
                        margin-top: ${cardConfig.printMargins.top};
                        margin-right: ${cardConfig.printMargins.right};
                        margin-bottom: ${cardConfig.printMargins.bottom};
                        margin-left: ${cardConfig.printMargins.left};
                        size: A4;
                    }
                `}</style>
            )}

            <div className="flex items-center justify-between no-print">
                <h2 className="text-3xl font-bold text-slate-800">Búsqueda de Carnet</h2>
            </div>

            {/* SEARCH SECTION */}
            <div className="max-w-xl mx-auto mt-12 no-print">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center relative">
                    <div className="mx-auto w-16 h-16 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center mb-6">
                        <Search className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Buscar Alumno</h3>
                    <p className="text-slate-500 mb-6">Ingresa el nombre del alumno para ver su carnet digital.</p>

                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Nombre del alumno..."
                            className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* LIVE RESULTS */}
                    {searchTerm && (
                        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-10 max-h-60 overflow-y-auto">
                            {filteredStudents.length > 0 ? (
                                filteredStudents.map(student => (
                                    <button
                                        key={student.id}
                                        onClick={() => setSelectedStudent(student)}
                                        className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                                    >
                                        <div>
                                            <p className="font-bold text-slate-800">{student.fullName}</p>
                                            <p className="text-xs text-slate-500">DNI: {student.dni}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider bg-slate-100 text-slate-500`}>
                                                {student.category}
                                            </span>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="p-4 text-slate-500 text-sm">No se encontraron alumnos</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ID CARD PREVIEW MODAL */}
            {selectedStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-xl font-bold text-slate-800">Vista Previa del Carnet</h3>
                            <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <div className="p-4 bg-slate-100 flex justify-center overflow-auto">
                            {/* PREVIEW - Matches physical card */}
                            {cardConfig && (
                                <div
                                    className="relative bg-pink-200 border-2 border-pink-300 shadow-lg font-sans text-black font-bold"
                                    style={{
                                        width: cardConfig.width,
                                        height: cardConfig.height,
                                        transform: 'scale(1.2)'
                                    }}
                                >
                                    {/* NOMBRE */}
                                    <div
                                        className="absolute uppercase leading-tight"
                                        style={{
                                            top: cardConfig.fields.nombre.top,
                                            bottom: cardConfig.fields.nombre.bottom,
                                            left: cardConfig.fields.nombre.left,
                                            right: cardConfig.fields.nombre.right,
                                            fontSize: cardConfig.fields.nombre.fontSize
                                        }}
                                    >
                                        {selectedStudent.fullName}
                                    </div>

                                    {/* CÓDIGO */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.codigo.top,
                                            bottom: cardConfig.fields.codigo.bottom,
                                            left: cardConfig.fields.codigo.left,
                                            right: cardConfig.fields.codigo.right,
                                            fontSize: cardConfig.fields.codigo.fontSize,
                                            textAlign: cardConfig.fields.codigo.right ? 'right' : 'left'
                                        }}
                                    >
                                        {formatStudentCode(selectedStudent)}
                                    </div>

                                    {/* EDAD */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.edad.top,
                                            bottom: cardConfig.fields.edad.bottom,
                                            left: cardConfig.fields.edad.left,
                                            right: cardConfig.fields.edad.right,
                                            fontSize: cardConfig.fields.edad.fontSize
                                        }}
                                    >
                                        {calculateAge(selectedStudent)} AÑOS
                                    </div>

                                    {/* CATEGORÍA */}
                                    <div
                                        className="absolute uppercase"
                                        style={{
                                            top: cardConfig.fields.categoria.top,
                                            bottom: cardConfig.fields.categoria.bottom,
                                            left: cardConfig.fields.categoria.left,
                                            right: cardConfig.fields.categoria.right,
                                            fontSize: cardConfig.fields.categoria.fontSize
                                        }}
                                    >
                                        {getCategoryName(selectedStudent)}
                                    </div>

                                    {/* HORARIO (HORA) */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.horarioTime.top,
                                            bottom: cardConfig.fields.horarioTime.bottom,
                                            left: cardConfig.fields.horarioTime.left,
                                            right: cardConfig.fields.horarioTime.right,
                                            fontSize: cardConfig.fields.horarioTime.fontSize
                                        }}
                                    >
                                        {formatSchedule(selectedStudent.fixedSchedule).time}
                                    </div>

                                    {/* HORARIO (DÍAS) */}
                                    <div
                                        className="absolute uppercase"
                                        style={{
                                            top: cardConfig.fields.horarioDays.top,
                                            bottom: cardConfig.fields.horarioDays.bottom,
                                            left: cardConfig.fields.horarioDays.left,
                                            right: cardConfig.fields.horarioDays.right,
                                            fontSize: cardConfig.fields.horarioDays.fontSize
                                        }}
                                    >
                                        {formatSchedule(selectedStudent.fixedSchedule).days}
                                    </div>

                                    {/* FECHA INICIO */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.fechaInicio.top,
                                            bottom: cardConfig.fields.fechaInicio.bottom,
                                            left: cardConfig.fields.fechaInicio.left,
                                            right: cardConfig.fields.fechaInicio.right,
                                            fontSize: cardConfig.fields.fechaInicio.fontSize
                                        }}
                                    >
                                        {selectedStudent.packageStartDate ? formatDate(selectedStudent.packageStartDate) : '-'}
                                    </div>

                                    {/* FECHA FINAL */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.fechaFinal.top,
                                            bottom: cardConfig.fields.fechaFinal.bottom,
                                            left: cardConfig.fields.fechaFinal.left,
                                            right: cardConfig.fields.fechaFinal.right,
                                            fontSize: cardConfig.fields.fechaFinal.fontSize
                                        }}
                                    >
                                        {selectedStudent.packageEndDate ? formatDate(selectedStudent.packageEndDate) : '-'}
                                    </div>

                                    {/* CLASES */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.clases.top,
                                            bottom: cardConfig.fields.clases.bottom,
                                            left: cardConfig.fields.clases.left,
                                            right: cardConfig.fields.clases.right,
                                            fontSize: cardConfig.fields.clases.fontSize
                                        }}
                                    >
                                        {selectedStudent.remainingCredits || 0}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* PRINT ONLY SECTION - HIDDEN IN SCREEN, VISIBLE IN PRINT */}
                        <div className="hidden print:block print:fixed print:top-0 print:left-0 print:w-full print:h-full print:bg-white print:z-[100]">
                            {cardConfig && (
                                <div
                                    className="relative font-sans text-black font-bold"
                                    style={{
                                        width: cardConfig.width,
                                        height: cardConfig.height
                                    }}
                                >
                                    {/* NOMBRE */}
                                    <div
                                        className="absolute uppercase leading-tight"
                                        style={{
                                            top: cardConfig.fields.nombre.top,
                                            bottom: cardConfig.fields.nombre.bottom,
                                            left: cardConfig.fields.nombre.left,
                                            right: cardConfig.fields.nombre.right,
                                            fontSize: cardConfig.fields.nombre.fontSize
                                        }}
                                    >
                                        {selectedStudent.fullName}
                                    </div>

                                    {/* CÓDIGO */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.codigo.top,
                                            bottom: cardConfig.fields.codigo.bottom,
                                            left: cardConfig.fields.codigo.left,
                                            right: cardConfig.fields.codigo.right,
                                            fontSize: cardConfig.fields.codigo.fontSize,
                                            textAlign: cardConfig.fields.codigo.right ? 'right' : 'left'
                                        }}
                                    >
                                        {formatStudentCode(selectedStudent)}
                                    </div>

                                    {/* EDAD */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.edad.top,
                                            bottom: cardConfig.fields.edad.bottom,
                                            left: cardConfig.fields.edad.left,
                                            right: cardConfig.fields.edad.right,
                                            fontSize: cardConfig.fields.edad.fontSize
                                        }}
                                    >
                                        {calculateAge(selectedStudent)} AÑOS
                                    </div>

                                    {/* CATEGORÍA */}
                                    <div
                                        className="absolute uppercase"
                                        style={{
                                            top: cardConfig.fields.categoria.top,
                                            bottom: cardConfig.fields.categoria.bottom,
                                            left: cardConfig.fields.categoria.left,
                                            right: cardConfig.fields.categoria.right,
                                            fontSize: cardConfig.fields.categoria.fontSize
                                        }}
                                    >
                                        {getCategoryName(selectedStudent)}
                                    </div>

                                    {/* HORARIO (HORA) */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.horarioTime.top,
                                            bottom: cardConfig.fields.horarioTime.bottom,
                                            left: cardConfig.fields.horarioTime.left,
                                            right: cardConfig.fields.horarioTime.right,
                                            fontSize: cardConfig.fields.horarioTime.fontSize
                                        }}
                                    >
                                        {formatSchedule(selectedStudent.fixedSchedule).time}
                                    </div>

                                    {/* HORARIO (DÍAS) */}
                                    <div
                                        className="absolute uppercase"
                                        style={{
                                            top: cardConfig.fields.horarioDays.top,
                                            bottom: cardConfig.fields.horarioDays.bottom,
                                            left: cardConfig.fields.horarioDays.left,
                                            right: cardConfig.fields.horarioDays.right,
                                            fontSize: cardConfig.fields.horarioDays.fontSize
                                        }}
                                    >
                                        {formatSchedule(selectedStudent.fixedSchedule).days}
                                    </div>

                                    {/* FECHA INICIO */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.fechaInicio.top,
                                            bottom: cardConfig.fields.fechaInicio.bottom,
                                            left: cardConfig.fields.fechaInicio.left,
                                            right: cardConfig.fields.fechaInicio.right,
                                            fontSize: cardConfig.fields.fechaInicio.fontSize
                                        }}
                                    >
                                        {selectedStudent.packageStartDate ? formatDate(selectedStudent.packageStartDate) : '-'}
                                    </div>

                                    {/* FECHA FINAL */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.fechaFinal.top,
                                            bottom: cardConfig.fields.fechaFinal.bottom,
                                            left: cardConfig.fields.fechaFinal.left,
                                            right: cardConfig.fields.fechaFinal.right,
                                            fontSize: cardConfig.fields.fechaFinal.fontSize
                                        }}
                                    >
                                        {selectedStudent.packageEndDate ? formatDate(selectedStudent.packageEndDate) : '-'}
                                    </div>

                                    {/* CLASES */}
                                    <div
                                        className="absolute"
                                        style={{
                                            top: cardConfig.fields.clases.top,
                                            bottom: cardConfig.fields.clases.bottom,
                                            left: cardConfig.fields.clases.left,
                                            right: cardConfig.fields.clases.right,
                                            fontSize: cardConfig.fields.clases.fontSize
                                        }}
                                    >
                                        {selectedStudent.remainingCredits || 0}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 no-print">
                            <button
                                onClick={handlePrint}
                                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20"
                            >
                                <Printer className="w-5 h-5" />
                                Imprimir Carnet
                            </button>
                        </div>
                    </div >
                </div >
            )
            }

            {/* Print Styles */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    /* Ensure exact sizing for card if possible */
                    @page { size: auto; margin: 0; }
                }
            `}</style>
        </div >
    );
}
