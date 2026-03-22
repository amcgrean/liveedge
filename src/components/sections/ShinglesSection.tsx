import React from 'react';
import { SectionCard, InputGroup } from '../ui/SectionCard';

interface ShinglesData {
    sf: number;
    ridgeLF: number;
    hipLF: number;
}

interface Props {
    data: ShinglesData;
    onChange: (data: ShinglesData) => void;
}

export function ShinglesSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        onChange({ ...data, [name]: parseFloat(value) || 0 });
    };

    return (
        <SectionCard title="7. Shingles" accent="amber">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                <InputGroup label="Roof SF">
                    <input type="number" name="sf" value={data.sf || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Ridge LF">
                    <input type="number" name="ridgeLF" value={data.ridgeLF || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Hip LF">
                    <input type="number" name="hipLF" value={data.hipLF || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
            </div>
        </SectionCard>
    );
}
