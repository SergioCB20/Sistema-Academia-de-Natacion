import * as XLSX from 'xlsx';
import { doc, runTransaction, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Student, DayType } from '../types/db';

// ============================================
// MAPEO DE CÓDIGOS DEL SISTEMA ANTIGUO (ACCESS)
// ============================================

// Cod_Hor → dayType y dayIds
const HORARIO_MAP: Record<number, { dayType: DayType; dayIds: string[] }> = {
    1: { dayType: 'lun-mier-vier', dayIds: ['LUN', 'MIE', 'VIE'] },
    2: { dayType: 'mar-juev', dayIds: ['MAR', 'JUE'] },
    3: { dayType: 'sab-dom', dayIds: ['SAB', 'DOM'] },
    4: { dayType: 'lun-mier-vier', dayIds: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] }, // Especial: todos los días
};

// Cod_Tur → timeId
const TURNO_MAP: Record<number, string> = {
    1: '07:00-08:00',
    2: '08:00-09:00',
    3: '09:00-10:00',
    4: '10:00-11:00',
    5: '11:00-12:00',
    6: '12:00-13:00',
    7: '13:00-14:00',
    8: '14:00-14:30', // Descanso
    9: '14:30-15:30',
    10: '15:30-16:30',
    11: '16:30-17:30',
    12: '17:30-18:30',
    13: '18:30-19:30',
    14: '19:30-20:30',
    15: '20:30-21:30',
    16: '06:00-07:00',
    17: '21:30-22:30',
};

// Cod_Cat → categoryId (se debe mapear dinámicamente con las categorías del sistema)
const CATEGORIA_MAP: Record<string, { name: string; ageMin: number; ageMax: number }> = {
    '01': { name: 'AQUA BB', ageMin: 0, ageMax: 4 },
    '02': { name: '05 - 07 años', ageMin: 5, ageMax: 7 },
    '03': { name: '08 a 11 años', ageMin: 8, ageMax: 11 },
    '04': { name: '12 a 18 años', ageMin: 12, ageMax: 18 },
    '05': { name: 'ADULTOS', ageMin: 18, ageMax: 100 },
    '06': { name: 'DESCANSO', ageMin: 1, ageMax: 99 },
};

// ============================================
// INTERFACES
// ============================================

export interface ImportRow {
    Cod_Al: string;
    Nom_Al: string;
    Ape_Al: string;
    Edad_Al: number;
    Cod_Cat: string;
    Cod_Hor: number;
    Cod_Tur: number;
    Fini_Al: string | Date;
    Ffin_Al: string | Date;
    Clas_Al: number;
    Est_Al: string;
    Obs_Al: string; // Este es el teléfono en el sistema nuevo
}

export interface TransformedStudent {
    original: ImportRow;
    student: Partial<Student>;
    errors: string[];
    isValid: boolean;
}

export interface ImportResult {
    success: number;
    failed: number;
    errors: Array<{ row: number; name: string; error: string }>;
}

// ============================================
// FUNCIONES DE PARSEO
// ============================================

/**
 * Parsea un archivo Excel y extrae las filas como objetos
 */
export function parseExcelFile(file: File): Promise<ImportRow[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array', cellDates: true }); // Usar cellDates para obtener objetos Date nativos

                // Tomar la primera hoja
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Convertir a JSON
                const rows = XLSX.utils.sheet_to_json<ImportRow>(worksheet, {
                    raw: true // Obtener valores crudos (Dates como Objetos, no strings formateados)
                });

                resolve(rows);
            } catch (error) {
                reject(new Error('Error al leer el archivo Excel'));
            }
        };

        reader.onerror = () => {
            reject(new Error('Error al cargar el archivo'));
        };

        reader.readAsArrayBuffer(file);
    });
}

/**
 * Convierte fecha de Excel a formato YYYY-MM-DD
 */
function parseExcelDate(value: string | Date | number | undefined): string | null {
    if (!value) return null;

    // Si ya es un Date (XLSX con cellDates: true a veces devuelve Date)
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        // Ajuste para evitar desfase de zona horaria si la fecha es solo día
        const year = value.getUTCFullYear();
        const month = String(value.getUTCMonth() + 1).padStart(2, '0');
        const day = String(value.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Si es un número (Excel serial date)
    if (typeof value === 'number') {
        try {
            const date = XLSX.SSF.parse_date_code(value);
            return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        } catch (e) {
            return null;
        }
    }

    // Si es un string
    if (typeof value === 'string') {
        const clean = value.trim();
        if (!clean) return null;

        // Formato DD-Mes-AA (Español) o DD/MM/YYYY
        // Ejemplo detectado en screenshot: 05-Ene-26
        const parts = clean.split(/[/-]/);
        if (parts.length === 3) {
            let [d, m, y] = parts;

            // Si el primer parte tiene 4 dígitos, es YYYY-MM-DD
            if (d.length === 4) {
                return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}`;
            }

            // Mapeo de meses en español
            const months: Record<string, string> = {
                'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
                'jul': '07', 'ago': '08', 'set': '09', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
            };

            const monthKey = m.toLowerCase().substring(0, 3);
            if (months[monthKey]) {
                m = months[monthKey];
            }

            // Ajustar año
            if (y.length === 2) y = '20' + y;

            // Retornar formato estándar YYYY-MM-DD
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        // Formato YYYY-MM-DD directo
        if (clean.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return clean;
        }
    }

    return null;
}

/**
 * Aplica correcciones automáticas a los datos crudos del Excel
 */
export function applyAutoFixes(rows: ImportRow[]): { fixedRows: ImportRow[], summary: string[] } {
    const summary: string[] = [];
    let dateFixes = 0;
    let categoryFixes = 0;

    const fixedRows = rows.map(row => {
        const newRow = { ...row };

        // 1. Corregir fechas invertidas (Ffin < Fini)
        // Usamos parseExcelDate para normalizar a YYYY-MM-DD para comparar
        const dIniStr = parseExcelDate(newRow.Fini_Al);
        const dFinStr = parseExcelDate(newRow.Ffin_Al);

        if (dIniStr && dFinStr && dFinStr < dIniStr) {
            // Intercambiar valores originales para preservar el tipo (Date o String o Número)
            const temp = newRow.Fini_Al;
            newRow.Fini_Al = newRow.Ffin_Al;
            newRow.Ffin_Al = temp;
            dateFixes++;
        }

        // 2. Corregir categorías por edad basándose en la configuración REAL del sistema (Screenshot)
        const age = newRow.Edad_Al || 0;
        const currentCatCode = newRow.Cod_Cat?.toString().padStart(2, '0');
        const currentCatInfo = CATEGORIA_MAP[currentCatCode];

        // Solo intentar corregir si no es DESCANSO (06)
        if (currentCatCode !== '06' && currentCatCode !== '6') {
            let isCurrentValid = false;
            if (currentCatInfo) {
                // Renato (18) es válido tanto en 12-18 como en ADULTOS (18-100)
                isCurrentValid = age >= currentCatInfo.ageMin && age <= currentCatInfo.ageMax;
            }

            // Si la categoría actual no es válida para la edad, buscar la mejor coincidencia
            if (!isCurrentValid) {
                let correctCat = '';
                if (age >= 0 && age <= 4) correctCat = '01'; // AQUA BB / PRESCOLAR
                else if (age >= 5 && age <= 7) correctCat = '02'; // 05 - 07 años
                else if (age >= 8 && age <= 11) correctCat = '03'; // 08 a 11 años
                else if (age >= 12 && age <= 18) correctCat = '04'; // 12 a 18 años
                else if (age >= 19) correctCat = '05'; // ADULTOS

                if (correctCat && currentCatCode !== correctCat) {
                    newRow.Cod_Cat = correctCat;
                    categoryFixes++;
                }
            }
        }

        return newRow;
    });

    if (dateFixes > 0) summary.push(`Se corrigieron ${dateFixes} alumnos con fechas invertidas.`);
    if (categoryFixes > 0) summary.push(`Se ajustaron ${categoryFixes} alumnos a su categoría correcta según edad.`);

    return { fixedRows, summary };
}

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

/**
 * Transforma una fila del Excel al formato Student del sistema nuevo
 */
export function transformRow(
    row: ImportRow,
    categoryMap: Map<string, { name: string; ageMin: number; ageMax: number }>, // id -> { name, ageMin, ageMax }
    seasonId: string
): TransformedStudent {
    const errors: string[] = [];

    // Validar campos requeridos
    if (!row.Nom_Al || !row.Ape_Al) {
        errors.push('Nombre o apellido vacío');
    }

    // Mapear horario (días)
    const horario = HORARIO_MAP[row.Cod_Hor];
    if (!horario && row.Cod_Hor) {
        errors.push(`Código de horario desconocido: ${row.Cod_Hor}`);
    }

    // Mapear turno (hora)
    const timeId = TURNO_MAP[row.Cod_Tur];
    if (!timeId && row.Cod_Tur) {
        errors.push(`Código de turno desconocido: ${row.Cod_Tur}`);
    }

    // Mapear categoría usando el rango de edad del estudiante
    const catInfo = CATEGORIA_MAP[row.Cod_Cat?.toString().padStart(2, '0')];
    let categoryId = '';

    if (catInfo && catInfo.name !== 'DESCANSO') {
        // Buscar categoría que coincida con el rango de edad
        const studentAge = row.Edad_Al || 0;

        for (const [catId, catData] of categoryMap.entries()) {
            // catData es { id, ageMin, ageMax }
            if (typeof catData === 'object' && 'ageMin' in catData && 'ageMax' in catData) {
                const { ageMin, ageMax } = catData as { ageMin: number; ageMax: number };
                if (studentAge >= ageMin && studentAge <= ageMax) {
                    categoryId = catId;
                    break;
                }
            }
        }

        // Si no encontró por edad, intentar por nombre similar
        if (!categoryId) {
            for (const [catId, catData] of categoryMap.entries()) {
                if (typeof catData === 'object' && 'name' in catData) {
                    const name = (catData as { name: string }).name.toLowerCase();
                    if (name.includes(catInfo.name.toLowerCase().substring(0, 4))) {
                        categoryId = catId;
                        break;
                    }
                }
            }
        }
    }

    if (!categoryId && row.Cod_Cat && row.Cod_Cat !== '06' && row.Cod_Cat !== '6') {
        errors.push(`Categoría no encontrada: ${row.Cod_Cat}`);
    }

    // Construir fixedSchedule
    const fixedSchedule: Array<{ dayId: string; timeId: string }> = [];
    if (horario && timeId) {
        for (const dayId of horario.dayIds) {
            fixedSchedule.push({ dayId, timeId });
        }
    }

    // Parsear fechas
    const packageStartDate = parseExcelDate(row.Fini_Al);
    const packageEndDate = parseExcelDate(row.Ffin_Al);

    // Validar fechas invertidas
    if (packageStartDate && packageEndDate && packageEndDate < packageStartDate) {
        errors.push('Fecha de fin anterior a inicio');
    }

    // Validar categoría vs edad (si no es DESCANSO)
    if (categoryId && row.Cod_Cat !== '06' && row.Cod_Cat !== '6') {
        const studentAge = row.Edad_Al || 0;
        const currentCatInfo = CATEGORIA_MAP[row.Cod_Cat?.toString().padStart(2, '0')];

        if (currentCatInfo) {
            // Si la edad está fuera del rango de la categoría marcada en el Excel
            if (studentAge < currentCatInfo.ageMin || studentAge > currentCatInfo.ageMax) {
                errors.push(`Edad (${studentAge}) no coincide con categoría ${currentCatInfo.name}`);
            }
        }
    }

    // Generar ID único (usar nombre + timestamp para evitar duplicados)
    const fullName = `${row.Nom_Al} ${row.Ape_Al}`.trim().toUpperCase();
    const id = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Determinar si está activo
    const isActive = row.Est_Al?.toUpperCase() === 'HABILITADO';

    // Limpiar teléfono si es "SIN OBSERVACIONES"
    let phone = (row.Obs_Al || '').trim();
    if (phone.toUpperCase() === 'SIN OBSERVACIONES') {
        phone = '';
    }

    const student: Partial<Student> = {
        id,
        fullName,
        dni: '', // Vacío según indicaciones
        phone: phone, // Obs_Al es el teléfono
        active: isActive,
        remainingCredits: row.Clas_Al || 0,
        hasDebt: false,
        fixedSchedule,
        categoryId,
        seasonId,
        packageStartDate,
        packageEndDate,
        age: row.Edad_Al || null,
        createdAt: Date.now(),
        asistencia: [], // Initialize empty attendance array
    };

    return {
        original: row,
        student,
        errors,
        isValid: errors.length === 0,
    };
}

/**
 * Transforma todas las filas del Excel
 */
export function transformAllRows(
    rows: ImportRow[],
    categoryMap: Map<string, { name: string; ageMin: number; ageMax: number }>,
    seasonId: string
): TransformedStudent[] {
    return rows.map((row) => transformRow(row, categoryMap, seasonId));
}

// ============================================
// FUNCIONES DE IMPORTACIÓN
// ============================================

/**
 * Importa un lote de estudiantes a Firebase
 */
export async function importStudents(
    students: TransformedStudent[],
    onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
    const validStudents = students.filter((s) => s.isValid);
    const result: ImportResult = {
        success: 0,
        failed: 0,
        errors: [],
    };

    const STUDENTS_COLLECTION = 'students';
    const metadataRef = doc(db, 'metadata', 'counters');

    for (let i = 0; i < validStudents.length; i++) {
        const { student, original } = validStudents[i];

        try {
            await runTransaction(db, async (transaction) => {
                // Obtener datos actuales de metadatos
                const metadataDoc = await transaction.get(metadataRef);
                const currentData = metadataDoc.exists() ? metadataDoc.data() : { students: 0, activeStudents: 0 };

                // Usar el código del Excel
                // Intentamos convertirlo a número para asegurar el padding y actualizar el contador
                const excelCodeStr = original.Cod_Al?.toString() || '0';
                const excelCodeNum = parseInt(excelCodeStr, 10) || 0;

                // Mantener el formato del excel (mínimo 6 dígitos)
                const finalCode = excelCodeNum.toString().padStart(Math.max(6, excelCodeStr.length), '0');

                // Actualizar contador global si el código importado es mayor
                const newMaxCount = Math.max(currentData.students || 0, excelCodeNum);

                if (metadataDoc.exists()) {
                    transaction.update(metadataRef, {
                        students: newMaxCount,
                        activeStudents: increment(student.active ? 1 : 0),
                    });
                } else {
                    transaction.set(metadataRef, {
                        students: newMaxCount,
                        activeStudents: student.active ? 1 : 0,
                    });
                }

                // Crear o actualizar estudiante
                const studentRef = doc(db, STUDENTS_COLLECTION, student.id!);
                const finalStudent: Student = {
                    ...student as Student,
                    studentCode: finalCode,
                };
                transaction.set(studentRef, finalStudent);
            });

            // Sincronizar con horarios mensuales (fuera de la transacción de creación)
            if (student.fixedSchedule && student.fixedSchedule.length > 0) {
                try {
                    const { studentService } = await import('./students');
                    await studentService.syncFixedScheduleToMonthlySlots(
                        student.id!,
                        student.fixedSchedule as any,
                        student.packageEndDate,
                        student.packageStartDate
                    );
                } catch (syncError) {
                    console.error(`Error sincronizando horarios para alumno ${student.fullName}:`, syncError);
                    // No detenemos el proceso si falla la sincronización de horarios
                }
            }

            result.success++;
        } catch (error: any) {
            result.failed++;
            result.errors.push({
                row: i + 1,
                name: `${original.Nom_Al} ${original.Ape_Al}`,
                error: error.message || 'Error desconocido',
            });
        }

        // Reportar progreso
        if (onProgress) {
            onProgress(i + 1, validStudents.length);
        }
    }

    return result;
}

/**
 * Borra todos los alumnos de la base de datos y reinicia los contadores
 * ¡CUIDADO! Esta acción es irreversible.
 */
export async function deleteAllStudents(): Promise<void> {
    const STUDENTS_COLLECTION = 'students';
    const metadataRef = doc(db, 'metadata', 'counters');

    // Nota: Como Firestore no tiene un "delete collection", 
    // lo ideal sería traer los IDs y borrar en lotes.
    // Para 85-100 registros, podemos hacerlo de forma simple.
    const { getDocs, collection, writeBatch } = await import('firebase/firestore');

    const querySnapshot = await getDocs(collection(db, STUDENTS_COLLECTION));
    const batch = writeBatch(db);

    querySnapshot.forEach((document) => {
        batch.delete(document.ref);
    });

    // Limpiar inscripciones en horarios mensuales
    const { Timestamp } = await import('firebase/firestore');
    const slotsSnapshot = await getDocs(collection(db, 'monthly_slots'));
    slotsSnapshot.forEach((slotDoc) => {
        batch.update(slotDoc.ref, {
            enrolledStudents: [],
            updatedAt: Timestamp.now()
        });
    });

    // Reiniciar contadores
    batch.set(metadataRef, {
        students: 0,
        activeStudents: 0
    });

    await batch.commit();
}

export const importService = {
    parseExcelFile,
    applyAutoFixes,
    transformRow,
    transformAllRows,
    importStudents,
    deleteAllStudents,
    TURNO_MAP,
    CATEGORIA_MAP,
};



