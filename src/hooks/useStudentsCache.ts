import { useState, useEffect, useCallback } from 'react';
import { studentService } from '../services/students';
import type { Student } from '../types/db';

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos - capacidad en tiempo real, estudiantes optimizados
let cachedStudents: Student[] = [];
let lastFetch = 0;
let isFetching = false;

export function useStudentsCache() {
    const [students, setStudents] = useState<Student[]>(cachedStudents);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchStudents = useCallback(async (force = false) => {
        const now = Date.now();

        // Si el caché es válido y no es forzado, retornar caché
        if (!force && cachedStudents.length > 0 && (now - lastFetch) < CACHE_DURATION) {
            setStudents(cachedStudents);
            return cachedStudents;
        }

        // Evitar múltiples fetches simultáneos
        if (isFetching) return cachedStudents;

        setLoading(true);
        isFetching = true;

        try {
            const data = await studentService.getAllActive();
            cachedStudents = data;
            lastFetch = now;
            setStudents(data);
            setError(null);
            return data;
        } catch (err) {
            setError(err as Error);
            throw err;
        } finally {
            setLoading(false);
            isFetching = false;
        }
    }, []);

    // Invalidar caché (llamar después de crear/editar/eliminar alumno)
    const invalidateCache = useCallback(() => {
        cachedStudents = [];
        lastFetch = 0;
    }, []);

    // Cargar al montar
    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);

    const updateStudents = useCallback((newData: Student[] | ((prev: Student[]) => Student[])) => {
        setStudents(prev => {
            const resolved = typeof newData === 'function' ? newData(prev) : newData;
            cachedStudents = resolved;
            return resolved;
        });
    }, []);

    return {
        students,
        loading,
        error,
        refetch: () => fetchStudents(true),
        invalidateCache,
        setStudents: updateStudents
    };
}
