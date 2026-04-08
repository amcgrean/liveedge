import React from 'react';
import { TrimSection } from '../../types/estimate';
import { SectionCard, InputGroup, SubSection } from '../ui/SectionCard';
import { dataCache } from '../../utils/lookup';

interface Props {
    data: TrimSection;
    onChange: (data: TrimSection) => void;
}

export function TrimSectionComp({ data, onChange }: Props) {
    const trimSwitches = dataCache.trimSwitches || { base_types: [], case_types: [], handrail_types: [], crown_types: [] };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target as HTMLInputElement;
        const isNum = (e.target as HTMLInputElement).type === 'number';
        onChange({ ...data, [name]: isNum ? parseFloat(value) || 0 : value });
    };

    const handleDoorCount = (field: keyof TrimSection['doorCounts'], value: string) => {
        onChange({ ...data, doorCounts: { ...data.doorCounts, [field]: parseInt(value) || 0 } });
    };

    return (
        <SectionCard title="9. Trim" accent="emerald">
            <SubSection title="Trim Types">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <InputGroup label="Base Trim Type">
                        <select name="baseType" value={data.baseType} onChange={handleChange} className="input-field">
                            <option value="">Select base type...</option>
                            {trimSwitches.base_types.map((t: any) => (
                                <option key={t.id} value={t.switch_key}>{t.display}</option>
                            ))}
                        </select>
                    </InputGroup>
                    <InputGroup label="Base Trim LF" hint="Total LF of base trim needed">
                        <input type="number" name="baseLF" value={data.baseLF || ''} onChange={handleChange} className="input-field" min="0" placeholder="Linear feet" />
                    </InputGroup>
                    <InputGroup label="Case Trim Type">
                        <select name="caseType" value={data.caseType} onChange={handleChange} className="input-field">
                            <option value="">Select case type...</option>
                            {trimSwitches.case_types.map((t: any) => (
                                <option key={t.id} value={t.switch_key}>{t.display}</option>
                            ))}
                        </select>
                    </InputGroup>
                </div>
            </SubSection>

            <SubSection title="Door Counts (for casing)">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <InputGroup label="Single 6/8">
                        <input type="number" value={data.doorCounts.single68 || ''} onChange={e => handleDoorCount('single68', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Single 8/0">
                        <input type="number" value={data.doorCounts.single80 || ''} onChange={e => handleDoorCount('single80', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Slab 2-8">
                        <input type="number" value={(data.doorCounts.slab28 ?? 0) || ''} onChange={e => handleDoorCount('slab28', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Slab 3-0">
                        <input type="number" value={(data.doorCounts.slab30 ?? 0) || ''} onChange={e => handleDoorCount('slab30', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Pocket 2-8">
                        <input type="number" value={(data.doorCounts.pocket28 ?? 0) || ''} onChange={e => handleDoorCount('pocket28', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Pocket 3-0">
                        <input type="number" value={(data.doorCounts.pocket30 ?? 0) || ''} onChange={e => handleDoorCount('pocket30', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Double 3-0">
                        <input type="number" value={data.doorCounts.double30 || ''} onChange={e => handleDoorCount('double30', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Double 4-0">
                        <input type="number" value={data.doorCounts.double40 || ''} onChange={e => handleDoorCount('double40', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Double 5-0">
                        <input type="number" value={data.doorCounts.double50 || ''} onChange={e => handleDoorCount('double50', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Bifold 4-0">
                        <input type="number" value={data.doorCounts.bifold40 || ''} onChange={e => handleDoorCount('bifold40', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Bifold 5-0">
                        <input type="number" value={data.doorCounts.bifold50 || ''} onChange={e => handleDoorCount('bifold50', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Bifold 3-0">
                        <input type="number" value={data.doorCounts.bifold30 || ''} onChange={e => handleDoorCount('bifold30', e.target.value)} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>

            <SubSection title="Windows, Crown & Handrail">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <InputGroup label="Window Count">
                        <input type="number" name="windowCount" value={data.windowCount || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Window Case LF">
                        <input type="number" name="windowLF" value={data.windowLF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Crown Moulding Type">
                        <select name="crownType" value={data.crownType ?? ''} onChange={handleChange} className="input-field">
                            <option value="">None</option>
                            {(trimSwitches.crown_types ?? []).map((t: any) => (
                                <option key={t.id} value={t.switch_key}>{t.display}</option>
                            ))}
                        </select>
                    </InputGroup>
                    <InputGroup label="Crown LF">
                        <input type="number" name="crownLF" value={(data.crownLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Handrail Type">
                        <select name="handrailType" value={data.handrailType} onChange={handleChange} className="input-field">
                            <option value="">Select type...</option>
                            {trimSwitches.handrail_types.map((t: any) => (
                                <option key={t.id} value={t.switch_key}>{t.display}</option>
                            ))}
                        </select>
                    </InputGroup>
                    <InputGroup label="Handrail LF">
                        <input type="number" name="handrailLF" value={data.handrailLF || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Handrail Brackets" hint="Wall-mounted bracket count">
                        <input type="number" name="handrailBracketCount" value={(data.handrailBracketCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>

            <SubSection title="Stair Accessories">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    <InputGroup label="Balusters" hint="Individual spindles (EA)">
                        <input type="number" name="balusterCount" value={(data.balusterCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Newel Posts">
                        <input type="number" name="newelCount" value={(data.newelCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Rosettes" hint="Wall rosettes at top/bottom">
                        <input type="number" name="rosetteCount" value={(data.rosetteCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Skirt Board LF" hint="1×12 stair skirt LF">
                        <input type="number" name="skirtBoardLF" value={(data.skirtBoardLF ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="False Treads" hint="Tread caps over existing stairs">
                        <input type="number" name="falseTreadCount" value={(data.falseTreadCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                    <InputGroup label="Stair Sets" hint="Pre-built box stair sets">
                        <input type="number" name="stairSetCount" value={(data.stairSetCount ?? 0) || ''} onChange={handleChange} className="input-field" min="0" />
                    </InputGroup>
                </div>
            </SubSection>
        </SectionCard>
    );
}
