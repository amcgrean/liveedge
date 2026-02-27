import React from 'react';
import { SidingSection as SidingSectionType } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';

interface Props {
    data: SidingSectionType;
    onChange: (data: SidingSectionType) => void;
}

const LP_PROFILES = ['6in', '8in', '12in'];
const HARDIE_PROFILES = ['5.25in', '6.25in', '7.25in', '8.25in', '12in'];
const SHAKE_TYPES = ['N/A', 'LP Shake', 'Hardie Shake', 'Cedar Shake'];
const PORCH_SOFFIT_TYPES = ['N/A', 'LP', 'Hardie', 'Rollex'];
const TRIM_BOARD_TYPES = ['N/A', 'LP 1x4', 'LP 1x6', 'LP 1x8', 'Hardie 1x4', 'Hardie 1x6', 'Cedar 1x4', 'Cedar 1x6'];
const CORNER_TYPES = ['N/A', 'LP Corner', 'Hardie Corner', 'Vinyl Corner', 'Cedar Corner'];

export function SidingSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target as HTMLInputElement;
        const isNum = (e.target as HTMLInputElement).type === 'number';
        const isCheck = (e.target as HTMLInputElement).type === 'checkbox';
        onChange({
            ...data,
            [name]: isCheck ? (e.target as HTMLInputElement).checked : isNum ? parseFloat(value) || 0 : value,
        });
    };

    const lapProfiles = data.lapType === 'LP' ? LP_PROFILES : data.lapType === 'Hardie' ? HARDIE_PROFILES : ['default'];

    return (
        <SectionCard title="8. Siding">
            <div className="space-y-6">
                {/* Lap Siding */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Lap Siding</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputGroup label="Lap Siding Type">
                            <select name="lapType" value={data.lapType} onChange={handleChange} className="input-field">
                                <option value="LP">LP</option>
                                <option value="Hardie">Hardie</option>
                                <option value="Vinyl">Vinyl</option>
                            </select>
                        </InputGroup>
                        <InputGroup label="Profile Size">
                            <select name="lapProfileSize" value={data.lapProfileSize} onChange={handleChange} className="input-field">
                                {lapProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Lap SF">
                            <input type="number" name="lapSF" value={data.lapSF || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                    </div>
                </div>

                {/* Shake */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Shake</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Shake Type">
                            <select name="shakeType" value={data.shakeType} onChange={handleChange} className="input-field">
                                {SHAKE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Shake SF">
                            <input type="number" name="shakeSF" value={data.shakeSF || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                    </div>
                </div>

                {/* Soffit */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Soffit</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputGroup label="Soffit Type">
                            <select name="soffitType" value={data.soffitType} onChange={handleChange} className="input-field">
                                <option value="LP">LP</option>
                                <option value="Hardie">Hardie</option>
                                <option value="Rollex">Rollex</option>
                            </select>
                        </InputGroup>
                        <InputGroup label="Soffit SF">
                            <input type="number" name="soffitSF" value={data.soffitSF || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                    </div>
                </div>

                {/* Porch Soffit */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Porch Soffit</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Porch Soffit Type">
                            <select name="porchSoffitType" value={data.porchSoffitType} onChange={handleChange} className="input-field">
                                {PORCH_SOFFIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Porch Soffit SF">
                            <input type="number" name="porchSoffitSF" value={data.porchSoffitSF || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                    </div>
                </div>

                {/* Trim Boards, Corners, Splicers */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Trim, Corners & Accessories</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <InputGroup label="Trim Board Type">
                            <select name="trimBoardType" value={data.trimBoardType} onChange={handleChange} className="input-field">
                                {TRIM_BOARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Trim Board LF">
                            <input type="number" name="trimBoardLF" value={data.trimBoardLF || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                        <InputGroup label="Corner Type">
                            <select name="cornerType" value={data.cornerType} onChange={handleChange} className="input-field">
                                {CORNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </InputGroup>
                        <InputGroup label="Corner Count">
                            <input type="number" name="cornerCount" value={data.cornerCount || ''} onChange={handleChange} className="input-field" min="0" />
                        </InputGroup>
                        <InputGroup label="Splicers">
                            <select
                                name="splicers"
                                value={data.splicers ? 'true' : 'false'}
                                onChange={(e) => onChange({ ...data, splicers: e.target.value === 'true' })}
                                className="input-field"
                            >
                                <option value="false">No</option>
                                <option value="true">Yes</option>
                            </select>
                        </InputGroup>
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}
