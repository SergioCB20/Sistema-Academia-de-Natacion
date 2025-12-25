import React, { useState, useEffect } from 'react';
import { useSeason } from '../../contexts/SeasonContext';
import { seasonService } from '../../services/seasonService';
import type { Season } from '../../types/db';

interface SeasonSelectorProps {
    className?: string;
}

export const SeasonSelector: React.FC<SeasonSelectorProps> = ({ className = '' }) => {
    const { currentSeason, setCurrentSeason, refreshSeason } = useSeason();
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadSeasons();
    }, []);

    const loadSeasons = async () => {
        try {
            const allSeasons = await seasonService.getAll();
            setSeasons(allSeasons);
        } catch (error) {
            console.error('Error loading seasons:', error);
        }
    };

    const handleSeasonChange = async (season: Season) => {
        try {
            setIsLoading(true);
            await seasonService.setActiveSeason(season.id);
            setCurrentSeason(season);
            await refreshSeason();
            setIsOpen(false);
        } catch (error) {
            console.error('Error changing season:', error);
            alert('Error al cambiar temporada');
        } finally {
            setIsLoading(false);
        }
    };

    if (!currentSeason) {
        return null;
    }

    const badgeColor = currentSeason.type === 'summer'
        ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
        : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${badgeColor}`}
                disabled={isLoading}
            >
                <span className="text-sm">
                    {currentSeason.type === 'summer' ? '☀️' : '❄️'}
                </span>
                <span className="text-sm font-medium">{currentSeason.name}</span>
                <svg
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                        <div className="p-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase px-3 py-2">
                                Cambiar Temporada
                            </div>
                            {seasons.map((season) => (
                                <button
                                    key={season.id}
                                    onClick={() => handleSeasonChange(season)}
                                    disabled={isLoading || season.id === currentSeason.id}
                                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${season.id === currentSeason.id
                                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                                        : 'hover:bg-gray-100 text-gray-700'
                                        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{season.type === 'summer' ? '☀️' : '❄️'}</span>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">{season.name}</div>
                                            <div className="text-xs text-gray-500">
                                                {new Date(season.startMonth + '-02').toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })} - {new Date(season.endMonth + '-02').toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}
                                            </div>
                                        </div>
                                        {season.id === currentSeason.id && (
                                            <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
