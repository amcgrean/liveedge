import React from 'react';
import { FloorSection, HeaderEntry } from '../../types/estimate';
import { SectionCard, InputGroup, SubSection } from '../ui/SectionCard';

interface Props {
    sectionNumber: number;
    title: string;
    data: FloorSection;
    onChange: (data: FloorSection) => void;
}

const DECK_TYPES     = ['Edge T&G','Gold Edge','Advantech','Diamond'] as const;
const TJI_SIZES      = ['9-1/2','11-7/8','14','16','18','20'];
const CONV_JOIST_SZS = ['2x8','2x10','2x12'];
const HEADER_SIZES = ['2x8','2x10','2x12','1.75x7.25','1.75x9.5','1.75x11.78','1.75x14','1.75x16','1.75x18','3.5x9','3.5x11'];

function lengthsFor(size: string): number[] {
    return size.startsWith('2x') ? [8,10,12,14,16,18,20] : [8,10,12,14,16,18,20,22,24,26,28,30,32];
}

export function FloorSectionComp({ sectionNumber, title, data, onChange }: Props) {
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
        <SectionCard title={`${sectionNumber}. ${title}`} accent="violet">
            {/* Deck */}
            <SubSection title="Deck / Subfloor">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <InputGroup label="Deck SF">
                        <input type="number" name="deckSF" value={data.deckSF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Deck Type">
                        <select name="deckType" value={data.deckType} onChange={handleChange} className="input-field">
                            {DECK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </InputGroup>
                    <InputGroup label="TJI Size">
                        <select name="tjiSize" value={data.tjiSize} onChange={handleChange} className="input-field">
                            {TJI_SIZES.map(s => <option key={s} value={s}>{s}"</option>)}
                        </select>
                    </InputGroup>
                    <InputGroup label="TJI Count" hint="0 = use conventional joist below">
                        <input type="number" name="tjiCount" value={data.tjiCount || ''} onChange={handleChange} className="input-field" min="0" placeholder="Qty" />
                    </InputGroup>
                    <InputGroup label="Conv. Joist Size" hint="Used when TJI count = 0">
                        <select name="joistSize" value={data.joistSize ?? '2x10'} onChange={handleChange} className="input-field">
                            {CONV_JOIST_SZS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </InputGroup>
                    <InputGroup label="Conv. Joist Count">
                        <input type="number" name="joistCount" value={(data.joistCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" placeholder="Qty" />
                    </InputGroup>
                    <InputGroup label="Facemount Hangers" hint="IUS/LUS qty">
                        <input type="number" name="facemountQty" value={(data.facemountQty ?? 0) || ''} onChange={handleChange} className="input-field" min="0" placeholder="Qty" />
                    </InputGroup>
                    <InputGroup label="Gypsum Ceiling SF" hint="Below-floor gypsum">
                        <input type="number" name="gypsumSF" value={(data.gypsumSF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>

            {/* Exterior Walls */}
            <SubSection title="Exterior Walls (LF by height)">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <InputGroup label="2x4 @ 8ft"><input type="number" name="ext2x4_8ft"  value={data.ext2x4_8ft  || ''} onChange={handleChange} className="input-field" min="0" /></InputGroup>
                    <InputGroup label="2x4 @ 9ft"><input type="number" name="ext2x4_9ft"  value={data.ext2x4_9ft  || ''} onChange={handleChange} className="input-field" min="0" /></InputGroup>
                    <InputGroup label="2x4 @ 10ft"><input type="number" name="ext2x4_10ft" value={data.ext2x4_10ft || ''} onChange={handleChange} className="input-field" min="0" /></InputGroup>
                    <InputGroup label="2x6 @ 8ft"><input type="number" name="ext2x6_8ft"  value={data.ext2x6_8ft  || ''} onChange={handleChange} className="input-field" min="0" /></InputGroup>
                    <InputGroup label="2x6 @ 9ft"><input type="number" name="ext2x6_9ft"  value={data.ext2x6_9ft  || ''} onChange={handleChange} className="input-field" min="0" /></InputGroup>
                    <InputGroup label="2x6 @ 10ft"><input type="number" name="ext2x6_10ft" value={data.ext2x6_10ft || ''} onChange={handleChange} className="input-field" min="0" /></InputGroup>
                </div>
            </SubSection>

            {/* Interior & Structural */}
            <SubSection title="Interior & Structural">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <InputGroup label="Int Wall LF">
                        <input type="number" name="intWallLF" value={data.intWallLF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Garage Wall LF">
                        <input type="number" name="garageWallLF" value={data.garageWallLF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Beam LF">
                        <input type="number" name="beamLF" value={data.beamLF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Stair Count">
                        <input type="number" name="stairCount" value={data.stairCount || ''} onChange={handleChange} className="input-field" min="0" />
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
