
import { Search } from 'lucide-react';

export default function IDCard() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-slate-800">Búsqueda de Carnet</h2>
            </div>

            <div className="max-w-xl mx-auto mt-12">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
                    <div className="mx-auto w-16 h-16 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center mb-6">
                        <Search className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Buscar Alumno</h3>
                    <p className="text-slate-500 mb-6">Ingresa el nombre del alumno para ver su carnet digital.</p>

                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Nombre del alumno..."
                            className="w-full pl-4 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
