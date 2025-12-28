import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { CardConfig, CardFieldConfig } from '../types/db';

const CARD_CONFIG_ID = 'default';

// Default configuration based on physical card dimensions
const getDefaultConfig = (): CardConfig => ({
    id: CARD_CONFIG_ID,
    width: '99mm',
    height: '69mm',
    printMargins: {
        top: '0mm',
        right: '45mm',
        bottom: '0mm',
        left: '58mm'
    },
    fields: {
        nombre: {
            top: '20mm',
            left: '20mm',
            fontSize: '9pt'
        },
        codigo: {
            top: '20mm',
            right: '25mm',
            fontSize: '8pt'
        },
        edad: {
            top: '28mm',
            left: '20mm',
            fontSize: '8pt'
        },
        categoria: {
            top: '35mm',
            left: '20mm',
            fontSize: '8pt'
        },
        horarioTime: {
            top: '42mm',
            left: '20mm',
            fontSize: '8pt'
        },
        horarioDays: {
            top: '48mm',
            left: '20mm',
            fontSize: '8pt'
        },
        fechaInicio: {
            bottom: '20mm',
            left: '20mm',
            fontSize: '7pt'
        },
        fechaFinal: {
            bottom: '20mm',
            left: '50mm',
            fontSize: '7pt'
        },
        clases: {
            bottom: '10mm',
            left: '20mm',
            fontSize: '7pt'
        }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
});

export const cardConfigService = {
    /**
     * Get card configuration from Firestore
     */
    async getConfig(): Promise<CardConfig> {
        try {
            const docRef = doc(db, 'settings', 'cardConfig');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as CardConfig;
            }

            // If no config exists, create and return default
            const defaultConfig = getDefaultConfig();
            await this.saveConfig(defaultConfig);
            return defaultConfig;
        } catch (error) {
            console.error('Error getting card config:', error);
            return getDefaultConfig();
        }
    },

    /**
     * Save card configuration to Firestore
     */
    async saveConfig(config: CardConfig): Promise<void> {
        try {
            const docRef = doc(db, 'settings', 'cardConfig');
            await setDoc(docRef, {
                ...config,
                updatedAt: Date.now()
            });
        } catch (error) {
            console.error('Error saving card config:', error);
            throw error;
        }
    },

    /**
     * Reset configuration to default values
     */
    async resetToDefault(): Promise<CardConfig> {
        const defaultConfig = getDefaultConfig();
        await this.saveConfig(defaultConfig);
        return defaultConfig;
    }
};
