import React from 'react';
import { useSeason } from '../../contexts/SeasonContext';
import type { Season } from '../../types/db';

interface SeasonBadgeProps {
    className?: string;
}

export const SeasonBadge: React.FC<SeasonBadgeProps> = ({ className = '' }) => {
    const { currentSeason } = useSeason();

    if (!currentSeason) {
        return null;
    }

    const badgeColor = currentSeason.type === 'summer'
        ? 'bg-orange-100 text-orange-800 border-orange-300'
        : 'bg-blue-100 text-blue-800 border-blue-300';

    const icon = currentSeason.type === 'summer' ? '☀️' : '❄️';

    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${badgeColor} ${className}`}>
            <span className="text-sm">{icon}</span>
            <span className="text-sm font-medium">{currentSeason.name}</span>
        </div>
    );
};
