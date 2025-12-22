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

// New Season Management System
export interface Season {
    id: string;
    name: string; // "Verano 2026"
    type: SeasonType;
    startDate: Date;
    endDate: Date;
    workingHours: {
        start: string; // "06:00"
        end: string; // "21:30"
    };
    isActive: boolean;
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

// --- GRUPO B: OPERACIÓN DIARIA ---
export interface SlotLock {
    studentId: string;
    tempName?: string; // For walk-ins or unconfirmed users
    expiresAt: number; // Timestamp ms
}

export interface DailySlot {
    id: string; // "2025-01-20_10-11"
    date: string | Date; // "2025-01-20" or Date object
    timeId: string; // "10-11"
    dayType?: DayType; // "lun-mier-vier", "mar-juev", "sab-dom" (from schedule template)
    scheduleTemplateId?: string; // Reference to ScheduleTemplate (new system)
    seasonId?: string; // Reference to Season (new system)
    categoryId?: string; // Reference to Category (new system)
    timeSlot?: string; // "06:00-07:00" (new system)
    capacity: number;
    attendeeIds: string[]; // Array of student IDs
    locks: SlotLock[];
    isBreak?: boolean; // For rest periods
    createdAt?: Date;
    updatedAt?: Date;
}

// --- GRUPO C: ENTIDADES DE NEGOCIO ---
export interface PackageHistory {
    packageId: string;
    startDate: Date;
    endDate: Date;
    classesRemaining: number;
    classesTotal: number;
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

export type UserRole = 'ADMIN' | 'USER';

export interface UserProfile {
    uid: string;
    email: string;
    role: UserRole;
    displayName?: string;
}
