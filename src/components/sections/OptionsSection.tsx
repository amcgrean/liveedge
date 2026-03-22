import React from 'react';
import { SectionCard } from '../ui/SectionCard';

interface Option {
    description: string;
    price: number;
}

interface Props {
    data: Option[];
    onChange: (data: Option[]) => void;
}

const MAX_OPTIONS = 7;

export function OptionsSectionComp({ data, onChange }: Props) {
    const handleChange = (index: number, field: 'description' | 'price', value: string) => {
        const updated = [...data];
        updated[index] = {
            ...updated[index],
            [field]: field === 'price' ? parseFloat(value) || 0 : value,
        };
        onChange(updated);
    };

    const addOption = () => {
        if (data.length < MAX_OPTIONS) {
            onChange([...data, { description: '', price: 0 }]);
        }
    };

    const removeOption = (index: number) => {
        onChange(data.filter((_, i) => i !== index));
    };

    return (
        <SectionCard title="13. Options" accent="rose">
            <div className="space-y-3">
                {data.length === 0 && (
                    <p className="text-xs text-slate-500 italic">No options added. Up to {MAX_OPTIONS} options supported.</p>
                )}
                {data.map((opt, i) => (
                    <div key={i} className="flex gap-3 items-center">
                        <input
                            type="text"
                            value={opt.description}
                            onChange={(e) => handleChange(i, 'description', e.target.value)}
                            className="input-field flex-1"
                            placeholder="Option description (e.g. Upgrade insulation)"
                        />
                        <div className="relative w-40">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                            <input
                                type="number"
                                value={opt.price || ''}
                                onChange={(e) => handleChange(i, 'price', e.target.value)}
                                className="input-field pl-7 w-full"
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>
                        <span className={`text-xs font-medium w-16 text-right ${opt.price >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {opt.price >= 0 ? '+' : ''}{opt.price?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </span>
                        <button onClick={() => removeOption(i)} className="text-slate-500 hover:text-red-400 transition text-lg leading-none">×</button>
                    </div>
                ))}
            </div>
            {data.length < MAX_OPTIONS && (
                <button
                    onClick={addOption}
                    className="mt-4 text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition"
                >
                    + Add Option ({data.length}/{MAX_OPTIONS})
                </button>
            )}
            {data.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-sm text-slate-400">Options Total</span>
                    <span className={`font-bold text-sm ${data.reduce((s, o) => s + o.price, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {data.reduce((s, o) => s + o.price, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </span>
                </div>
            )}
        </SectionCard>
    );
}
