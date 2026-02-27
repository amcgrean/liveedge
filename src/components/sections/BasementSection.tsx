import React from 'react';
import { BasementSection } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';

interface Props {
    data: BasementSection;
    onChange: (data: BasementSection) => void;
}

const HEADER_SIZES = ['2x8', '2x10', '2x12', '1.75x7.25', '1.75x9.5', '1.75x11.78', '1.75x14', '1.75x16', '1.75x18', '3.5x9', '3.5x11'];
const JOIST_SIZES = ['2x8', '2x10', '2x12'];

export function BasementSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target as HTMLInputElement;
        const isNum = (e.target as HTMLInputElement).type === 'number';
        onChange({ ...data, [name]: isNum ? parseFloat(value) || 0 : value });
    };

    const handleHeaderChange = (index: number, field: 'size' | 'count', value: string) => {
        const newHeaders = [...data.headers];
        newHeaders[index] = { ...newHeaders[index], [field]: field === 'count' ? parseInt(value) || 0 : value };
        onChange({ ...data, headers: newHeaders });
    };

    const addHeader = () => {
        onChange({ ...data, headers: [...data.headers, { size: '2x8', count: 0 }] });
    };

    const removeHeader = (index: number) => {
        onChange({ ...data, headers: data.headers.filter((_, i) => i !== index) });
    };

    return (
        <SectionCard title="3. Basement Section">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputGroup label="Ext 2x4 LF (8ft)">
                    <input type="number" name="ext2x4_8ft" value={data.ext2x4_8ft || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Ext 2x4 LF (9ft)">
                    <input type="number" name="ext2x4_9ft" value={data.ext2x4_9ft || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Ext 2x4 LF (10ft)">
                    <input type="number" name="ext2x4_10ft" value={data.ext2x4_10ft || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Ext 2x6 LF (8ft)">
                    <input type="number" name="ext2x6_8ft" value={data.ext2x6_8ft || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Ext 2x6 LF (9ft)">
                    <input type="number" name="ext2x6_9ft" value={data.ext2x6_9ft || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Ext 2x6 LF (10ft)">
                    <input type="number" name="ext2x6_10ft" value={data.ext2x6_10ft || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Int Wall LF">
                    <input type="number" name="intWallLF" value={data.intWallLF || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Beam LF">
                    <input type="number" name="beamLF" value={data.beamLF || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Stair Count">
                    <input type="number" name="stairCount" value={data.stairCount || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="FHA Ceiling Height (ft)">
                    <input type="number" name="fhaCeilingHeight" value={data.fhaCeilingHeight || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Stoop Joist Size">
                    <select name="stoopJoistSize" value={data.stoopJoistSize} onChange={handleChange} className="input-field">
                        {JOIST_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </InputGroup>
            </div>

            <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-300">Engineered Headers</h3>
                    <button onClick={addHeader} className="text-xs px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition">
                        + Add Header
                    </button>
                </div>
                {data.headers.length === 0 && (
                    <p className="text-xs text-slate-500 italic">No headers added.</p>
                )}
                <div className="space-y-2">
                    {data.headers.map((h, i) => (
                        <div key={i} className="flex gap-3 items-center">
                            <select
                                value={h.size}
                                onChange={(e) => handleHeaderChange(i, 'size', e.target.value)}
                                className="input-field flex-1"
                            >
                                {HEADER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <input
                                type="number"
                                value={h.count || ''}
                                onChange={(e) => handleHeaderChange(i, 'count', e.target.value)}
                                className="input-field w-24"
                                placeholder="Qty"
                                min="0"
                            />
                            <button onClick={() => removeHeader(i)} className="text-slate-500 hover:text-red-400 transition text-lg leading-none">×</button>
                        </div>
                    ))}
                </div>
            </div>
        </SectionCard>
    );
}
