import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Globe, Flame, X, MapPin as MapPinIcon, Building2, Zap, Trash2, Loader2, Plus, MessageCircle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import toast from 'react-hot-toast';
import L from 'leaflet';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { SortableColumn, SortableLead } from '../components/KanbanBoard';
import ReactMarkdown from 'react-markdown';
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
export interface Lead {
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
    image_url?: string;
    category_name?: string;
    neighborhood?: string;
    chat_history?: { role: 'user' | 'assistant' | 'system', content: string }[];
}

export interface Column {
    id: string;
    title: string;
    order: number;
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
    const [columns, setColumns] = useState<Column[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

    // DnD States
    const [activeColumn, setActiveColumn] = useState<Column | null>(null);
    const [activeLead, setActiveLead] = useState<Lead | null>(null);

    // New Column State
    const [isAddingColumn, setIsAddingColumn] = useState(false);
    const [newColumnTitle, setNewColumnTitle] = useState('');
    const [isSavingColumn, setIsSavingColumn] = useState(false);

    // Modal Map States
    const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteLead = async () => {
        if (!selectedLead) return;

        if (!window.confirm("Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.")) {
            return;
        }

        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('leads')
                .delete()
                .eq('id', selectedLead.id);

            if (error) throw error;

            toast.success('Lead excluído com sucesso!');
            setLeads(leads => leads.filter(l => l.id !== selectedLead.id));
            setSelectedLead(null);
        } catch (error) {
            console.error('Erro ao excluir lead:', error);
            toast.error('Erro ao excluir o lead. Tente novamente.');
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        let subscription: any = null;

        const fetchLeadsAndSubscribe = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // 0. Fetch Kanban Columns
                const { data: colsData, error: colsError } = await supabase
                    .from('kanban_columns')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('order', { ascending: true });

                if (colsError) throw colsError;

                // If user has no columns, the DB trigger might have failed or not run (e.g., existing user)
                // We should ideally have them, but let's set them into state
                setColumns(colsData || []);

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
                    .channel('custom-all-channel')
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
                            toast.success('🎉 Leads fresquinhos chegaram ao seu Kanban!', {
                                duration: 4000,
                                position: 'top-center',
                                style: {
                                    background: '#10B981',
                                    color: '#fff',
                                    fontWeight: 'bold',
                                    borderRadius: '10px'
                                },
                            });
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
    const [isChatLoading, setIsChatLoading] = useState(false);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || isChatLoading || !selectedLead) return;

        const newUserMessage = { role: 'user' as const, content: chatInput };
        const updatedMessages = [...chatMessages, newUserMessage];

        setChatMessages(updatedMessages);
        setChatInput('');
        setIsChatLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke('chat-ai', {
                body: {
                    lead_id: selectedLead.id,
                    lead_data: {
                        nome: selectedLead.company_name,
                        nicho: selectedLead.niche,
                        ai_reason: selectedLead.ai_reason,
                        ai_score: selectedLead.ai_score,
                        reviews: selectedLead.reviews_count
                    },
                    messages: updatedMessages
                }
            });

            if (error) throw error;

            if (data && data.reply) {
                const newAssistantMessage = { role: 'assistant' as const, content: data.reply };
                const finalMessages = [...updatedMessages, newAssistantMessage];

                setChatMessages(finalMessages);

                // Salvar o histórico completo no Supabase
                const { error: updateError } = await supabase
                    .from('leads')
                    .update({ chat_history: finalMessages })
                    .eq('id', selectedLead.id);

                if (updateError) {
                    console.error('Erro ao salvar histórico do chat:', updateError);
                } else {
                    // Atualiza o cache local para não perder o estado se fechar/abrir o modal sem refresh
                    setLeads(currentLeads =>
                        currentLeads.map(l => l.id === selectedLead.id ? { ...l, chat_history: finalMessages } : l)
                    );
                    setSelectedLead(prev => prev ? { ...prev, chat_history: finalMessages } : null);
                }

            } else {
                setChatMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, não consegui obter uma resposta.' }]);
            }

        } catch (error) {
            console.error('Erro no chat:', error);
            toast.error('Erro ao comunicar com a IA.');
            setChatMessages(prev => [...prev, { role: 'assistant', content: 'Ocorreu um erro no servidor. Tente novamente.' }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    // Effect to geocode address & load chat history when modal opens
    useEffect(() => {
        if (!selectedLead) return;

        // Reset states when opening a new lead
        setActiveTab('details');

        // Carrega o histórico do banco ou inicia com saudação padrão
        if (selectedLead.chat_history && selectedLead.chat_history.length > 0) {
            setChatMessages(selectedLead.chat_history as { role: 'user' | 'assistant', content: string }[]);
        } else {
            setChatMessages([{ role: 'assistant', content: `Olá! Sou seu assistente de IA. Como posso ajudar a fechar com a ${selectedLead.company_name}?` }]);
        }

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

    // --- DND KIT SENSORS & HANDLERS ---
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Require 5px movement before drag starts (helps clicking)
            },
        }),
        useSensor(KeyboardSensor)
    );

    const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

    const onDragStart = (event: DragStartEvent) => {
        if (event.active.data.current?.type === 'Column') {
            setActiveColumn(event.active.data.current.column);
            return;
        }

        if (event.active.data.current?.type === 'Lead') {
            setActiveLead(event.active.data.current.lead);
            return;
        }
    };

    const onDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        if (activeId === overId) return;

        const isActiveLead = active.data.current?.type === 'Lead';
        const isOverLead = over.data.current?.type === 'Lead';
        const isOverColumn = over.data.current?.type === 'Column';

        if (!isActiveLead) return;

        // Scenario 1: Dragging a Lead over another Lead
        if (isActiveLead && isOverLead) {
            setLeads((leads) => {
                const activeIndex = leads.findIndex((l) => l.id === activeId);
                const overIndex = leads.findIndex((l) => l.id === overId);

                // If they are in different columns, move the active lead to the over lead's column
                if (leads[activeIndex].status !== leads[overIndex].status) {
                    const newLeads = [...leads];
                    newLeads[activeIndex].status = leads[overIndex].status;
                    return arrayMove(newLeads, activeIndex, overIndex);
                }

                return arrayMove(leads, activeIndex, overIndex);
            });
        }

        // Scenario 2: Dragging a Lead over an empty Column
        if (isActiveLead && isOverColumn) {
            setLeads((leads) => {
                const activeIndex = leads.findIndex((l) => l.id === activeId);
                const overColumnTitle = columns.find(c => c.id === overId)?.title;

                if (overColumnTitle && leads[activeIndex].status !== overColumnTitle) {
                    const newLeads = [...leads];
                    newLeads[activeIndex].status = overColumnTitle;
                    return arrayMove(newLeads, activeIndex, activeIndex);
                }
                return leads;
            });
        }
    };

    const onDragEnd = async (event: DragEndEvent) => {
        setActiveColumn(null);
        setActiveLead(null);

        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        if (activeId === overId) return;

        // If dragging a column
        if (active.data.current?.type === 'Column') {
            setColumns((columns) => {
                const activeColumnIndex = columns.findIndex((col) => col.id === activeId);
                const overColumnIndex = columns.findIndex((col) => col.id === overId);
                const newColumns = arrayMove(columns, activeColumnIndex, overColumnIndex);

                // Update Order in DB asynchronously
                const updates = newColumns.map((col, idx) => ({
                    id: col.id,
                    order: idx
                }));
                // Real app should handle error, ignoring for optimism
                supabase.from('kanban_columns').upsert(updates).then();

                return newColumns;
            });
            return;
        }

        // If dragging a Lead (Persist Status to DB)
        if (active.data.current?.type === 'Lead') {
            const draggedLead = leads.find(l => l.id === activeId);
            if (draggedLead) {
                try {
                    await supabase
                        .from('leads')
                        .update({ status: draggedLead.status })
                        .eq('id', draggedLead.id);
                } catch (error) {
                    console.error("Error saving lead new status", error);
                    toast.error("Erro ao salvar posição do lead.");
                }
            }
        }
    };

    // --- COLUMN MANAGEMENT ACTIONS ---
    const handleAddColumn = async () => {
        if (!newColumnTitle.trim()) {
            setIsAddingColumn(false);
            return;
        }

        setIsSavingColumn(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Não autenticado");

            const newOrder = columns.length > 0 ? Math.max(...columns.map(c => c.order)) + 1 : 1;

            const { data, error } = await supabase
                .from('kanban_columns')
                .insert({
                    user_id: user.id,
                    title: newColumnTitle.trim(),
                    order: newOrder
                })
                .select()
                .single();

            if (error) throw error;

            setColumns([...columns, data as Column]);
            setNewColumnTitle('');
            setIsAddingColumn(false);
            toast.success("Coluna adicionada!");
        } catch (error) {
            console.error(error);
            toast.error("Erro ao criar coluna.");
        } finally {
            setIsSavingColumn(false);
        }
    };

    const handleDeleteColumn = async (columnId: string) => {
        const columnToDelete = columns.find(c => c.id === columnId);
        if (!columnToDelete) return;

        // Check if there are leads in this column
        const hasLeads = leads.some(l => l.status === columnToDelete.title || (!l.status && columnToDelete.title === 'Novos Leads'));
        if (hasLeads) {
            toast.error(`A coluna "${columnToDelete.title}" não está vazia. Mova os leads antes de excluí-la.`);
            return;
        }

        if (!window.confirm(`Tem certeza que deseja excluir a coluna "${columnToDelete.title}"?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('kanban_columns')
                .delete()
                .eq('id', columnId);

            if (error) throw error;

            setColumns(columns.filter(c => c.id !== columnId));
            toast.success("Coluna removida.");
        } catch (error) {
            console.error(error);
            toast.error("Erro ao excluir coluna.");
        }
    };

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
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragEnd={onDragEnd}
                >
                    <div className="flex items-start gap-6 overflow-x-auto pb-4 h-[calc(100vh-140px)] custom-scrollbar">
                        <SortableContext items={columnsId} strategy={horizontalListSortingStrategy}>
                            {columns.map(column => (
                                <SortableColumn
                                    key={column.id}
                                    column={column}
                                    leads={leads.filter(l => l.status === column.title || (!l.status && column.title === 'Novos Leads'))}
                                    onLeadClick={setSelectedLead}
                                    onDeleteColumn={handleDeleteColumn}
                                />
                            ))}
                        </SortableContext>

                        {/* Botão Adicionar Coluna */}
                        <div className="flex-shrink-0 min-w-[280px]">
                            {isAddingColumn ? (
                                <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={newColumnTitle}
                                        onChange={e => setNewColumnTitle(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddColumn()}
                                        placeholder="Nome da coluna..."
                                        className="w-full text-sm p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 mb-2"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleAddColumn}
                                            disabled={isSavingColumn}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {isSavingColumn ? 'Salvando...' : 'Salvar'}
                                        </button>
                                        <button
                                            onClick={() => { setIsAddingColumn(false); setNewColumnTitle(''); }}
                                            className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsAddingColumn(true)}
                                    className="w-full bg-slate-100 hover:bg-slate-200/80 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl p-4 flex items-center justify-center gap-2 transition-colors font-medium h-[68px]"
                                >
                                    <Plus className="w-5 h-5" /> Adicionar Coluna
                                </button>
                            )}
                        </div>
                    </div>

                    <DragOverlay>
                        {activeColumn && (
                            <div className="bg-slate-200 rounded-xl w-[320px] h-[500px] border-2 border-slate-300 shadow-xl opacity-80" />
                        )}
                        {activeLead && (
                            <SortableLead lead={activeLead} onClick={() => { }} />
                        )}
                    </DragOverlay>
                </DndContext>
            )}

            {/* Modal do Lead */}
            {selectedLead && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl overflow-hidden flex flex-col h-[95vh] lg:h-[90vh]">
                        {/* Capa do Modal (Imagem da Fachada) */}
                        {selectedLead.image_url ? (
                            <div className="w-full h-48 bg-slate-200 shrink-0 relative">
                                <img src={selectedLead.image_url} alt={`Fachada de ${selectedLead.company_name}`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                            </div>
                        ) : (
                            <div className="w-full h-48 bg-slate-100 shrink-0 flex items-center justify-center border-b border-slate-200">
                                <Building2 className="w-12 h-12 text-slate-300" />
                            </div>
                        )}

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
                                {selectedLead.category_name && (
                                    <div className="mt-2">
                                        <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-200">
                                            {selectedLead.category_name}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleDeleteLead}
                                    disabled={isDeleting}
                                    title="Excluir Lead"
                                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition-colors disabled:opacity-50"
                                >
                                    {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                </button>
                                <button
                                    onClick={() => setSelectedLead(null)}
                                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
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
                            <div className={`${activeTab === 'details' ? 'block' : 'hidden'} lg:block lg:w-1/2 h-full p-6 overflow-y-auto border-r border-slate-100`}>

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
                                        (() => {
                                            const rawPhone = selectedLead.whatsapp_phone || selectedLead.phone;
                                            if (!rawPhone) return null;

                                            // Função para limpar número: remove tudo que não for dígito
                                            const cleanPhone = rawPhone.replace(/\D/g, '');

                                            // Mensagem quebra-gelo dinâmica
                                            const icebreaker = `Olá! Vi o perfil da empresa ${selectedLead.company_name} no Google e achei o trabalho de vocês muito interessante. Podemos conversar?`;
                                            const encodedMessage = encodeURIComponent(icebreaker);
                                            const waLink = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

                                            return (
                                                <div>
                                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Telefone / WhatsApp</p>
                                                    <a
                                                        href={waLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 mt-1 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 border border-green-200 rounded-lg text-sm font-bold transition-colors w-max"
                                                    >
                                                        <MessageCircle className="w-4 h-4" />
                                                        {rawPhone}
                                                    </a>
                                                </div>
                                            );
                                        })()
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
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-slate-800">{selectedLead.reviews_count} reviews</p>
                                                {selectedLead.google_score && (
                                                    <span className="flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                                                        <span>★</span> {selectedLead.google_score}
                                                    </span>
                                                )}
                                            </div>
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
                                        {selectedLead.neighborhood ? `${selectedLead.neighborhood}${selectedLead.region ? ` - ${selectedLead.region}` : ''}` : (selectedLead.address || selectedLead.region || 'Endereço não informado')}
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
                            <div className={`${activeTab === 'chat' ? 'flex' : 'hidden'} lg:flex lg:w-1/2 h-full flex-col bg-slate-50 relative`}>
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
                                                {msg.role === 'user' ? (
                                                    msg.content
                                                ) : (
                                                    <div className="prose prose-sm max-w-none text-current prose-p:leading-relaxed prose-pre:bg-slate-100 prose-pre:text-slate-800 prose-a:text-blue-600 hover:prose-a:text-blue-500 prose-strong:text-current prose-strong:font-bold prose-ul:list-disc prose-ul:pl-4 prose-ol:list-decimal prose-ol:pl-4 prose-li:my-1 space-y-2 break-words">
                                                        <ReactMarkdown>
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {isChatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-white text-slate-500 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm flex items-center gap-1.5 h-[46px]">
                                                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '-0.3s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '-0.15s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Input Area */}
                                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                                    <form onSubmit={handleSendMessage} className="relative">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="Pergunte à IA sobre este lead..."
                                            disabled={isChatLoading}
                                            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all placeholder:text-slate-400 disabled:opacity-50"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!chatInput.trim() || isChatLoading}
                                            className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                                        >
                                            {isChatLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                            ) : (
                                                <Zap className="w-4 h-4" />
                                            )}
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
