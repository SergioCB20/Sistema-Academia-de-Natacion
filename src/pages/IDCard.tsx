
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Printer, X } from 'lucide-react';
import { studentService } from '../services/students';
import type { Student } from '../types/db';

export default function IDCard() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [students, setStudents] = useState<Student[]>([]);
    const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

    useEffect(() => {
        const init = async () => {
            const data = await studentService.getAllActive();
            setStudents(data);

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
            return `${start}:00 - ${end}:00`;
        };

        return { days: dayStr || '-', time: cleanTime(timeStr) || '-' };
    };

    const formatDate = (ts: number | string) => {
        if (!ts) return '-';
        // If string YYYY-MM-DD
        if (typeof ts === 'string') {
            const [y, m, d] = ts.split('-');
            return `${d}/${m}/${y}`;
        }
        // If timestamp
        return new Date(ts).toLocaleDateString('es-PE');
    };

    const getEndDate = (startDate: number) => {
        if (!startDate) return '-';
        const d = new Date(startDate);
        d.setDate(d.getDate() + 28);
        return d.toLocaleDateString('es-PE');
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
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
                            {/* VISUAL REPRESENTATION (Simulating the physical card background lightly) */}
                            <div className="relative w-[500px] h-[290px] bg-sky-200 rounded-xl shadow-lg border border-sky-300 p-6 text-sky-900 overflow-hidden transform scale-95 origin-center">
                                {/* Watermark / Logo placeholder */}
                                <div className="absolute top-4 left-4 w-24 h-24 bg-sky-100/50 rounded-full blur-xl" />

                                <div className="text-center mb-6">
                                    <h2 className="text-xl font-extrabold uppercase tracking-widest text-sky-800">Academia de Natación Los Parrales</h2>
                                    <p className="text-xs font-bold text-sky-700">Jr. Guardia Civil Norte Mz I Lt 6 Santiago de Surco</p>
                                </div>

                                <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
                                    {/* Left Column: Photo Area Placeholder */}
                                    <div className="w-24 h-32 bg-sky-100/50 border-2 border-dashed border-sky-400 rounded-lg flex items-center justify-center">
                                        <span className="text-xs text-sky-500 font-bold">FOTO</span>
                                    </div>

                                    {/* Right Column: Details */}
                                    <div className="space-y-2 text-sm font-bold">
                                        <div className="grid grid-cols-[100px_1fr]">
                                            <span className="text-sky-700">ALUMNO:</span>
                                            <span className="text-black uppercase text-lg leading-none">{selectedStudent.fullName}</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr]">
                                            <span className="text-sky-700">EDAD:</span>
                                            <span className="text-black">{calculateAge(selectedStudent)} AÑOS</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr]">
                                            <span className="text-sky-700">CATEGORÍA:</span>
                                            <span className="text-black uppercase">{selectedStudent.category}</span>
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr]">
                                            <span className="text-sky-700">HORARIO:</span>
                                            <div>
                                                <div className="text-black">{formatSchedule(selectedStudent.fixedSchedule).days}</div>
                                                <div className="text-black text-xs">{formatSchedule(selectedStudent.fixedSchedule).time}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="absolute bottom-6 left-8 right-8 flex justify-between text-xs font-bold border-t border-sky-400/30 pt-2">
                                    <div>
                                        <span className="text-sky-700 mr-2">INICIO:</span>
                                        <span className="text-black">{formatDate(selectedStudent.createdAt)}</span>
                                    </div>
                                    <div>
                                        <span className="text-sky-700 mr-2">FINAL:</span>
                                        <span className="text-black">{getEndDate(selectedStudent.createdAt)}</span>
                                    </div>
                                    <div>
                                        <span className="text-sky-700 mr-2">CÓDIGO:</span>
                                        <span className="text-black">{selectedStudent.dni}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PRINT ONLY SECTION - HIDDEN IN SCREEN, VISIBLE IN PRINT */}
                        <div className="hidden print:block print:fixed print:top-0 print:left-0 print:w-full print:h-full print:bg-white print:z-[100]">
                            {/* Specific layout for the pre-printed card */}
                            <div className="relative w-[85mm] h-[55mm] font-sans text-black text-[10pt] font-bold">
                                {/* Positioning these absolute based on the provided image roughly */}
                                {/* Name */}
                                <div className="absolute top-[35%] left-[25%] uppercase leading-tight w-[60%]">
                                    {selectedStudent.fullName}
                                </div>
                                {/* Age */}
                                <div className="absolute top-[48%] left-[25%]">
                                    {calculateAge(selectedStudent)} AÑOS
                                </div>
                                {/* Category */}
                                <div className="absolute top-[56%] left-[25%]">
                                    {selectedStudent.category}
                                </div>
                                {/* Schedule (Time) */}
                                <div className="absolute top-[64%] left-[25%]">
                                    {/* Example image shows: 01:00 p.m. - 02:00 p.m. */}
                                    {/* My format: 06:00 - 07:00 */}
                                    {formatSchedule(selectedStudent.fixedSchedule).time}
                                </div>
                                {/* Schedule (Days) */}
                                <div className="absolute top-[72%] left-[25%]">
                                    {/* Example image shows: Lun - Mie - Vie */}
                                    {formatSchedule(selectedStudent.fixedSchedule).days}
                                </div>

                                {/* Dates Footer */}
                                <div className="absolute bottom-[18%] left-[25%] flex gap-8 text-[9pt]">
                                    <span>{formatDate(selectedStudent.createdAt)}</span>
                                    {/* Gap for "Final:" label space on card */}
                                    <span className="ml-12">{/* Final Date if needed? Image has blank boxes */} </span>
                                </div>

                                {/* Code top right */}
                                <div className="absolute top-[45%] right-[5%] text-right">
                                    {selectedStudent.dni}
                                </div>
                            </div>
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
                    </div>
                </div>
            )}

            {/* Print Styles */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    /* Ensure exact sizing for card if possible */
                    @page { size: auto; margin: 0; }
                }
            `}</style>
        </div>
    );
}
