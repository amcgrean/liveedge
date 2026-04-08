import React from 'react';
import { SidingSection as SidingSectionType } from '../../types/estimate';
import { SectionCard, InputGroup, SubSection } from '../ui/SectionCard';

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
        onChange({ ...data, [name]: isNum ? parseFloat(value) || 0 : value });
    };

    const lapProfiles = data.lapType === 'LP' ? LP_PROFILES : data.lapType === 'Hardie' ? HARDIE_PROFILES : ['default'];

    return (
        <SectionCard title="8. Siding" accent="emerald">
            <SubSection title="Lap Siding">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <InputGroup label="Siding Type">
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
            </SubSection>

            <SubSection title="Shake">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputGroup label="Shake Type">
                        <select name="shakeType" value={data.shakeType} onChange={handleChange} className="input-field">
                            {SHAKE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </InputGroup>
                    <InputGroup label="Shake SF">
                        <input type="number" name="shakeSF" value={data.shakeSF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>

            <SubSection title="Soffit">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <div />
                    <InputGroup label="Porch Soffit Type">
                        <select name="porchSoffitType" value={data.porchSoffitType} onChange={handleChange} className="input-field">
                            {PORCH_SOFFIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </InputGroup>
                    <InputGroup label="Porch Soffit SF">
                        <input type="number" name="porchSoffitSF" value={data.porchSoffitSF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>

            <SubSection title="Trim, Corners & Accessories">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            </SubSection>

            <SubSection title="LP/Hardie Trim Profiles (LF each)">
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
                    {([
                        { name: 'trim1x2LF',    label: '1×2' },
                        { name: 'trim1x4LF',    label: '1×4' },
                        { name: 'trim1x6LF',    label: '1×6' },
                        { name: 'trim1x8LF',    label: '1×8' },
                        { name: 'trim1x12LF',   label: '1×12' },
                        { name: 'trim5_4x4LF',  label: '5/4×4' },
                        { name: 'trim5_4x6LF',  label: '5/4×6' },
                        { name: 'trim5_4x8LF',  label: '5/4×8' },
                        { name: 'trim5_4x12LF', label: '5/4×12' },
                    ] as const).map(({ name, label }) => (
                        <InputGroup key={name} label={label}>
                            <input type="number" name={name} value={(data[name] ?? 0) || ''} onChange={handleChange} className="input-field" min="0" placeholder="LF" />
                        </InputGroup>
                    ))}
                </div>
            </SubSection>

            <SubSection title="Vinyl Accessories">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <InputGroup label="J-Channel LF">
                        <input type="number" name="jChannelLF" value={(data.jChannelLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Undersill LF">
                        <input type="number" name="undersillLF" value={(data.undersillLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Metal Start LF">
                        <input type="number" name="metalStartLF" value={(data.metalStartLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>
        </SectionCard>
    );
}
