import React from 'react';
import { BasementSection, HeaderEntry } from '../../types/estimate';
import { SectionCard, InputGroup, SubSection } from '../ui/SectionCard';

interface Props {
    data: BasementSection;
    onChange: (data: BasementSection) => void;
}

const HEADER_SIZES = ['2x8','2x10','2x12','1.75x7.25','1.75x9.5','1.75x11.78','1.75x14','1.75x16','1.75x18','3.5x9','3.5x11'];
const JOIST_SIZES  = ['2x8','2x10','2x12','2x14','2x16'];

function lengthsFor(size: string): number[] {
    if (size.startsWith('2x')) return [8,10,12,14,16,18,20];
    return [8,10,12,14,16,18,20,22,24,26,28,30,32];
}

export function BasementSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const el = e.target as HTMLInputElement;
        onChange({ ...data, [el.name]: el.type === 'number' ? parseFloat(el.value) || 0 : el.value });
    };

    const handleHeader = (i: number, field: keyof HeaderEntry, value: string) => {
        const next = data.headers.map((h, idx) =>
            idx !== i ? h : { ...h, [field]: field === 'size' ? value : parseInt(value) || 0 }
        );
        onChange({ ...data, headers: next });
    };

    const addHeader    = () => onChange({ ...data, headers: [...data.headers, { size: '2x8', length_ft: 12, count: 0 }] });
    const removeHeader = (i: number) => onChange({ ...data, headers: data.headers.filter((_, idx) => idx !== i) });

    return (
        <SectionCard title="3. Basement Section" accent="violet">
            {/* Exterior Walls */}
            <SubSection title="Exterior Walls — 2x4 (LF by height)">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {(['8ft','9ft','10ft','12ft','14ft','16ft','20ft'] as const).map(ht => (
                        <InputGroup key={ht} label={`2x4 @ ${ht}`}>
                            <input type="number" name={`ext2x4_${ht.replace('ft','ft')}`} value={(data as any)[`ext2x4_${ht.replace('ft','ft')}`] || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                    ))}
                </div>
            </SubSection>

            <SubSection title="Exterior Walls — 2x6 (LF by height)">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {(['8ft','9ft','10ft','12ft','14ft','16ft','20ft'] as const).map(ht => (
                        <InputGroup key={ht} label={`2x6 @ ${ht}`}>
                            <input type="number" name={`ext2x6_${ht}`} value={(data as any)[`ext2x6_${ht}`] || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                    ))}
                </div>
            </SubSection>

            <SubSection title="LSL Studs (Timberstrand — LF by height)">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {(['8ft','9ft','10ft'] as const).map(ht => (
                        <React.Fragment key={ht}>
                            <InputGroup label={`2x4 LSL @ ${ht}`}>
                                <input type="number" name={`ext2x4_lsl_${ht}`} value={(data as any)[`ext2x4_lsl_${ht}`] || ''} onChange={handleChange} className="input-field" min="0" />
                            </InputGroup>
                            <InputGroup label={`2x6 LSL @ ${ht}`}>
                                <input type="number" name={`ext2x6_lsl_${ht}`} value={(data as any)[`ext2x6_lsl_${ht}`] || ''} onChange={handleChange} className="input-field" min="0" />
                            </InputGroup>
                        </React.Fragment>
                    ))}
                </div>
            </SubSection>

            {/* Interior & Misc */}
            <SubSection title="Interior & Structural">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <InputGroup label="Int Wall LF">
                        <input type="number" name="intWallLF" value={data.intWallLF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Bearing Wall LF">
                        <input type="number" name="bearingWallLF" value={(data.bearingWallLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Finish Wall LF">
                        <input type="number" name="finishWallLF" value={(data.finishWallLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Rim LF">
                        <input type="number" name="rimLF" value={(data.rimLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Stair Count">
                        <input type="number" name="stairCount" value={data.stairCount || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="FHA Ceiling Height (ft)">
                        <input type="number" name="fhaCeilingHeight" value={data.fhaCeilingHeight || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="FHA Post Count">
                        <input type="number" name="fhaPostCount" value={data.fhaPostCount || ''} onChange={handleChange} className="input-field" min="0" placeholder="# of posts" />
                    </InputGroup>
                </div>
            </SubSection>

            {/* Beams by size */}
            <SubSection title="Beams (LF by size)">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <InputGroup label="2×8 Beam LF">
                        <input type="number" name="beam2x8LF" value={(data.beam2x8LF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="2×10 Beam LF">
                        <input type="number" name="beam2x10LF" value={(data.beam2x10LF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="2×12 Beam LF">
                        <input type="number" name="beam2x12LF" value={(data.beam2x12LF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="LVL Beam LF" hint="Glulam/LVL">
                        <input type="number" name="beamLVLLF" value={(data.beamLVLLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Steel Beam LF">
                        <input type="number" name="beamSteelLF" value={(data.beamSteelLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>

            {/* Stoop */}
            <SubSection title="Stoop">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <InputGroup label="Stoop Joist Size">
                        <select name="stoopJoistSize" value={data.stoopJoistSize} onChange={handleChange} className="input-field">
                            {JOIST_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </InputGroup>
                    <InputGroup label="Stoop SF">
                        <input type="number" name="stoopSF" value={data.stoopSF || ''} onChange={handleChange} className="input-field" min="0" placeholder="Sq ft" />
                    </InputGroup>
                    <InputGroup label="Stoop Rim LF">
                        <input type="number" name="stoopRimLF" value={(data.stoopRimLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label='2" Dow Insul. SF' hint="Rigid insulation under stoop">
                        <input type="number" name="stoopDowSF" value={(data.stoopDowSF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Stoop Hangers" hint="Joist hanger count">
                        <input type="number" name="stoopHangerCount" value={(data.stoopHangerCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>

            {/* Engineered Headers */}
            <SubSection title="Engineered Headers">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-500">{data.headers.length === 0 ? 'No headers added' : `${data.headers.length} header${data.headers.length !== 1 ? 's' : ''}`}</span>
                    <button onClick={addHeader} className="text-xs px-3 py-1 rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 transition">+ Add Header</button>
                </div>
                <div className="space-y-2">
                    {data.headers.map((h, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <select value={h.size} onChange={e => handleHeader(i, 'size', e.target.value)} className="input-field flex-1 min-w-[130px]">
                                {HEADER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select value={h.length_ft} onChange={e => handleHeader(i, 'length_ft', e.target.value)} className="input-field w-24">
                                {lengthsFor(h.size).map(l => <option key={l} value={l}>{l}ft</option>)}
                            </select>
                            <input type="number" value={h.count || ''} onChange={e => handleHeader(i, 'count', e.target.value)} className="input-field w-20" placeholder="Qty" min="0" />
                            <button onClick={() => removeHeader(i)} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition flex-shrink-0">×</button>
                        </div>
                    ))}
                </div>
            </SubSection>
        </SectionCard>
    );
}
