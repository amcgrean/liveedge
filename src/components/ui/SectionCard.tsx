import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
        <div className={cn('card mb-3', isExpanded && `border-l-2 ${styles.border}`)}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/3 transition-colors group"
                style={{ '--tw-bg-opacity': 0.03 } as React.CSSProperties}
            >
                <div className="flex items-center gap-3">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0 transition-all', styles.dot, !isExpanded && 'opacity-40')} />
                    <h2 className="text-sm font-semibold text-slate-100 tracking-wide">{title}</h2>
                </div>
                <div className="flex items-center gap-2.5">
                    {badge !== undefined && (
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', styles.badge)}>
                            {badge}
                        </span>
                    )}
                    <svg
                        className={cn('w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-slate-300', isExpanded && 'rotate-180')}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                    </svg>
                </div>
            </button>
            {isExpanded && (
                <div className="px-5 pb-5 pt-1 border-t border-white/8">
                    {children}
                </div>
            )}
        </div>
    );
}

export function InputGroup({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div>
            <label className="input-label">{label}</label>
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
