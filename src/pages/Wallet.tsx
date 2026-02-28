import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Wallet as WalletIcon, Plus, ArrowUpRight, ArrowDownRight, Package, Loader2 } from 'lucide-react';

interface Transaction {
    id: string;
    amount: number;
    transaction_type: 'credit' | 'debit';
    description: string;
    created_at: string;
}

export default function Wallet() {
    const { user } = useAuth();
    const [balance, setBalance] = useState<number | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchWalletData = async () => {
            if (!user) return;
            try {
                // Busca Saldo Atual
                const { data: userData } = await supabase
                    .from('users')
                    .select('credits_balance')
                    .eq('id', user.id)
                    .single();

                if (userData) setBalance(userData.credits_balance);

                // Busca Histórico de Transações
                const { data: txData } = await supabase
                    .from('wallet_transactions')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (txData) setTransactions(txData);

            } catch (error) {
                console.error("Erro ao carregar carteira:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchWalletData();
    }, [user]);

    const handleBuyPackage = () => {
        alert("Integração com gateway de pagamento (Checkout) em breve!");
        setIsModalOpen(false);
    };

    const PackageCard = ({ leads, price, title }: { leads: number, price: string, title: string }) => (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-blue-200 transition-all flex flex-col h-full cursor-pointer relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Package className="w-24 h-24" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-1">{title}</h3>
            <div className="flex items-baseline gap-1 mb-6">
                <span className="text-sm font-medium text-slate-500">R$</span>
                <span className="text-3xl font-black text-slate-900">{price}</span>
            </div>

            <div className="flex-1">
                <p className="text-slate-600 flex items-center gap-2 mb-2 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    {leads.toLocaleString('pt-BR')} Leads IA
                </p>
                <p className="text-slate-500 text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                    Validade Vitalícia
                </p>
            </div>

            <button
                onClick={handleBuyPackage}
                className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-colors relative z-10"
            >
                Comprar Pacote
            </button>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <WalletIcon className="w-7 h-7 text-blue-600" />
                    Minha Carteira
                </h1>
                <p className="text-slate-500 mt-1">Gerencie seus créditos e histórico de varreduras táticas.</p>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Saldo e CTA */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 sm:p-10 shadow-lg text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 opacity-10">
                            <WalletIcon className="w-64 h-64" />
                        </div>

                        <div className="relative z-10">
                            <p className="text-blue-100 font-medium mb-1 uppercase tracking-wide text-sm">Saldo Disponível</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-black tracking-tight">{balance?.toLocaleString('pt-BR') || 0}</span>
                                <span className="text-blue-200 font-medium text-lg">Leads</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="relative z-10 bg-white text-blue-600 hover:bg-blue-50 px-6 py-3.5 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-colors whitespace-nowrap"
                        >
                            <Plus className="w-5 h-5" />
                            Adicionar Créditos
                        </button>
                    </div>

                    {/* Histórico */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 mb-4 px-1">Histórico de Movimentações</h2>

                        {transactions.length === 0 ? (
                            <div className="bg-white border text-center border-slate-200 rounded-2xl p-12 shadow-sm">
                                <p className="text-slate-500">Nenhuma movimentação encontrada na sua carteira.</p>
                            </div>
                        ) : (
                            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                <ul className="divide-y divide-slate-100">
                                    {transactions.map((tx) => (
                                        <li key={tx.id} className="p-4 sm:px-6 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className={`mt-1 p-2 rounded-full shrink-0 ${tx.transaction_type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                                    }`}>
                                                    {tx.transaction_type === 'credit' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-900">{tx.description}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {new Date(tx.created_at).toLocaleDateString('pt-BR')} às {new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`font-bold whitespace-nowrap ${tx.transaction_type === 'credit' ? 'text-green-600' : 'text-slate-900'
                                                }`}>
                                                {tx.transaction_type === 'credit' ? '+' : '-'}{Math.abs(tx.amount)} Leads
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Compra */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-6 bg-white border-b border-slate-200">
                            <h2 className="text-2xl font-bold text-slate-900">Adicionar Créditos</h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-6 md:p-8 overflow-y-auto">
                            <p className="text-slate-600 mb-8 max-w-2xl">Mais créditos significam mais clientes mapeados. Escolha o pacote de leads ideal para a escala da sua operação.</p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <PackageCard title="Starter" leads={500} price="47,00" />
                                <PackageCard title="Pro" leads={2000} price="147,00" />
                                <PackageCard title="Enterprise" leads={5000} price="297,00" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
