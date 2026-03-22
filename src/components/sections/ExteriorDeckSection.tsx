import React from 'react';
import { ExteriorDeckSection } from '../../types/estimate';
import { SectionCard, InputGroup, SubSection } from '../ui/SectionCard';
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
    Treated: 'Treated',
    Treated_w_DekPro: 'Treated w/DekPro',
    Cedar: 'Cedar',
    Cedar_w_DekPro: 'Cedar w/DekPro',
    Westbury_Black: 'Westbury — Black',
    Westbury_White: 'Westbury — White',
};

export function ExteriorDeckSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target as HTMLInputElement;
        const isNum = (e.target as HTMLInputElement).type === 'number';
        onChange({ ...data, [name]: isNum ? parseFloat(value) || 0 : value });
    };

    const railingMatrix = dataCache.railingMatrix;
    const hasNullRailingItems = railingMatrix?.components?.some(
        (c: any) => c.item >= 13 && c.item <= 15 && data.railingLF > 0
    );

    // Board estimate preview: 5/4x6 boards at 12ft lengths, 12% waste
    const boardPreview = data.deckSF > 0
        ? Math.ceil((data.deckSF * 1.12) / ((5.5 / 12) * 12))
        : 0;

    return (
        <SectionCard title="11. Exterior Deck" accent="amber">
            <SubSection title="Structure">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <InputGroup label="Deck SF" hint="Drives decking board quantity">
                        <input type="number" name="deckSF" value={data.deckSF || ''} onChange={handleChange} className="input-field" min="0" placeholder="Sq ft" />
                    </InputGroup>
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
            </SubSection>

            <SubSection title="Decking Material">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputGroup label="Decking Type">
                        <select name="deckingType" value={data.deckingType} onChange={handleChange} className="input-field">
                            {DECKING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </InputGroup>
                    {boardPreview > 0 && (
                        <div className="flex items-end">
                            <p className="text-xs text-slate-500">
                                Est. boards: <span className="text-amber-300 font-semibold">{boardPreview} pcs × 12ft</span>
                            </p>
                        </div>
                    )}
                </div>
            </SubSection>

            <SubSection title="Railing">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="mt-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>
                        Railing items 13–15 are not yet assigned in the data. Those components will need manual entry on the estimate.
                    </div>
                )}
            </SubSection>
        </SectionCard>
    );
}
