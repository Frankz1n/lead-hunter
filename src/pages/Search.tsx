import React, { useState, useEffect } from 'react';
import { Target, MapPin, Zap, Settings2, Loader2 } from 'lucide-react';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import 'leaflet/dist/leaflet.css';

// Componente para atualizar o centro do mapa dinamicamente
function MapUpdater({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo(center, map.getZoom());
    }, [center, map]);
    return null;
}

export default function Search() {
    // Coluna Esquerda: Parâmetros de Varredura
    const [aiPrompt, setAiPrompt] = useState('');
    const [keywords, setKeywords] = useState('');
    const [requireNoWebsite, setRequireNoWebsite] = useState(false);
    const [requirePhone, setRequirePhone] = useState(false);
    const [ignoreFranchises, setIgnoreFranchises] = useState(false);
    const [leadVolume, setLeadVolume] = useState(150);

    // Coluna Direita: Mapa / Target
    const [targetRegion, setTargetRegion] = useState('');
    const [searchRadius, setSearchRadius] = useState(15);
    const [mapCenter, setMapCenter] = useState<[number, number]>([-23.5505, -46.6333]); // SP Default

    const [isScanning, setIsScanning] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const navigate = useNavigate();

    // Efeito para Geocoding Gratuito usando Nominatim API
    useEffect(() => {
        if (!targetRegion) return;

        const timeoutId = setTimeout(async () => {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(targetRegion)}`);
                const data = await response.json();
                if (data && data.length > 0) {
                    setMapCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
                }
            } catch (error) {
                // Falha silenciosa para geocoding
            }
        }, 1000); // 1s debounce

        return () => clearTimeout(timeoutId);
    }, [targetRegion]);

    const handleHunt = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsScanning(true);
        setErrorMessage(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                setErrorMessage('Sessão expirada. Por favor, faça login novamente.');
                setIsScanning(false);
                return;
            }

            const { data, error } = await supabase.functions.invoke('hunt-leads', {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: {
                    leadVolume: Number(leadVolume),
                    region: targetRegion,
                    keywords,
                    requireNoWebsite,
                    requirePhone,
                    ignoreFranchises,
                    aiPrompt
                }
            });

            if (error) {
                throw new Error(error.message);
            }
            if (data?.error) {
                throw new Error(data.error);
            }

            // Sucesso! Redirecionar para o CRM/Dashboard
            navigate('/dashboard');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro desconhecido ao disparar a varredura. Verifique seu saldo de créditos.';
            setErrorMessage(message);
        } finally {
            setIsScanning(false);
        }
    };

    // Switch Toggle Helper Component (Estilo iOS)
    const ToggleSwitch = ({ checked, onChange, label }: { checked: boolean, onChange: () => void, label: string }) => (
        <div className="flex items-center justify-between py-3 border-b last:border-0 border-slate-100">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={onChange}
                className={`${checked ? 'bg-blue-600' : 'bg-slate-200'
                    } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2`}
            >
                <span
                    aria-hidden="true"
                    className={`${checked ? 'translate-x-5' : 'translate-x-0'
                        } inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
            </button>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                    <Target className="w-8 h-8 text-blue-600" />
                    Sniper de Leads
                </h1>
                <p className="text-slate-500 mt-2">Configure o radar da inteligência artificial para extrair os melhores clientes da sua região-alvo.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* COLUNA ESQUERDA: PARÂMETROS */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-100">
                        <Settings2 className="w-5 h-5 text-slate-400" />
                        <h2 className="text-lg font-semibold text-slate-900">Parâmetros da Varredura</h2>
                    </div>

                    <form onSubmit={handleHunt} className="space-y-6">
                        {errorMessage && (
                            <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                                {errorMessage}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Prompt da IA (Cliente Ideal)</label>
                            <textarea
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="Ex: Quero padarias de bairro que pareçam ter dono único, focadas em pães artesanais, que não pareçam ser franquias grandes..."
                                className="w-full h-28 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-colors text-sm text-slate-900 placeholder:text-slate-400 resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Nicho / Palavras-chave</label>
                            <input
                                type="text"
                                value={keywords}
                                onChange={(e) => setKeywords(e.target.value)}
                                placeholder="Ex: Oficinas Mecânicas, Clínicas Odontológicas..."
                                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-colors text-sm text-slate-900 placeholder:text-slate-400"
                            />
                        </div>

                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Qualificação Forçada</h3>
                            <div className="flex flex-col">
                                <ToggleSwitch checked={requireNoWebsite} onChange={() => setRequireNoWebsite(!requireNoWebsite)} label="Apenas negócios SEM site ativo" />
                                <ToggleSwitch checked={requirePhone} onChange={() => setRequirePhone(!requirePhone)} label="Exigir número de WhatsApp fornecido" />
                                <ToggleSwitch checked={ignoreFranchises} onChange={() => setIgnoreFranchises(!ignoreFranchises)} label="Ignorar grandes Redes e Franquias" />
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className="flex justify-between items-end mb-3">
                                <label className="block text-sm font-medium text-slate-700">Volume de Leads</label>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                    {leadVolume} Leads
                                </span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="500"
                                step="10"
                                value={leadVolume}
                                onChange={(e) => setLeadVolume(Number(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                            />
                            <div className="flex justify-between text-xs text-slate-400 mt-2 px-1">
                                <span>10</span>
                                <span>250</span>
                                <span>500</span>
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={isScanning}
                                className="w-full h-12 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-75 disabled:cursor-not-allowed"
                            >
                                {isScanning ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Mapeando alvo...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-5 h-5" />
                                        Disparar Varredura (Gastar {leadVolume} Créditos)
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* COLUNA DIREITA: VISUALIZAÇÃO DO MAPA */}
                <div className="bg-white flex flex-col p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row gap-4 mb-6 pb-6 border-b border-slate-100">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Região Alvo</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <MapPin className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    value={targetRegion}
                                    onChange={(e) => setTargetRegion(e.target.value)}
                                    placeholder="Ex: São Paulo, SP"
                                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-colors text-sm text-slate-900 placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        <div className="sm:w-48">
                            <label className="flex justify-between text-sm font-medium text-slate-700 mb-2">
                                <span>Raio da Busca</span>
                                <span className="text-blue-600 font-bold">{searchRadius}km</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="50"
                                value={searchRadius}
                                onChange={(e) => setSearchRadius(Number(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none mt-2"
                            />
                        </div>
                    </div>

                    {/* Mapa Interativo (Leaflet) */}
                    <div className="flex-1 min-h-[300px] bg-slate-50 rounded-xl border border-slate-200 relative overflow-hidden flex items-center justify-center z-0">
                        <MapContainer
                            center={mapCenter}
                            zoom={12}
                            className="h-full w-full"
                            zoomControl={false}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <Circle
                                center={mapCenter}
                                radius={searchRadius * 1000}
                                pathOptions={{ color: '#4169E1', fillColor: '#4169E1', fillOpacity: 0.2 }}
                            />
                            <MapUpdater center={mapCenter} />
                        </MapContainer>

                        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm z-[1000]">
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Preview de Varredura</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
