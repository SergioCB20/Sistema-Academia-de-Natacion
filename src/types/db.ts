export type Role = 'ADMIN' | 'ASSISTANT';
export type PaymentMethod = string; // Dynamic IDs like 'CASH', 'YAPE', 'TRANS_BCP'
export interface PaymentMethodConfig {
    id: string;
    name: string;
    isActive: boolean;
    createdAt: number;
}
export type PaymentType = 'FULL' | 'PARTIAL';
export type DebtStatus = 'PENDING' | 'PAID' | 'CANCELLED';
export type StudentCategory = 'Aquabebe' | '4 a 6' | '7 a 10' | '11 a 15' | '16 a más' | 'Adultos';
export type SeasonType = 'summer' | 'winter';
export type DayType = 'lun-mier-vier' | 'mar-juev' | 'sab-dom';

// --- GRUPO A: CONFIGURACIÓN MAESTRA ---

// New Season Management System (Monthly-based)
export interface Season {
    id: string;
    name: string; // "Verano 2026"
    type: SeasonType;
    startMonth: string; // "2026-01" formato YYYY-MM
    endMonth: string;   // "2026-02" formato YYYY-MM
    workingHours: {
        start: string; // "06:00"
        end: string; // "21:30"
    };
    isActive: boolean;
    startDate: string; // "YYYY-MM-DD" (Calculated)
    endDate: string; // "YYYY-MM-DD" (Calculated)
    createdAt: Date;
    updatedAt: Date;
}

export interface Category {
    id: string;
    name: string; // "Aquabebe", "4 a 6 años", etc.
    ageRange: {
        min: number;
        max: number;
    };
    description?: string; // "1 año o 3 años"
    color?: string; // For UI badges
    order: number; // Display order
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Package {
    id: string;
    seasonId: string; // Reference to Season
    name: string; // "8 clases x mes"
    classesPerMonth: number; // 8, 12, 16, 24
    duration: number; // 1 or 2 months
    price: number;
    scheduleTypes: DayType[]; // ["lun-mier-vier", "mar-juev"]
    applicableCategories: string[]; // Category IDs or ["all"]
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ScheduleTemplate {
    id: string;
    seasonId: string;
    dayType: DayType;
    timeSlot: string; // "06:00-07:00"
    categoryId: string; // Reference to Category
    capacity: number;
    isBreak: boolean; // For rest periods like 2:00-2:30
    createdAt: Date;
    updatedAt: Date;
}

// --- MONTHLY SCHEDULE SYSTEM ---

export interface MonthlySlot {
    id: string; // "2026-01_06:00-07:00_lun-mier-vier"
    seasonId: string;
    month: string; // "2026-01" formato YYYY-MM
    scheduleTemplateId: string;
    dayType: DayType;
    timeSlot: string; // "06:00-07:00"
    categoryId: string;
    capacity: number;
    enrolledStudents: MonthlyEnrollment[]; // Alumnos inscritos en este horario mensual
    isBreak: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface MonthlyEnrollment {
    studentId: string;
    studentName: string; // Snapshot para historial
    enrolledAt: Date; // Cuándo se inscribió
    endsAt: Date; // Cuándo termina su paquete (packageEndDate)
    creditsAllocated: number; // Cuántos créditos se asignaron para este mes
    attendanceRecord?: AttendanceDay[]; // Registro de asistencia opcional
}

export interface AttendanceDay {
    date: string; // "2026-01-15"
    attended: boolean;
    markedBy?: string; // UID del usuario que marcó
    markedAt?: Date;
}

// Legacy interfaces (keep for backward compatibility if needed)
export interface ScheduleSeason {
    id: string; // e.g., "verano-2026"
    name: string; // "Verano 2026"
    startDate: string; // ISO Date YYYY-MM-DD
    endDate: string; // ISO Date YYYY-MM-DD
    active: boolean;
}

export interface DayCatalog {
    id: string; // "LUN"
    name: string; // "Lunes"
    order: number; // 1
}

export interface HourCatalog {
    id: string; // "06-07"
    label: string; // "06:00 - 07:00"
    defaultCapacity: number;
}

export interface ScheduleRule {
    id: string; // "06-07_LUN-MIE-VIE"
    timeId: string; // "06-07"
    dayIds: string[]; // ["LUN", "MIE", "VIE"]
    capacity: number;
    allowedAges: number[]; // [16, 17, ...]
}



// --- GRUPO C: ENTIDADES DE NEGOCIO ---
export interface PackageHistory {
    packageId: string;
    startDate: Date;
    endDate: Date;
    classesRemaining: number;
    classesTotal: number;
}

export interface AttendanceRecord {
    fecha: string; // YYYY-MM-DD format
    asistencia: boolean; // true = attended, false = absent
}

export interface Student {
    id: string; // DNI or generated ID
    fullName: string;
    dni: string; // Can be empty string if not provided
    phone: string; // Can be empty string if not provided
    active: boolean;
    remainingCredits: number;
    hasDebt: boolean;
    fixedSchedule: Array<{ dayId: string; timeId: string }>; // Array of slots ID: "LUN_07-08" or object
    category?: StudentCategory; // Legacy field (optional for migration)
    categoryId: string; // Reference to Category (new system - required)
    seasonId?: string; // Reference to the Season the student belongs to
    currentPackageId?: string | null; // Reference to current Package
    packageStartDate?: string | null; // YYYY-MM-DD - when package started
    packageEndDate?: string | null; // YYYY-MM-DD - when package ends
    packageHistory?: PackageHistory[]; // History of packages
    email?: string; // Optional context
    createdAt: number; // Timestamp
    birthDate?: string | null; // YYYY-MM-DD (optional)
    age?: number | null; // Manual age override
    studentCode?: string; // Auto-incremental code e.g. "00001"
    observations?: string; // Additional notes
    asistencia?: AttendanceRecord[]; // Attendance history tracking
}

export interface AppUser {
    uid: string;
    email: string;
    role: Role;
    displayName: string;
}

// --- GRUPO D: FINANZAS Y AUDITORÍA ---
export interface Payment {
    id: string;
    studentId: string;
    studentName?: string; // Snapshot for history
    studentDni?: string; // Snapshot for history
    amount: number;
    method: PaymentMethod;
    type: PaymentType;
    credits: number; // How many credits this payment added (if PACK)
    seasonId?: string; // Reference to Season
    date: number; // Timestamp
    createdBy: string; // User UID
}

export interface Debt {
    id: string;
    studentId: string;
    studentName?: string; // Snapshot for history
    studentDni?: string; // Snapshot for history
    slotId: string; // The service/slot associated
    amountTotal: number;
    amountPaid: number;
    balance: number;
    dueDate: number; // Timestamp
    status: DebtStatus;
}



export type LogType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface SystemLog {
    id: string;
    text: string;
    type: LogType;
    timestamp: number;
    metadata?: any;
}

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'STAFF';

export interface UserProfile {
    uid: string;
    email: string;
    role: UserRole;
    displayName?: string;
}

// Metadata for counters (to avoid counting all docs)
export interface MetadataCounters {
    students: number;
    activeStudents: number; // Count of active students only
    lastUpdated: Date;
}

// --- CARD CONFIGURATION ---
export interface CardFieldConfig {
    top?: string;    // e.g., "20mm"
    bottom?: string; // e.g., "10mm"
    left?: string;   // e.g., "15mm"
    right?: string;  // e.g., "25mm"
    fontSize: string; // e.g., "8pt"
}

export interface CardConfig {
    id: string;
    width: string;  // e.g., "99mm"
    height: string; // e.g., "69mm"
    printMargins: {
        top: string;    // e.g., "0mm"
        right: string;  // e.g., "45mm"
        bottom: string; // e.g., "0mm"
        left: string;   // e.g., "58mm"
    };
    fields: {
        nombre: CardFieldConfig;
        codigo: CardFieldConfig;
        edad: CardFieldConfig;
        categoria: CardFieldConfig;
        horarioTime: CardFieldConfig;
        horarioDays: CardFieldConfig;
        fechaInicio: CardFieldConfig;
        fechaFinal: CardFieldConfig;
        clases: CardFieldConfig;
    };
    createdAt: number;
    updatedAt: number;
}

