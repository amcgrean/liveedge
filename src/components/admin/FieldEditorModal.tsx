import React, { useState, useEffect } from 'react';
import { AdminFieldDefinition, AdminDataType } from '../../types/admin';
import { X } from 'lucide-react';

interface Props {
    field: AdminFieldDefinition | null;
    open: boolean;
    onClose: () => void;
    onSave: (field: AdminFieldDefinition) => void;
}

export function FieldEditorModal({ field, open, onClose, onSave }: Props) {
    const [formData, setFormData] = useState<Partial<AdminFieldDefinition>>({});

    useEffect(() => {
        if (field) {
            setFormData({ ...field });
        } else {
            setFormData({
                id: `field-${Date.now()}`,
                section: '',
                label: '',
                path: '',
                dataType: 'string',
                required: false,
                metricsPriority: 'medium',
                description: '',
            });
        }
    }, [field, open]);

    if (!open) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as AdminFieldDefinition);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-lg">
                        {field ? 'Edit Field Definition' : 'New Field Definition'}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
                    <div className="p-6 space-y-4 flex-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Label</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.label || ''}
                                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">JSON Path</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                                    value={formData.path || ''}
                                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Section</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.section || ''}
                                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Data Type</label>
                                <select
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                                    value={formData.dataType || 'string'}
                                    onChange={(e) => setFormData({ ...formData, dataType: e.target.value as AdminDataType })}
                                >
                                    <option value="string">String</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="enum">Enum</option>
                                    <option value="array">Array</option>
                                    <option value="object">Object</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Metrics Priority</label>
                                <select
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                                    value={formData.metricsPriority || 'medium'}
                                    onChange={(e) => setFormData({ ...formData, metricsPriority: e.target.value as any })}
                                >
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                            <div className="flex flex-col justify-end pb-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        checked={formData.required || false}
                                        onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                                    />
                                    <span className="text-sm font-semibold text-slate-700">Required Field</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Description / Tooltip</label>
                            <textarea
                                required
                                rows={3}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                            Save Field
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
