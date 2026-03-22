import React, { useState, useRef, useEffect } from 'react';
import { JobSetup } from '../../types/estimate';
import { SectionCard, InputGroup } from '../ui/SectionCard';
import { dataCache } from '../../utils/lookup';

interface Props {
    data: JobSetup;
    onChange: (data: JobSetup) => void;
}

interface Customer {
    CustomerName: string;
    CustomerCode: string;
}

export function JobSetupSection({ data, onChange }: Props) {
    const [suggestions, setSuggestions] = useState<Customer[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        onChange({ ...data, [e.target.name]: e.target.value });
    };

    const handleCustomerInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onChange({ ...data, customerName: val, customerCode: '' });
        const customers: Customer[] = dataCache.customers || [];
        if (val.length > 0) {
            const filtered = customers.filter(c =>
                c.CustomerName?.toLowerCase().includes(val.toLowerCase())
            ).slice(0, 8);
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setShowSuggestions(false);
        }
    };

    const selectCustomer = (c: Customer) => {
        onChange({ ...data, customerName: c.CustomerName, customerCode: c.CustomerCode });
        setShowSuggestions(false);
    };

    return (
        <SectionCard title="1. Job Setup" defaultExpanded accent="cyan">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <InputGroup label="Branch">
                    <select name="branch" value={data.branch} onChange={handleChange} className="input-field">
                        <option value="grimes">Grimes</option>
                        <option value="fort_dodge">Fort Dodge</option>
                        <option value="coralville">Coralville</option>
                    </select>
                </InputGroup>
                <InputGroup label="Estimator Name">
                    <input type="text" name="estimatorName" value={data.estimatorName} onChange={handleChange} className="input-field" placeholder="Your name" />
                </InputGroup>
                <div className="relative" ref={suggestRef}>
                    <InputGroup label="Customer Name">
                        <input
                            type="text"
                            name="customerName"
                            value={data.customerName}
                            onChange={handleCustomerInput}
                            onFocus={() => { if (data.customerName) handleCustomerInput({ target: { value: data.customerName } } as any); }}
                            className="input-field"
                            placeholder="Type to search customers..."
                            autoComplete="off"
                        />
                    </InputGroup>
                    {showSuggestions && (
                        <div className="absolute z-50 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl mt-1 overflow-hidden">
                            {suggestions.map((c, i) => (
                                <button
                                    key={i}
                                    onClick={() => selectCustomer(c)}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-800 transition text-sm text-slate-100"
                                >
                                    <span className="font-medium">{c.CustomerName}</span>
                                    <span className="ml-2 text-slate-400 text-xs">{c.CustomerCode}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <InputGroup label="Customer Code">
                    <input
                        type="text"
                        name="customerCode"
                        value={data.customerCode}
                        onChange={handleChange}
                        className="input-field bg-slate-100 text-slate-700"
                        placeholder="Auto-populated from customer"
                        readOnly
                    />
                </InputGroup>
                <InputGroup label="Job Name">
                    <input type="text" name="jobName" value={data.jobName} onChange={handleChange} className="input-field" placeholder="Project name" />
                </InputGroup>
            </div>
        </SectionCard>
    );
}
