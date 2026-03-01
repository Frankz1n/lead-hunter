import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Globe, Flame, X, MapPin as MapPinIcon, Building2, Zap } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icons (known issue with react-leaflet)
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Types
interface Lead {
    id: string;
    company_name: string;
    address: string;
    region?: string;
    niche: string;
    no_website: boolean;
    website?: string;
    phone?: string;
    whatsapp_phone?: string;
    reviews_count?: number;
    latitude?: number;
    longitude?: number;
    ai_score: number;
    ai_summary?: string;
    ai_reason?: string;
    status: string;
    created_at: string;
}

// Map Updater Component for the Modal
function MapUpdater({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, 15);
    }, [center, map]);
    return null;
}

export default function Crm() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

    // Modal Map States
    const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
    const [isGeocoding, setIsGeocoding] = useState(false);

    useEffect(() => {
        let subscription: any = null;

        const fetchLeadsAndSubscribe = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // 1. Fetch initial leads
                const { data, error } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                if (data) setLeads(data as unknown as Lead[]);

                // 2. Subscribe to new leads
                subscription = supabase
                    .channel('public:leads')
                    .on(
                        'postgres_changes',
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'leads',
                            filter: `user_id=eq.${user.id}`
                        },
                        (payload) => {
                            console.log('Novo lead recebido em tempo real:', payload.new);
                            setLeads((currentLeads) => [payload.new as unknown as Lead, ...currentLeads]);
                        }
                    )
                    .subscribe();

            } catch (error) {
                console.error('Erro ao buscar leads:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchLeadsAndSubscribe();

        // Cleanup
        return () => {
            if (subscription) {
                supabase.removeChannel(subscription);
            }
        };
    }, []);

    // Chat State for AI Assistant
    const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: 'Olá! Sou seu assistente de IA. Como posso ajudar com este lead?' }
    ]);
    const [chatInput, setChatInput] = useState('');

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        setChatMessages([...chatMessages, { role: 'user', content: chatInput }]);
        setChatInput('');
        // NOTE: future API call to OpenAI goes here
    };

    // Effect to geocode address when modal opens (only if lat/lng are missing)
    useEffect(() => {
        if (!selectedLead) return;

        // Reset states when opening a new lead
        setActiveTab('details');
        setChatMessages([{ role: 'assistant', content: `Olá! Sou seu assistente de IA. Como posso ajudar a fechar com a ${selectedLead.company_name}?` }]);

        if (selectedLead.latitude && selectedLead.longitude) {
            setMapCenter([selectedLead.latitude, selectedLead.longitude]);
            setIsGeocoding(false);
            return;
        }

        if (!selectedLead.address) {
            setMapCenter(null);
            setIsGeocoding(false);
            return;
        }

        let isMounted = true;

        const geocodeAddress = async () => {
            setIsGeocoding(true);
            setMapCenter(null);
            try {
                const q = encodeURIComponent(selectedLead.address);
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}`);
                const data = await response.json();

                if (data && data.length > 0 && isMounted) {
                    setMapCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
                }
            } catch (error) {
                console.error("Geocoding failed for lead:", error);
            } finally {
                if (isMounted) setIsGeocoding(false);
            }
        };

        const timeout = setTimeout(geocodeAddress, 300);
        return () => {
            isMounted = false;
            clearTimeout(timeout);
        };
    }, [selectedLead]);

    // Kanban Columns
    const novosLeads = leads.filter(l => l.status === 'Novos Leads' || !l.status);
    const emContato = leads.filter(l => l.status === 'Em Contato');
    const reuniaoAgendada = leads.filter(l => l.status === 'Reunião Agendada');

    const LeadCard = ({ lead }: { lead: Lead }) => (
        <div
            onClick={() => setSelectedLead(lead)}
            className="bg-white shadow-sm rounded-md p-4 cursor-pointer hover:shadow-md transition-shadow border border-slate-200"
        >
            <h3 className="text-slate-900 font-bold text-sm mb-3 line-clamp-2">{lead.company_name}</h3>

            <div className="flex flex-wrap gap-2">
                {lead.no_website && (
                    <div className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                        <Globe className="w-3 h-3" />
                        <span>Sem Site</span>
                    </div>
                )}
                <div className="inline-flex items-center gap-1 bg-orange-50 text-orange-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                    <Flame className="w-3 h-3" />
                    <span>Score IA: {lead.ai_score}%</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-full bg-slate-50 p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pipeline de Vendas</h1>
                <p className="text-slate-500 mt-1 text-sm">Gerencie seus leads mapeados pela IA e acompanhe as conversões.</p>
            </div>

            {loading ? (
                <div className="flex justify-center py-12 text-slate-500">
                    <div className="animate-pulse space-y-4 w-full max-w-4xl">
                        <div className="h-10 bg-slate-200 rounded w-1/4"></div>
                        <div className="flex gap-6">
                            <div className="flex-1 h-64 bg-slate-200 rounded-lg"></div>
                            <div className="flex-1 h-64 bg-slate-200 rounded-lg"></div>
                            <div className="flex-1 h-64 bg-slate-200 rounded-lg"></div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row items-start gap-6 overflow-x-auto pb-4">
                    {/* Coluna 1: Novos Leads */}
                    <div className="flex-1 min-w-[320px] bg-slate-100/50 rounded-xl p-4 border border-slate-200/60">
                        <div className="flex items-center justify-between mb-4 px-1">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Novos Leads</h2>
                            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{novosLeads.length}</span>
                        </div>
                        <div className="space-y-3">
                            {novosLeads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
                            {novosLeads.length === 0 && (
                                <div className="text-center py-8 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">Nenhum lead novo.</div>
                            )}
                        </div>
                    </div>

                    {/* Coluna 2: Em Contato */}
                    <div className="flex-1 min-w-[320px] bg-slate-100/50 rounded-xl p-4 border border-slate-200/60">
                        <div className="flex items-center justify-between mb-4 px-1">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Em Contato</h2>
                            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{emContato.length}</span>
                        </div>
                        <div className="space-y-3">
                            {emContato.map(lead => <LeadCard key={lead.id} lead={lead} />)}
                            {emContato.length === 0 && (
                                <div className="text-center py-8 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">Nenhum lead em contato.</div>
                            )}
                        </div>
                    </div>

                    {/* Coluna 3: Reunião Agendada */}
                    <div className="flex-1 min-w-[320px] bg-slate-100/50 rounded-xl p-4 border border-slate-200/60">
                        <div className="flex items-center justify-between mb-4 px-1">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Reunião Agendada</h2>
                            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{reuniaoAgendada.length}</span>
                        </div>
                        <div className="space-y-3">
                            {reuniaoAgendada.map(lead => <LeadCard key={lead.id} lead={lead} />)}
                            {reuniaoAgendada.length === 0 && (
                                <div className="text-center py-8 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">Nenhuma reunião agendada.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal do Lead */}
            {selectedLead && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col h-[90vh] md:h-[80vh]">
                        {/* Header do Modal */}
                        <div className="flex items-start justify-between p-6 border-b border-slate-100 shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                        {selectedLead.status || 'Novos Leads'}
                                    </span>
                                    {selectedLead.no_website && (
                                        <span className="bg-red-50 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 uppercase tracking-wider">
                                            <Globe className="w-3 h-3" /> Sem Site
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                    <Building2 className="w-6 h-6 text-slate-400" />
                                    {selectedLead.company_name}
                                </h2>
                            </div>
                            <button
                                onClick={() => setSelectedLead(null)}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Corpo do Modal - Grid 2 colunas no LG */}
                        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

                            {/* MENU TABS MOBILE/TABLET */}
                            <div className="lg:hidden flex border-b border-slate-200 shrink-0">
                                <button
                                    onClick={() => setActiveTab('details')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                                >
                                    Detalhes da Empresa
                                </button>
                                <button
                                    onClick={() => setActiveTab('chat')}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <Flame className="w-4 h-4" /> Assistente IA
                                </button>
                            </div>

                            {/* PAINEL ESQUERDO: DETALHES DA EMPRESA (Sempre visível no Desktop) */}
                            <div className={`${activeTab === 'details' ? 'block' : 'hidden'} lg:block lg:w-1/2 p-6 overflow-y-auto border-r border-slate-100`}>

                                {/* SCORE IA EM DESTAQUE */}
                                <div className="mb-8 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-2xl p-6 border border-orange-200/50 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                        <Flame className="w-24 h-24 text-orange-600 rotate-12" />
                                    </div>
                                    <p className="text-xs font-bold text-orange-600/80 uppercase tracking-wider mb-2">Qualificação IA</p>
                                    <div className="flex items-end gap-3 mb-4">
                                        <span className="text-5xl font-black text-orange-600 tracking-tighter leading-none">{selectedLead.ai_score}</span>
                                        <span className="text-xl font-bold text-orange-600/50 mb-1">/ 100</span>
                                    </div>
                                    {selectedLead.ai_reason && (
                                        <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-orange-100">
                                            <p className="text-sm font-medium text-slate-700 leading-relaxed italic relative">
                                                <span className="absolute -left-2 -top-2 text-2xl text-orange-300">"</span>
                                                {selectedLead.ai_reason}
                                                <span className="absolute -bottom-4 text-2xl text-orange-300">"</span>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-6 mb-8">
                                    {(selectedLead.whatsapp_phone || selectedLead.phone) && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Telefone / WhatsApp</p>
                                            <p className="text-sm font-medium text-slate-800">{selectedLead.whatsapp_phone || selectedLead.phone}</p>
                                        </div>
                                    )}
                                    {selectedLead.website && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Website</p>
                                            <a href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline line-clamp-1">
                                                {selectedLead.website}
                                            </a>
                                        </div>
                                    )}
                                    {selectedLead.reviews_count !== undefined && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Avaliações (Google)</p>
                                            <p className="text-sm font-medium text-slate-800">{selectedLead.reviews_count} reviews</p>
                                        </div>
                                    )}
                                    {selectedLead.niche && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nicho</p>
                                            <p className="text-sm text-slate-800 font-medium">{selectedLead.niche}</p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Endereço Mapeado</p>
                                    <p className="text-sm text-slate-800 flex items-start gap-2 mb-4">
                                        <MapPinIcon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                        {selectedLead.address || selectedLead.region || 'Endereço não informado'}
                                    </p>
                                </div>

                                {/* Área do Mapa do Modal */}
                                <div className="border border-slate-200 rounded-xl overflow-hidden relative">
                                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                                        <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1 uppercase tracking-wider">
                                            <MapPinIcon className="w-3 h-3 text-slate-400" />
                                            Localização
                                        </h3>
                                    </div>

                                    <div className="h-48 w-full relative bg-slate-100 flex items-center justify-center">
                                        {isGeocoding ? (
                                            <div className="flex flex-col items-center text-slate-500">
                                                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                                                <p className="text-xs font-medium">Satélite focando no alvo...</p>
                                            </div>
                                        ) : mapCenter ? (
                                            <MapContainer
                                                center={mapCenter}
                                                zoom={15}
                                                className="h-full w-full z-0"
                                                zoomControl={false}
                                            >
                                                <TileLayer
                                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                />
                                                <Marker position={mapCenter} />
                                                <MapUpdater center={mapCenter} />
                                            </MapContainer>
                                        ) : (
                                            <div className="text-slate-400 text-xs flex flex-col items-center">
                                                <MapPinIcon className="w-6 h-6 mb-2 opacity-30" />
                                                <p>As coordenadas exatas não puderam ser extraídas.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* PAINEL DIREITO: ASSISTENTE IA (Sempre visível no Desktop) */}
                            <div className={`${activeTab === 'chat' ? 'flex' : 'hidden'} lg:flex lg:w-1/2 flex-col bg-slate-50 relative`}>
                                <div className="hidden lg:flex items-center gap-2 p-4 bg-white border-b border-slate-100 shrink-0">
                                    <Flame className="w-5 h-5 text-orange-600" />
                                    <h3 className="font-bold text-slate-800">Assistente IA</h3>
                                </div>

                                {/* Messages Area */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.role === 'user'
                                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                                : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
                                                }`}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Input Area */}
                                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                                    <form onSubmit={handleSendMessage} className="relative">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="Pergunte à IA sobre este lead..."
                                            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!chatInput.trim()}
                                            className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                                        >
                                            <Zap className="w-4 h-4" />
                                        </button>
                                    </form>
                                    <p className="text-[10px] text-center text-slate-400 mt-2">IA pode cometer erros. Considere verificar as informações importantes.</p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
