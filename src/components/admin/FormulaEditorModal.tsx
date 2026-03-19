import React, { useState, useEffect } from 'react';
import { FormulaDefinition } from '../../types/admin';
import { X, Plus, Trash2 } from 'lucide-react';

interface Props {
    formula: FormulaDefinition | null;
    open: boolean;
    onClose: () => void;
    onSave: (formula: FormulaDefinition) => void;
}

export function FormulaEditorModal({ formula, open, onClose, onSave }: Props) {
    const [formData, setFormData] = useState<Partial<FormulaDefinition>>({});
    const [newInput, setNewInput] = useState('');

    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [open]);

    useEffect(() => {
        if (formula) {
            setFormData({ ...formula });
        } else {
            setFormData({
                id: `formula-${Date.now()}`,
                name: '',
                output: '',
                owner: 'Custom Engine',
                status: 'draft',
                inputs: [],
                expression: '',
                notes: '',
            });
        }
    }, [formula, open]);

    if (!open) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as FormulaDefinition);
        onClose();
    };

    const handleAddInput = () => {
        if (newInput.trim() && !formData.inputs?.includes(newInput.trim())) {
            setFormData({
                ...formData,
                inputs: [...(formData.inputs || []), newInput.trim()]
            });
            setNewInput('');
        }
    };

    const handleRemoveInput = (inputToRemove: string) => {
        setFormData({
            ...formData,
            inputs: formData.inputs?.filter(i => i !== inputToRemove)
        });
    };

    const handleRemoveInputByClick = (e: React.MouseEvent, inputToRemove: string) => {
        e.preventDefault();
        handleRemoveInput(inputToRemove);
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-lg">
                        {formula ? 'Edit Formula' : 'New Formula'}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
                    <div className="p-6 space-y-4 flex-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Formula Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Output Line Item</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-xs"
                                    value={formData.output || ''}
                                    onChange={(e) => setFormData({ ...formData, output: e.target.value })}
                                    placeholder="e.g. lineItems[Roof.OSB]"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                                <select
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                                    value={formData.status || 'draft'}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                >
                                    <option value="active">Active</option>
                                    <option value="draft">Draft</option>
                                    <option value="needs-review">Needs Review</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Owner / Engine</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.owner || ''}
                                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Dependent Inputs</label>
                            <div className="flex gap-2 mb-2">
                                <input 
                                    type="text"
                                    className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-xs"
                                    placeholder="Enter field path (e.g. roof.sheetingSF)"
                                    value={newInput}
                                    onChange={(e) => setNewInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddInput();
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddInput}
                                    className="px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 border border-slate-300 flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg min-h-[60px]">
                                {formData.inputs?.length === 0 && <span className="text-sm text-slate-400 italic">No inputs defined.</span>}
                                {formData.inputs?.map((input) => (
                                    <span key={input} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700">
                                        {input}
                                        <button 
                                            onClick={(e) => handleRemoveInputByClick(e, input)}
                                            className="text-slate-400 hover:text-rose-500 p-0.5 rounded"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Expression</label>
                            <textarea
                                required
                                rows={4}
                                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono bg-slate-900 text-slate-100 placeholder-slate-500 leading-relaxed"
                                value={formData.expression || ''}
                                onChange={(e) => setFormData({ ...formData, expression: e.target.value })}
                                placeholder="sum(exteriorStudInputs) * multiplier"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Notes & Audit</label>
                            <textarea
                                rows={2}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                                value={formData.notes || ''}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                            Save Formula
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
