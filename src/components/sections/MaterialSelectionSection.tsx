import React from 'react';
import { MaterialSelections } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';
import { dataCache } from '../../utils/lookup';

interface Props {
    data: MaterialSelections;
    onChange: (data: MaterialSelections) => void;
}

export function MaterialSelectionSection({ data, onChange }: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        onChange({ ...data, [name]: value });
    };

    const osbTypes: { display: string; sku: string }[] = dataCache.osbSheeting?.roof_sheeting_types || [];

    return (
        <SectionCard title="2. Material Selections">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputGroup label="Plate Type">
                    <select name="plateType" value={data.plateType} onChange={handleChange} className="input-field">
                        <option value="Treated">Treated</option>
                        <option value="Timberstrand">Timberstrand</option>
                    </select>
                </InputGroup>
                <InputGroup label="Wall Size">
                    <select name="wallSize" value={data.wallSize} onChange={handleChange} className="input-field">
                        <option value="2x4">2x4</option>
                        <option value="2x6">2x6</option>
                    </select>
                </InputGroup>
                <InputGroup label="Triple Plate">
                    <select
                        name="triplePlate"
                        value={data.triplePlate ? 'true' : 'false'}
                        onChange={(e) => onChange({ ...data, triplePlate: e.target.value === 'true' })}
                        className="input-field"
                    >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                    </select>
                </InputGroup>
                <InputGroup label="Tyvek / House Wrap">
                    <select name="tyvekType" value={data.tyvekType} onChange={handleChange} className="input-field">
                        <option value="Standard 9ft">Standard 9ft</option>
                        <option value="Standard 10ft">Standard 10ft</option>
                        <option value="Zip Panels">Zip Panels</option>
                        <option value="N/A">N/A</option>
                        <option value="Tape Only">Tape Only</option>
                    </select>
                </InputGroup>
                <InputGroup label="Roof Sheeting Size">
                    <select name="roofSheetingSize" value={data.roofSheetingSize} onChange={handleChange} className="input-field">
                        {osbTypes.length > 0
                            ? osbTypes.map(t => <option key={t.sku} value={t.display}>{t.display}</option>)
                            : <option value="7/16 OSB">7/16 OSB</option>
                        }
                    </select>
                </InputGroup>
            </div>
        </SectionCard>
    );
}
