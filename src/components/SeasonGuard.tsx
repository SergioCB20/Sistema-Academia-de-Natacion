import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSeason } from '../contexts/SeasonContext';

interface SeasonGuardProps {
    children: React.ReactNode;
}

export const SeasonGuard: React.FC<SeasonGuardProps> = ({ children }) => {
    const { currentSeason, isLoading, needsSeasonSetup } = useSeason();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 text-lg">Cargando temporada...</p>
                </div>
            </div>
        );
    }

    if (needsSeasonSetup && !currentSeason) {
        // Redirect to season setup wizard
        return <Navigate to="/setup/season" replace />;
    }

    return <>{children}</>;
};
