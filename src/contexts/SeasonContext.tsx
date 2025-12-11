import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { seasonService } from '../services/seasonService';
import type { Season } from '../types/db';

interface SeasonContextType {
    currentSeason: Season | null;
    isLoading: boolean;
    needsSeasonSetup: boolean;
    setCurrentSeason: (season: Season) => void;
    refreshSeason: () => Promise<void>;
}

const SeasonContext = createContext<SeasonContextType | undefined>(undefined);

interface SeasonProviderProps {
    children: ReactNode;
}

export const SeasonProvider: React.FC<SeasonProviderProps> = ({ children }) => {
    const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [needsSeasonSetup, setNeedsSeasonSetup] = useState(false);

    const loadActiveSeason = async () => {
        try {
            setIsLoading(true);
            const activeSeason = await seasonService.getActiveSeason();

            if (activeSeason) {
                setCurrentSeason(activeSeason);
                setNeedsSeasonSetup(false);
            } else {
                setCurrentSeason(null);
                setNeedsSeasonSetup(true);
            }
        } catch (error) {
            console.error('Error loading active season:', error);
            setNeedsSeasonSetup(true);
        } finally {
            setIsLoading(false);
        }
    };

    const refreshSeason = async () => {
        await loadActiveSeason();
    };

    useEffect(() => {
        loadActiveSeason();
    }, []);

    const value: SeasonContextType = {
        currentSeason,
        isLoading,
        needsSeasonSetup,
        setCurrentSeason,
        refreshSeason
    };

    return (
        <SeasonContext.Provider value={value}>
            {children}
        </SeasonContext.Provider>
    );
};

export const useSeason = (): SeasonContextType => {
    const context = useContext(SeasonContext);
    if (context === undefined) {
        throw new Error('useSeason must be used within a SeasonProvider');
    }
    return context;
};
