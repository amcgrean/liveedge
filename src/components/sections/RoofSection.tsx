import React from 'react';
import { RoofSection } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';

interface Props {
    data: RoofSection;
    onChange: (data: RoofSection) => void;
}

const POST_SIZES = ['4x4', '4x6', '6x6'];
const HEADER_SIZES = ['2x8', '2x10', '2x12', '1.75x7.25', '1.75x9.5', '1.75x11.78', '1.75x14', '1.75x16'];

export function RoofSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target as HTMLInputElement;
        const isNum = (e.target as HTMLInputElement).type === 'number';
        onChange({ ...data, [name]: isNum ? parseFloat(value) || 0 : value });
    };

    return (
        <SectionCard title="6. Roof">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputGroup label="Sheeting SF">
                    <input type="number" name="sheetingSF" value={data.sheetingSF || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Soffit Overhang (in)">
                    <input type="number" name="soffitOverhang" value={data.soffitOverhang || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Post Count">
                    <input type="number" name="postCount" value={data.postCount || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Post Size">
                    <select name="postSize" value={data.postSize} onChange={handleChange} className="input-field">
                        {POST_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </InputGroup>
                <InputGroup label="Header Size">
                    <select name="headerSize" value={data.headerSize} onChange={handleChange} className="input-field">
                        {HEADER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </InputGroup>
                <InputGroup label="Header Count">
                    <input type="number" name="headerCount" value={data.headerCount || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
            </div>
        </SectionCard>
    );
}
