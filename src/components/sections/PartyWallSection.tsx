import React from 'react';
import { PartyWallSection } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';

interface Props {
    data: PartyWallSection;
    onChange: (data: PartyWallSection) => void;
}

const FRAMING_SIZES: PartyWallSection['framingSize'][] = ['2x4', '2x6'];
const WALL_HEIGHTS = [8, 9, 10, 12, 14, 16, 20];
const GYPSUM_LAYERS = [1, 2, 3];

export function PartyWallSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target as HTMLInputElement;
        const isNum = (e.target as HTMLInputElement).type === 'number';
        onChange({ ...data, [name]: isNum ? parseFloat(value) || 0 : value });
    };

    return (
        <SectionCard title="Party Wall" accent="rose">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                <InputGroup label="Party Wall LF">
                    <input type="number" name="lf" value={data.lf || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Wall Height (ft)">
                    <select name="height" value={data.height} onChange={handleChange} className="input-field">
                        {WALL_HEIGHTS.map(h => <option key={h} value={h}>{h}ft</option>)}
                    </select>
                </InputGroup>
                <InputGroup label="Framing Size">
                    <select name="framingSize" value={data.framingSize} onChange={handleChange} className="input-field">
                        {FRAMING_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </InputGroup>
                <InputGroup label="Gypsum Layers (per side)" hint="Typically 1 or 2 layers each side">
                    <select name="gypsumLayers" value={data.gypsumLayers} onChange={handleChange} className="input-field">
                        {GYPSUM_LAYERS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </InputGroup>
            </div>
        </SectionCard>
    );
}
