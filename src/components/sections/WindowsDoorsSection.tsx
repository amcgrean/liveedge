import React from 'react';
import { SectionCard, InputGroup } from '../ui/SectionCard';

interface WindowsDoorsData {
    windowCount: number;
    doorCount: number;
}

interface Props {
    data: WindowsDoorsData;
    onChange: (data: WindowsDoorsData) => void;
}

export function WindowsDoorsSectionComp({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        onChange({ ...data, [name]: parseInt(value) || 0 });
    };

    return (
        <SectionCard title="12. Windows & Doors (Package)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputGroup label="Window Count">
                    <input type="number" name="windowCount" value={data.windowCount || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
                <InputGroup label="Door Count">
                    <input type="number" name="doorCount" value={data.doorCount || ''} onChange={handleChange} className="input-field" min="0" />
                </InputGroup>
            </div>
        </SectionCard>
    );
}
