

export default function Dashboard() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-slate-800">Panel de Control</h2>
                <span className="text-sm text-slate-500">{new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {['Clases Hoy', 'Alumnos Activos', 'Nuevos (Mes)', 'Ingresos (Hoy)'].map((title, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</h3>
                        <p className="text-3xl font-bold text-slate-800 mt-2">--</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center text-slate-400">
                <p>Próximamente: Gráficos y Actividad Reciente</p>
            </div>
        </div>
    );
}
