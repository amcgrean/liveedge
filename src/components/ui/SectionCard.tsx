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
}

export function SectionCard({ title, children, defaultExpanded = false }: CardProps) {
    const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

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

export function InputGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-2 group">
            <label className="input-label transition-colors">{label}</label>
            {children}
        </div>
    );
}
