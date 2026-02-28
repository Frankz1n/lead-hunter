import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Camera, Save, Loader2 } from 'lucide-react';

export default function Profile() {
    const { user } = useAuth();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user) return;
            setEmail(user.email || '');

            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('full_name')
                    .eq('id', user.id)
                    .single();

                if (error) throw error;
                if (data && data.full_name) {
                    setFullName(data.full_name);
                }
            } catch (error) {
                console.error("Erro ao carregar perfil:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [user]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setSaving(true);

        try {
            if (!user) throw new Error("Usuário não autenticado");

            const { error } = await supabase
                .from('users')
                .update({ full_name: fullName })
                .eq('id', user.id);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });

            // Auto hide message
            setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Falha ao atualizar o perfil. Tente novamente.' });
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarChange = () => {
        alert("A funcionalidade de upload de imagem será liberada na próxima versão!");
    };

    // Gera iniciais (Ex: "João Silva" -> "JS")
    const getInitials = (name: string) => {
        if (!name) return 'U';
        const parts = name.split(' ').filter(p => p.length > 0);
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return 'U';
    };

    return (
        <div className="max-w-3xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <User className="w-7 h-7 text-blue-600" />
                    Meu Perfil
                </h1>
                <p className="text-slate-500 mt-1">Gerencie suas configurações de conta e informações pessoais.</p>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Lateral Esquerda - Avatar Card */}
                    <div className="md:col-span-1">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center">
                            <div className="relative group cursor-pointer mb-4" onClick={handleAvatarChange}>
                                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl font-bold text-white shadow-md overflow-hidden ring-4 ring-white">
                                    {getInitials(fullName)}
                                </div>
                                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                                <div className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md border border-slate-200 text-blue-600 group-hover:bg-blue-50">
                                    <Camera className="w-4 h-4" />
                                </div>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 text-center">{fullName || 'Usuário Sem Nome'}</h2>
                            <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">Conta Administrador</p>
                        </div>
                    </div>

                    {/* Lateral Direita - Formulário */}
                    <div className="md:col-span-2">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">Detalhes Pessoais</h3>

                            {message && (
                                <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                    {message.text}
                                </div>
                            )}

                            <form onSubmit={handleUpdateProfile} className="space-y-6">
                                <div>
                                    <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-2">Nome Completo</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text"
                                            id="fullName"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Seu nome publico..."
                                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-colors text-slate-900 placeholder:text-slate-400"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">E-mail (Credencial de Login)</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="email"
                                            id="email"
                                            value={email}
                                            disabled
                                            className="w-full pl-10 pr-4 py-3 border border-slate-100 bg-slate-50 rounded-xl text-slate-500 cursor-not-allowed"
                                        />
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500">Para alterar seu e-mail de acesso, entre em contato com o suporte.</p>
                                </div>

                                <div className="pt-4 flex items-center justify-end border-t border-slate-100">
                                    <button
                                        type="submit"
                                        disabled={saving || !fullName.trim()}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl flex items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-75 disabled:cursor-not-allowed"
                                    >
                                        {saving ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Salvando...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-5 h-5" />
                                                Salvar Alterações
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
