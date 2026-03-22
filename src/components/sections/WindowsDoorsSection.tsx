import React from 'react';
import { DoorEntry } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';
import { dataCache } from '../../utils/lookup';

interface WindowsDoorsData {
    windowCount: number;
    doors: DoorEntry[];
}

interface Props {
    data: WindowsDoorsData;
    onChange: (data: WindowsDoorsData) => void;
}

// Human-readable labels for the size key codes
const SIZE_LABELS: Record<string, string> = {
    'slab.16': "1'4\" Slab",  'slab.20': "1'8\" Slab",  'slab.24': "2'0\" Slab",
    'slab.26': "2'2\" Slab",  'slab.28': "2'8\" Slab",  'slab.30': "3'0\" Slab",
    'sh.16':   "1'4\" 8ft",   'sh.20':   "1'8\" 8ft",   'sh.24':   "2'0\" 8ft",
    'sh.26':   "2'2\" 8ft",   'sh.28':   "2'8\" 8ft",   'sh.30':   "3'0\" 8ft",
    'dh.30':   "3'0\" Dbl",   'dh.40':   "4'0\" Dbl",   'dh.50':   "5'0\" Dbl",  'dh.60': "6'0\" Dbl",
    'bi.30':   "3'0\" Bifold",'bi.40':   "4'0\" Bifold",'bi.50':   "5'0\" Bifold",
};

const TYPE_GROUPS = [
    { label: 'Single 6\'8" (Slab)',  keys: ['slab.16','slab.20','slab.24','slab.26','slab.28','slab.30'] },
    { label: 'Single 8\'0"',         keys: ['sh.16','sh.20','sh.24','sh.26','sh.28','sh.30'] },
    { label: 'Double',               keys: ['dh.30','dh.40','dh.50','dh.60'] },
    { label: 'Bifold',               keys: ['bi.30','bi.40','bi.50'] },
];

export function WindowsDoorsSectionComp({ data, onChange }: Props) {
    const doorStyles: string[] = dataCache.doorStyles ? Object.keys(dataCache.doorStyles) : ['Madison','Cambridge','Continental','Craftsman'];

    const handleWindowCount = (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ ...data, windowCount: parseInt(e.target.value) || 0 });

    const addDoor = () => onChange({
        ...data,
        doors: [...data.doors, { style: doorStyles[0] ?? 'Madison', sizeKey: 'slab.28', hcSc: 'hc', count: 1 }],
    });

    const removeDoor = (i: number) => onChange({ ...data, doors: data.doors.filter((_, idx) => idx !== i) });

    const updateDoor = (i: number, field: keyof DoorEntry, value: string | number) => {
        const next = data.doors.map((d, idx) => idx !== i ? d : { ...d, [field]: value });
        onChange({ ...data, doors: next });
    };

    // Resolve SKU for a door entry from door_styles.json
    const resolveSku = (door: DoorEntry): string | null => {
        const familyData = dataCache.doorStyles?.[door.style];
        if (!familyData) return null;
        const sizeData = familyData.sizes?.[door.sizeKey];
        if (!sizeData) return null;
        return sizeData[door.hcSc] ?? null;
    };

    return (
        <SectionCard title="12. Windows & Doors (Package)" accent="sky">
            <div className="space-y-5">
                {/* Windows */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputGroup label="Window Count">
                        <input type="number" value={data.windowCount || ''} onChange={handleWindowCount} className="input-field" min="0" />
                    </InputGroup>
                </div>

                {/* Doors */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-300">Door Package</h3>
                        <button onClick={addDoor} className="text-xs px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition">
                            + Add Door
                        </button>
                    </div>
                    {data.doors.length === 0 && (
                        <p className="text-xs text-slate-500 italic">No doors added. Click + Add Door to order door units by style and size.</p>
                    )}
                    {data.doors.length > 0 && (
                        <div className="grid grid-cols-[1fr_1fr_1fr_90px_64px_32px] gap-2 mb-2 px-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Style</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Size</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">HC / SC</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Qty</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">SKU</span>
                            <span />
                        </div>
                    )}
                    <div className="space-y-2">
                        {data.doors.map((door, i) => {
                            const sku = resolveSku(door);
                            // Get valid size keys for this style
                            const familyData = dataCache.doorStyles?.[door.style];
                            const availableKeys: string[] = familyData ? Object.keys(familyData.sizes) : Object.keys(SIZE_LABELS);

                            return (
                                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_90px_64px_32px] gap-2 items-center">
                                    {/* Style */}
                                    <select value={door.style} onChange={e => updateDoor(i, 'style', e.target.value)} className="input-field text-sm">
                                        {doorStyles.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    {/* Size */}
                                    <select value={door.sizeKey} onChange={e => updateDoor(i, 'sizeKey', e.target.value)} className="input-field text-sm">
                                        {TYPE_GROUPS.map(grp => {
                                            const validKeys = grp.keys.filter(k => availableKeys.includes(k));
                                            if (!validKeys.length) return null;
                                            return (
                                                <optgroup key={grp.label} label={grp.label}>
                                                    {validKeys.map(k => <option key={k} value={k}>{SIZE_LABELS[k] ?? k}</option>)}
                                                </optgroup>
                                            );
                                        })}
                                    </select>
                                    {/* HC / SC */}
                                    <select value={door.hcSc} onChange={e => updateDoor(i, 'hcSc', e.target.value as 'hc' | 'sc')} className="input-field text-sm">
                                        <option value="hc">Hollow Core</option>
                                        <option value="sc">Solid Core</option>
                                    </select>
                                    {/* Count */}
                                    <input type="number" value={door.count || ''} onChange={e => updateDoor(i, 'count', parseInt(e.target.value) || 0)} className="input-field text-sm" min="1" />
                                    {/* Resolved SKU */}
                                    <span className={`text-[10px] font-mono truncate ${sku ? 'text-cyan-400' : 'text-amber-400'}`} title={sku ?? 'Size not in this style'}>
                                        {sku ?? '—'}
                                    </span>
                                    <button onClick={() => removeDoor(i)} className="text-slate-500 hover:text-red-400 text-lg leading-none">×</button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}
