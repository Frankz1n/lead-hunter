import React, { useMemo } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Globe, Flame, Trash2 } from 'lucide-react';
import type { Lead, Column } from '../pages/Crm';

interface KanbanLeadProps {
    lead: Lead;
    onClick: () => void;
}

export const SortableLead = ({ lead, onClick }: KanbanLeadProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: lead.id,
        data: {
            type: 'Lead',
            lead,
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="bg-blue-50 border-2 border-blue-500 rounded-md p-4 opacity-50 h-[88px]"
            />
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className="bg-white shadow-sm rounded-md p-4 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border border-slate-200"
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
};

interface KanbanColumnProps {
    column: Column;
    leads: Lead[];
    onLeadClick: (lead: Lead) => void;
    onDeleteColumn: (columnId: string) => void;
}

export const SortableColumn = ({ column, leads, onLeadClick, onDeleteColumn }: KanbanColumnProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: column.id,
        data: {
            type: 'Column',
            column,
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const leadIds = useMemo(() => leads.map(l => l.id), [leads]);

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="flex-1 min-w-[320px] bg-slate-200 rounded-xl p-4 border-2 border-slate-300 opacity-50 h-[500px]"
            ></div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex-1 min-w-[320px] bg-slate-100/50 rounded-xl p-4 border border-slate-200/60 flex flex-col max-h-full"
        >
            <div
                {...attributes}
                {...listeners}
                className="flex items-center justify-between mb-4 px-1 cursor-grab active:cursor-grabbing"
            >
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{column.title}</h2>
                    <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{leads.length}</span>
                </div>
                <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onDeleteColumn(column.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-1"
                    title="Excluir Coluna"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-2 custom-scrollbar">
                <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
                    {leads.map(lead => (
                        <SortableLead key={lead.id} lead={lead} onClick={() => onLeadClick(lead as any)} />
                    ))}
                </SortableContext>
                {leads.length === 0 && (
                    <div className="text-center py-8 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg pointer-events-none">
                        Arraste leads para cá
                    </div>
                )}
            </div>
        </div>
    );
};
