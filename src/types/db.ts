export type Role = 'ADMIN' | 'ASSISTANT';
export type PaymentMethod = 'YAPE' | 'CASH';
export type PaymentType = 'FULL' | 'PARTIAL';
export type DebtStatus = 'PENDING' | 'PAID' | 'CANCELLED';
export type StudentCategory = 'Niños' | 'Adolescentes' | 'Adultos';

// --- GRUPO A: CONFIGURACIÓN MAESTRA ---
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
}

// --- GRUPO B: OPERACIÓN DIARIA ---
export interface SlotLock {
    studentId: string;
    tempName?: string; // For walk-ins or unconfirmed users
    expiresAt: number; // Timestamp ms
}

export interface DailySlot {
    id: string; // "2025-01-20_10-11"
    date: string; // "2025-01-20"
    timeId: string; // "10-11"
    capacity: number;
    attendeeIds: string[]; // Array of student IDs
    locks: SlotLock[];
}

// --- GRUPO C: ENTIDADES DE NEGOCIO ---
export interface Student {
    id: string; // DNI
    fullName: string;
    dni: string;
    phone: string;
    active: boolean;
    remainingCredits: number;
    hasDebt: boolean;
    fixedSchedule: Array<{ dayId: string; timeId: string }>; // Array of slots ID: "LUN_07-08" or object
    category: StudentCategory;
    email?: string; // Optional context
    createdAt: number; // Timestamp
    birthDate: string; // YYYY-MM-DD
    age?: number; // Manual age override
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
    slotId: string; // The service/slot associated
    amountTotal: number;
    amountPaid: number;
    balance: number;
    dueDate: number; // Timestamp
    status: DebtStatus;
}

export interface AttendanceLog {
    id: string;
    studentId: string;
    slotId: string; // Ref to DailySlot
    timestamp: number;
    checkedBy: string; // User UID
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
