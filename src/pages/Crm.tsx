import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Globe, Flame, X, MapPin as MapPinIcon, Building2 } from 'lucide-react';
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
    whatsapp_phone: string;
    ai_score: number;
    ai_summary: string;
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
        const fetchLeads = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data, error } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                if (data) setLeads(data as Lead[]);
            } catch (error) {
                console.error('Erro ao buscar leads:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchLeads();
    }, []);

    // Effect to geocode address when modal opens
    useEffect(() => {
        if (!selectedLead || !selectedLead.address) return;

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

        // Small delay to allow modal animation
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
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header do Modal */}
                        <div className="flex items-start justify-between p-6 border-b border-slate-100">
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

                        {/* Corpo do Modal */}
                        <div className="p-6 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-6 mb-8">
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Qualificação IA</p>
                                        <div className="flex items-center gap-2 text-orange-600 font-bold text-lg">
                                            <Flame className="w-5 h-5" />
                                            Score: {selectedLead.ai_score}%
                                        </div>
                                    </div>
                                    {selectedLead.niche && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nicho de Mercado</p>
                                            <p className="text-sm text-slate-800 font-medium">{selectedLead.niche}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Endereço Mapeado</p>
                                        <p className="text-sm text-slate-800 flex items-start gap-2">
                                            <MapPinIcon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                            {selectedLead.address || selectedLead.region || 'Endereço não informado'}
                                        </p>
                                    </div>
                                    {selectedLead.whatsapp_phone && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Contato Direct</p>
                                            <p className="text-sm font-medium text-slate-800">{selectedLead.whatsapp_phone}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {selectedLead.ai_summary && (
                                <div className="mb-8 bg-slate-50 border border-slate-100 rounded-xl p-4">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Resumo da Inteligência</p>
                                    <p className="text-sm text-slate-700 leading-relaxed italic">"{selectedLead.ai_summary}"</p>
                                </div>
                            )}

                            {/* Área do Mapa do Modal */}
                            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden relative">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        <MapPinIcon className="w-4 h-4 text-slate-500" />
                                        Localização Geográfica
                                    </h3>
                                </div>

                                <div className="h-64 w-full relative bg-slate-100 flex items-center justify-center">
                                    {isGeocoding ? (
                                        <div className="flex flex-col items-center text-slate-500">
                                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                                            <p className="text-sm font-medium">Satélite focando no alvo...</p>
                                        </div>
                                    ) : mapCenter ? (
                                        <MapContainer
                                            center={mapCenter}
                                            zoom={15}
                                            className="h-full w-full z-0"
                                            zoomControl={true}
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <Marker position={mapCenter} />
                                            <MapUpdater center={mapCenter} />
                                        </MapContainer>
                                    ) : (
                                        <div className="text-slate-400 text-sm flex flex-col items-center">
                                            <MapPinIcon className="w-8 h-8 mb-2 opacity-30" />
                                            <p>As coordenadas exatas não puderam ser extraídas.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
