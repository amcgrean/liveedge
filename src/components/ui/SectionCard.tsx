import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface CardProps {
    title: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
    badge?: string | number;
    accent?: 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky';
}

const ACCENT_STYLES: Record<string, { border: string; dot: string; badge: string }> = {
    cyan:    { border: 'border-cyan-500/40',   dot: 'bg-cyan-400',   badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
    violet:  { border: 'border-violet-500/40', dot: 'bg-violet-400', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
    emerald: { border: 'border-emerald-500/40',dot: 'bg-emerald-400',badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    amber:   { border: 'border-amber-500/40',  dot: 'bg-amber-400',  badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    rose:    { border: 'border-rose-500/40',   dot: 'bg-rose-400',   badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
    sky:     { border: 'border-sky-500/40',    dot: 'bg-sky-400',    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
};

export function SectionCard({ title, children, defaultExpanded = false, badge, accent = 'cyan' }: CardProps) {
    const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
    const styles = ACCENT_STYLES[accent];

    return (
        <div className="card mb-6 group">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-slate-50/50"
            >
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                    {title}
                </h2>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
            </button>
            <div
                className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
            >
                <div className="overflow-hidden">
                    <div className="p-5 pt-0 border-t border-slate-100/60 mt-2">{children}</div>
                </div>
            </div>
        </div>
    );
}

export function InputGroup({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div className="mb-2 group">
            <label className="input-label transition-colors">{label}</label>
            {children}
            {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
        </div>
    );
}

export function FieldRow({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
    const colClass = { 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[cols];
    return <div className={cn('grid gap-4', colClass)}>{children}</div>;
}

export function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-white/8" />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 px-1">{title}</span>
                <div className="h-px flex-1 bg-white/8" />
            </div>
            {children}
        </div>
    );
}
