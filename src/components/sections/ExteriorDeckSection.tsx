import React from 'react';
import { ExteriorDeckSection } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';
import { dataCache } from '../../utils/lookup';

interface Props {
    data: ExteriorDeckSection;
    onChange: (data: ExteriorDeckSection) => void;
}

const JOIST_SIZES: ('2x8' | '2x10' | '2x12')[] = ['2x8', '2x10', '2x12'];
const BEAM_SIZES: ('2x8' | '2x10' | '2x12')[] = ['2x8', '2x10', '2x12'];
const DECKING_TYPES = ['Cedar', 'Treated', 'Trex', 'TimberTech', 'Azek', 'Deckorators'];
const RAILING_STYLES = ['Treated', 'Treated_w_DekPro', 'Cedar', 'Cedar_w_DekPro', 'Westbury_Black', 'Westbury_White'];
const RAILING_DISPLAY: Record<string, string> = {
    'Treated': 'Treated',
    'Treated_w_DekPro': 'Treated w/DekPro',
    'Cedar': 'Cedar',
    'Cedar_w_DekPro': 'Cedar w/DekPro',
    'Westbury_Black': 'Westbury - Black',
    'Westbury_White': 'Westbury - White',
};

export function ExteriorDeckSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target as HTMLInputElement;
        const isNum = (e.target as HTMLInputElement).type === 'number';
        onChange({
            ...data,
            [name]: isNum ? parseFloat(value) || 0 : value,
        });
    };

    const handleCheckChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ ...data, [e.target.name]: e.target.checked });
    };

    // Railing items from railing_matrix - show warning if items 13-15 would be needed
    const railingMatrix = dataCache.railingMatrix;
    const hasNullRailingItems = railingMatrix?.components?.some((c: any) =>
        c.item >= 13 && c.item <= 15 && data.railingLF > 0
    );

    return (
        <SectionCard title="11. Exterior Deck">
            <div className="space-y-6">
                {/* Structure */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Structure</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputGroup label="Joist Size">
                            <select name="joistSize" value={data.joistSize} onChange={handleChange} className="input-field">
                                {JOIST_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Beam Size">
                            <select name="beamSize" value={data.beamSize} onChange={handleChange} className="input-field">
                                {BEAM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Post Count">
                            <input type="number" name="postCount" value={data.postCount || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                        <InputGroup label="Stair Count">
                            <input type="number" name="stairCount" value={data.stairCount || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                        <InputGroup label="Landing">
                            <select
                                name="landing"
                                value={data.landing ? 'true' : 'false'}
                                onChange={(e) => onChange({ ...data, landing: e.target.value === 'true' })}
                                className="input-field"
                            >
                                <option value="false">No</option>
                                <option value="true">Yes</option>
                            </select>
                        </InputGroup>
                    </div>
                </div>

                {/* Decking */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Decking</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Decking Type">
                            <select name="deckingType" value={data.deckingType} onChange={handleChange} className="input-field">
                                {DECKING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </InputGroup>
                    </div>
                </div>

                {/* Railing */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Railing</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Railing Style">
                            <select name="railingStyle" value={data.railingStyle} onChange={handleChange} className="input-field">
                                {RAILING_STYLES.map(s => <option key={s} value={s}>{RAILING_DISPLAY[s]}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Railing LF">
                            <input type="number" name="railingLF" value={data.railingLF || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                    </div>
                    {hasNullRailingItems && data.railingLF > 0 && (
                        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-300">
                            ⚠ Railing items 13-15 are not yet assigned in the data. Those components will need manual entry on the estimate.
                        </div>
                    )}
                </div>
            </div>
        </SectionCard>
    );
}
