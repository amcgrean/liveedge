import React from 'react';
import { HardwareSection as HardwareSectionType, HardwareLookup } from '../../types/estimate';
import { SectionCard, InputGroup, SubSection } from '../ui/SectionCard';

interface Props {
    data: HardwareSectionType;
    lookups: HardwareLookup[];
    onChange: (data: HardwareSectionType) => void;
}

const FUNC_LABELS: Record<string, string> = {
    keyed:      'Keyed Entry',
    passage:    'Passage',
    privacy:    'Privacy',
    dummy:      'Dummy',
    deadbolt:   'Deadbolt',
    handleset:  'Handleset',
    stopHinged: 'Door Stop — Hinged',
    stopSpring: 'Door Stop — Spring',
    fingerPull: 'Finger Pull',
    bifoldKnob: 'Bifold Knob',
    pocketLock: 'Pocket Lock',
    insideTrim: 'Inside Trim',
};

export function HardwareSectionComp({ data, lookups, onChange }: Props) {
    const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        onChange({ ...data, counts: { ...data.counts, [name]: parseInt(value) || 0 } });
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange({ ...data, type: e.target.value });
    };

    return (
        <SectionCard title="10. Door Hardware" accent="rose">
            <SubSection title="Hardware Style">
                <InputGroup label="Hardware Type / Finish">
                    <select value={data.type} onChange={handleTypeChange} className="input-field">
                        <option value="">Select a style...</option>
                        {lookups.map((l) => (
                            <option key={l.display_name} value={l.display_name}>
                                {l.display_name}
                            </option>
                        ))}
                    </select>
                </InputGroup>
            </SubSection>

            <SubSection title="Function Counts">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {(Object.keys(data.counts) as Array<keyof typeof data.counts>).map((func) => (
                        <InputGroup key={func} label={FUNC_LABELS[func] ?? func}>
                            <input
                                type="number"
                                name={func}
                                value={data.counts[func] || ''}
                                onChange={handleCountChange}
                                className="input-field"
                                min="0"
                                placeholder="0"
                            />
                        </InputGroup>
                    ))}
                </div>
            </SubSection>
        </SectionCard>
    );
}
