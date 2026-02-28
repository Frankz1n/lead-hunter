import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Search, LogOut, User, Wallet as WalletIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function DashboardLayout() {
    const { signOut, user } = useAuth();
    const navigate = useNavigate();
    const [balance, setBalance] = useState<number | null>(null);

    useEffect(() => {
        const fetchBalance = async () => {
            if (!user) return;
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('credits_balance')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.error("Erro ao buscar saldo:", error.message);
                    return;
                }
                if (data) {
                    setBalance(data.credits_balance);
                }
            } catch (error) {
                console.error("Falha ao puxar saldo:", error);
            }
        };

        fetchBalance();

        // Setup real-time subscription for balance updates
        if (!user) return;

        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'users',
                    filter: `id=eq.${user.id}`
                },
                (payload) => {
                    if (payload.new && typeof payload.new.credits_balance === 'number') {
                        setBalance(payload.new.credits_balance);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    return (
        <div className="flex h-screen bg-slate-50 font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
                <div className="p-6">
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <Search className="w-6 h-6 text-blue-600 bg-blue-100 p-1 rounded-lg" />
                        LeadHunter
                    </h2>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    <NavLink
                        to="/search"
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`
                        }
                    >
                        <Search className="w-5 h-5" />
                        Capturar Leads
                    </NavLink>

                    <NavLink
                        to="/crm"
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`
                        }
                    >
                        <LayoutDashboard className="w-5 h-5" />
                        CRM Kanban
                    </NavLink>

                    <NavLink
                        to="/wallet"
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`
                        }
                    >
                        <WalletIcon className="w-5 h-5" />
                        Carteira
                    </NavLink>
                </nav>

                <div className="p-4 border-t border-slate-200">
                    <button
                        onClick={signOut}
                        className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Sair da Conta
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header (Desktop + Mobile) */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
                    {/* Mobile Branding (Hidden on desktop) */}
                    <div className="flex items-center gap-2 md:hidden">
                        <Search className="w-5 h-5 text-blue-600 bg-blue-100 p-0.5 rounded-md" />
                        <span className="font-bold text-slate-900">LeadHunter</span>
                    </div>

                    <div className="hidden md:block">{/* Spacer left on desktop */}</div>

                    {/* User Profile / Carteira (Right Side) */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-500 font-medium">Saldo:</span>
                            <span className="text-slate-900 font-bold">
                                {balance !== null ? balance.toLocaleString('pt-BR') : '...'} Leads
                            </span>
                        </div>
                        <div
                            onClick={() => navigate('/profile')}
                            className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 border border-slate-200 cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                            title="Meu Perfil"
                        >
                            <User className="w-5 h-5" />
                        </div>
                        {/* Mobile Sair Button */}
                        <button onClick={signOut} className="md:hidden ml-2 text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-4 md:p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
