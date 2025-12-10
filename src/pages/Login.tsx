
import { useNavigate } from 'react-router-dom';

export default function Login() {
    const navigate = useNavigate();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // TODO: Implement Auth
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-sky-500 p-8 text-center">
                    <h1 className="text-3xl font-bold text-white mb-2">Los Parrales</h1>
                    <p className="text-sky-100">Academia de Natación</p>
                </div>

                <div className="p-8">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Correo Electrónico</label>
                            <input type="email" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all" placeholder="admin@losparrales.com" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
                            <input type="password" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all" placeholder="••••••••" />
                        </div>
                        <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-[1.02]">
                            Iniciar Sesión
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
