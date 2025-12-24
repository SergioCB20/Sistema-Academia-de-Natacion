import { Package, DayType } from '../types/db';
import { packageService } from './packageService';
import { seasonService } from './seasonService';

/**
 * Service for validating package selection and availability
 */
export const packageValidationService = {
    /**
     * Get number of classes per week for a given dayType
     */
    getClassesPerWeek(dayType: DayType): number {
        const classesPerWeekMap: Record<DayType, number> = {
            'lun-mier-vier': 3,
            'mar-juev': 2,
            'sab-dom': 2
        };
        return classesPerWeekMap[dayType];
    },

    /**
     * Calculate the estimated end date for a package
     */
    calculatePackageEndDate(
        startDate: Date,
        packageData: Package,
        classesPerWeek: number
    ): Date {
        const totalClasses = packageData.classesPerMonth * packageData.duration;
        const weeksNeeded = Math.ceil(totalClasses / (classesPerWeek || 1));
        const daysNeeded = weeksNeeded * 7;

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + daysNeeded);
        return endDate;
    },

    /**
     * Calculate the precise end date based on actual class days
     */
    calculatePreciseEndDate(
        startDate: Date,
        totalClasses: number,
        selectedDays: string[] // ['LUN', 'MIE', 'VIE']
    ): Date {
        if (totalClasses <= 0 || selectedDays.length === 0) return startDate;

        const dayMap: Record<string, number> = {
            'DOM': 0, 'LUN': 1, 'MAR': 2, 'MIE': 3, 'JUE': 4, 'VIE': 5, 'SAB': 6
        };

        const targetDays = selectedDays.map(d => dayMap[d.toUpperCase()]).filter(d => d !== undefined);
        if (targetDays.length === 0) return startDate;

        let currentDate = new Date(startDate.getTime());
        // Normalizar a medianoche para evitar problemas de zona horaria
        currentDate.setHours(12, 0, 0, 0); // Usar mediodía para evitar saltos por zona horaria al sumar días

        let classesCounted = 0;
        let lastClassDate = new Date(currentDate.getTime());

        // Buscamos las clases
        while (classesCounted < totalClasses) {
            const dayOfWeek = currentDate.getDay();
            if (targetDays.includes(dayOfWeek)) {
                classesCounted++;
                lastClassDate = new Date(currentDate.getTime());
            }

            if (classesCounted < totalClasses) {
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Safety break to prevent infinite loops (max 1 year)
            if (currentDate.getTime() > startDate.getTime() + (365 * 24 * 60 * 60 * 1000)) {
                break;
            }
        }

        return lastClassDate;
    },


    /**
     * Check if a package can be completed before the season end date
     */
    canCompleteBeforeSeasonEnd(
        packageData: Package,
        classesPerWeek: number,
        seasonEndDate: Date,
        startDate: Date = new Date()
    ): boolean {
        const packageEndDate = this.calculatePackageEndDate(startDate, packageData, classesPerWeek);

        return packageEndDate <= seasonEndDate;
    },

    /**
     * Get available packages for a specific category and season
     * Filters by active status and applicable categories
     */
    async getAvailablePackages(
        seasonId: string,
        categoryId: string
    ): Promise<Package[]> {
        try {
            const allPackages = await packageService.getBySeason(seasonId);

            return allPackages.filter(pkg =>
                pkg.isActive &&
                (pkg.applicableCategories.includes(categoryId) ||
                    pkg.applicableCategories.includes('all'))
            );
        } catch (error) {
            console.error('Error getting available packages:', error);
            return [];
        }
    },

    /**
     * Get packages that can be completed before season end
     */
    async getCompletablePackages(
        seasonId: string,
        categoryId: string,
        classesPerWeek: number
    ): Promise<Package[]> {
        try {
            const season = await seasonService.getActiveSeason();
            if (!season) {
                throw new Error('No active season found');
            }

            const availablePackages = await this.getAvailablePackages(seasonId, categoryId);

            // Calculate season end date from endMonth (last day of the month)
            const [year, month] = season.endMonth.split('-').map(Number);
            // creating date with day=0 gives the last day of the previous month
            // so we use month (which is 1-based index from split) directly as the month index (which is 0-based for Date)
            // e.g. "2026-02" -> y=2026, m=2. new Date(2026, 2, 0) -> March 0th -> Feb 28th.
            const seasonEndDate = new Date(year, month, 0);

            return availablePackages.filter(pkg =>
                this.canCompleteBeforeSeasonEnd(pkg, classesPerWeek, seasonEndDate)
            );
        } catch (error) {
            console.error('Error getting completable packages:', error);
            return [];
        }
    },

    /**
     * Calculate the actual number of classes that can be taken before season ends
     */
    calculateActualClasses(
        startDate: Date,
        seasonEndDate: Date,
        dayType: DayType
    ): number {
        const classesPerWeek = this.getClassesPerWeek(dayType);

        // Calculate days available
        const oneDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.round(Math.abs((seasonEndDate.getTime() - startDate.getTime()) / oneDay));
        const weeksAvailable = diffDays / 7;

        // Calculate total classes (floored because you can't have partial classes usually)
        // This is an estimation. For improved accuracy we'd need to check exact days of week.
        // But for this purpose (weeks * classes/week) is a good enough approximation
        // showing slightly less is better than promising more.
        return Math.floor(weeksAvailable * classesPerWeek);
    },

    /**
     * Validate if a package selection is valid
     */
    async validatePackageSelection(
        packageId: string,
        categoryId: string
    ): Promise<{ valid: boolean; error?: string }> {
        try {
            const pkg = await packageService.getById(packageId);
            if (!pkg) {
                return { valid: false, error: 'Paquete no encontrado' };
            }

            if (!pkg.isActive) {
                return { valid: false, error: 'Paquete no está activo' };
            }

            if (!pkg.applicableCategories.includes(categoryId) &&
                !pkg.applicableCategories.includes('all')) {
                return { valid: false, error: 'Paquete no disponible para esta categoría' };
            }

            // Schedule types are now ignored for universal packages
            /*
            if (!pkg.scheduleTypes.includes(dayType)) {
                return { valid: false, error: 'Patrón de horario no disponible para este paquete' };
            }
            */

            const season = await seasonService.getActiveSeason();
            if (!season) {
                return { valid: false, error: 'No hay temporada activa' };
            }

            // For validation purposes, we'd need classesPerWeek here if we wanted to check season end
            // But since this method is legacy and we're moving to flexible, we'll keep it simple for now.

            return { valid: true };
        } catch (error) {
            console.error('Error validating package selection:', error);
            return { valid: false, error: 'Error al validar paquete' };
        }
    },

    /**
     * Calculate new end date when extending a package with additional credits
     */
    calculateExtensionDate(
        currentEndDate: string | null, // YYYY-MM-DD
        creditsToAdd: number,
        selectedDays: string[] // ['LUN', 'MIE', 'VIE']
    ): Date {
        if (creditsToAdd <= 0 || selectedDays.length === 0) {
            return currentEndDate ? new Date(currentEndDate) : new Date();
        }

        const today = new Date();
        // Normalize today to start of day
        today.setHours(0, 0, 0, 0);

        let startDate: Date;

        if (currentEndDate) {
            // Add T12:00:00 to avoid timezone issues when parsing YYYY-MM-DD
            const currentEnd = new Date(currentEndDate + 'T12:00:00');

            // If current end date is in the future, we start calculating AFTER that date
            if (currentEnd >= today) {
                startDate = new Date(currentEnd);
                startDate.setDate(startDate.getDate() + 1); // Start counting from the day AFTER expiry
            } else {
                // If expired, we start from today
                startDate = today;
            }
        } else {
            // No previous end date, start from today
            startDate = today;
        }

        return this.calculatePreciseEndDate(startDate, creditsToAdd, selectedDays);
    }
};
