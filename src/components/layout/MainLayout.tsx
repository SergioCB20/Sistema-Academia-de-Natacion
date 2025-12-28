import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, DollarSign, Menu, LogOut, CreditCard, Settings, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SeasonSelector } from '../season/SeasonSelector';
// import { auth } from '../../lib/firebase';
// import { signOut } from 'firebase/auth'; // Uncomment when auth is fully ready

import { useAuth } from '../../context/AuthContext';

export default function MainLayout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const navigate = useNavigate();
    const { role, logout } = useAuth();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    // Role hierarchy: SUPERADMIN > ADMIN > STAFF
    // SUPERADMIN: Full access (all pages)
    // ADMIN: Horarios, Alumnos, Carnet
    // STAFF: Horarios, Alumnos only

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Panel', roles: ['SUPERADMIN'] },
        { to: '/alumnos', icon: Users, label: 'Alumnos', roles: ['SUPERADMIN', 'ADMIN', 'STAFF'] },
        { to: '/horarios', icon: Calendar, label: 'Horarios', roles: ['SUPERADMIN', 'ADMIN', 'STAFF'] },
        { to: '/caja', icon: DollarSign, label: 'Caja', roles: ['SUPERADMIN'] },
        { to: '/carnet', icon: CreditCard, label: 'Carnet', roles: ['SUPERADMIN', 'ADMIN'] },
    ];

    const adminItems = [
        { to: '/admin/temporadas', icon: Calendar, label: 'Temporadas' },
        { to: '/admin/categorias', icon: Users, label: 'Categorías' },
        { to: '/admin/paquetes', icon: DollarSign, label: 'Paquetes' },
        { to: '/admin/plantillas', icon: Settings, label: 'Plantilla de Horario' },
        { to: '/admin/pagos', icon: Wallet, label: 'Métodos de Pago' },
        { to: '/admin/carnet-config', icon: CreditCard, label: 'Configurar Carnet' },
    ];

    const filteredNavItems = navItems.filter(item =>
        !item.roles || (role && item.roles.includes(role))
    );

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
            {/* Sidebar - Desktop/Tablet */}
            <aside className={cn(
                "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 shadow-xl",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-slate-800 flex justify-center">
                        <img src="/logo.png" alt="Los Parrales" className="h-24 object-contain" />
                    </div>

                    <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                        {filteredNavItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setIsSidebarOpen(false)}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                                        isActive
                                            ? "bg-sky-600 text-white shadow-lg shadow-sky-900/20"
                                            : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                    )
                                }
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="font-medium">{item.label}</span>
                            </NavLink>
                        ))}

                        {/* Admin Section - Only visible to SUPERADMIN */}
                        {role === 'SUPERADMIN' && (
                            <>
                                <div className="pt-4 pb-2 px-4">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                                        Configuración
                                    </p>
                                </div>
                                {adminItems.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setIsSidebarOpen(false)}
                                        className={({ isActive }) =>
                                            cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                                                isActive
                                                    ? "bg-sky-600 text-white shadow-lg shadow-sky-900/20"
                                                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                            )
                                        }
                                    >
                                        <item.icon className="w-5 h-5" />
                                        <span className="font-medium">{item.label}</span>
                                    </NavLink>
                                ))}
                            </>
                        )}
                    </nav>

                    <div className="p-4 border-t border-slate-800">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="font-medium">Cerrar Sesión</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Overlay for mobile/tablet when sidebar is open */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="lg:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm">
                    <img src="/logo.png" alt="Los Parrales" className="h-12 w-auto" />
                    <div className="flex items-center gap-2">
                        <SeasonSelector className="hidden sm:block" />
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                    </div>
                </header>

                {/* Desktop Header with Season Selector */}
                <header className="hidden lg:flex bg-white border-b border-slate-200 px-8 py-4 items-center justify-end shadow-sm">
                    <SeasonSelector />
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto p-4 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
