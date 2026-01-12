import { useState, useEffect, useCallback } from 'react';
import { studentService } from '../services/students';
import type { Student } from '../types/db';

const CACHE_KEY = 'los_parrales_students_cache';
const CACHE_TIME_KEY = 'los_parrales_students_cache_time';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

// Load initial state from localStorage if available
let initialCached: Student[] = [];
let initialLastFetch = 0;

try {
    const stored = localStorage.getItem(CACHE_KEY);
    const storedTime = localStorage.getItem(CACHE_TIME_KEY);
    if (stored && storedTime) {
        initialCached = JSON.parse(stored);
        initialLastFetch = parseInt(storedTime, 10);
    }
} catch (e) {
    console.warn('Error loading students from localStorage', e);
}

let cachedStudents: Student[] = initialCached;
let lastFetch = initialLastFetch;
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

            // Persist to localStorage
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(CACHE_TIME_KEY, now.toString());

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
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
    }, []);

    // Cargar al montar
    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);

    const updateStudents = useCallback((newData: Student[] | ((prev: Student[]) => Student[])) => {
        setStudents(prev => {
            const resolved = typeof newData === 'function' ? newData(prev) : newData;
            cachedStudents = resolved;
            localStorage.setItem(CACHE_KEY, JSON.stringify(resolved));
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
