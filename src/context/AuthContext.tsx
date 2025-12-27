import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserRole } from '../types/db';

interface AuthContextType {
    user: User | null;
    role: UserRole | null;
    loading: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: null,
    loading: true,
    logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user);

            if (user) {
                try {
                    const userRef = doc(db, 'users', user.uid);
                    const snap = await getDoc(userRef);
                    if (snap.exists()) {
                        setRole(snap.data().role as UserRole);
                    } else {
                        // Create default user profile if not exists
                        // IMPORTANT: For first admin, we might need to manually set in DB, 
                        // or checking a specific email.
                        // For now, default to STAFF (lowest access).
                        const newRole: UserRole = 'STAFF';
                        await setDoc(userRef, {
                            uid: user.uid,
                            email: user.email,
                            role: newRole,
                            displayName: user.displayName
                        });
                        setRole(newRole);
                    }
                } catch (error) {
                    console.error("Error fetching user role:", error);
                    setRole('STAFF');
                }
            } else {
                setRole(null);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const logout = async () => {
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, role, loading, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
