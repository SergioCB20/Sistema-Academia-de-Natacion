export type RolUsuario = 'ADMIN' | 'ASISTENTE';

export interface Usuario {
  uid: string;
  email: string;
  rol: RolUsuario;
  nombre: string;
}

export interface Alumno {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  saldo_clases: number;
  estado: 'ACTIVO' | 'ARCHIVADO';
  fecha_nacimiento?: string;
}

export interface Horario {
  id: string;
  dia: string;
  hora: string;
  capacidad: number;
  inscritos: number;
  reservas_temporales: number;
}

export interface Pago {
  id?: string;
  monto: number;
  metodo: 'YAPE' | 'EFECTIVO' | 'POS';
  fecha: Date;
  alumnoId: string;
}