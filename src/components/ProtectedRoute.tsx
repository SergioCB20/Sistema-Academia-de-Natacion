import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
    children: React.ReactNode;
    allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
    const { user, role, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
        // Redirect based on user's role to their allowed default page
        // SUPERADMIN -> Panel (/)
        // ADMIN -> Horarios (/horarios) 
        // STAFF -> Horarios (/horarios)
        const defaultPages: Record<string, string> = {
            'SUPERADMIN': '/',
            'ADMIN': '/horarios',
            'STAFF': '/horarios'
        };
        const redirectTo = defaultPages[role] || '/horarios';
        return <Navigate to={redirectTo} replace />;
    }

    return <>{children}</>;
}
