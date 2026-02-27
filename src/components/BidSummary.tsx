import React, { useState } from 'react';
import { JobInputs, LineItem } from '../types/estimate';

interface Props {
    inputs: JobInputs;
    lineItems: LineItem[];
    darkMode?: boolean;
}

export function BidSummary({ inputs, lineItems, darkMode = true }: Props) {
    const [groupPrices, setGroupPrices] = useState<Record<string, number>>({});

    const groups = Array.from(new Set(lineItems.map(item => item.group)));

    const handlePriceChange = (group: string, price: string) => {
        setGroupPrices({ ...groupPrices, [group]: parseFloat(price) || 0 });
    };

    const materialSubtotal = Object.values(groupPrices).reduce((a, b) => a + b, 0);
    const tax = materialSubtotal * 0.07;
    const optionsTotal = inputs.options.reduce((s, o) => s + o.price, 0);
    const total = materialSubtotal + tax + optionsTotal;

    return (
        <div className="max-w-4xl mx-auto my-8">
            <div className="bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:my-0 print:rounded-none">
                {/* Header bar */}
                <div className="bg-slate-900 text-white px-8 py-6 flex justify-between items-end print:bg-slate-900">
                    <div>
                        <h1 className="text-2xl font-bold uppercase tracking-wider">Estimate Bid Summary</h1>
                        <p className="text-slate-400 text-sm mt-1">Beisser Lumber Co.</p>
                    </div>
                    <div className="text-right text-sm text-slate-300">
                        <p><span className="font-semibold text-white">Date:</span> {new Date().toLocaleDateString()}</p>
                        <p><span className="font-semibold text-white">Estimator:</span> {inputs.setup.estimatorName || '—'}</p>
                    </div>
                </div>

                <div className="px-8 py-6">
                    {/* Job info */}
                    <div className="grid grid-cols-2 gap-8 mb-8 pb-6 border-b border-slate-200">
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Customer</h3>
                            <p className="text-lg font-semibold text-slate-900">{inputs.setup.customerName || '—'}</p>
                            {inputs.setup.customerCode && <p className="text-sm text-slate-500">Code: {inputs.setup.customerCode}</p>}
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Job Name</h3>
                            <p className="text-lg font-semibold text-slate-900">{inputs.setup.jobName || '—'}</p>
                            <p className="text-sm text-slate-500 capitalize">{inputs.setup.branch?.replace('_', ' ')} Branch</p>
                        </div>
                    </div>

                    {/* Material group pricing */}
                    <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4">Material Group Pricing</h2>
                    <p className="text-xs text-slate-400 mb-4 -mt-2">Enter prices after receiving quotes from Agility ERP</p>
                    <table className="w-full mb-6">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-2 text-sm font-bold text-slate-600">Material Group</th>
                                <th className="text-right py-2 text-sm font-bold text-slate-600">Item Count</th>
                                <th className="text-right py-2 text-sm font-bold text-slate-600 w-36">Price ($)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groups.map(group => {
                                const groupCount = lineItems.filter(i => i.group === group).length;
                                return (
                                    <tr key={group}>
                                        <td className="py-2 text-slate-700">{group}</td>
                                        <td className="py-2 text-right text-slate-400 text-sm">{groupCount}</td>
                                        <td className="py-2">
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                value={groupPrices[group] || ''}
                                                onChange={(e) => handlePriceChange(group, e.target.value)}
                                                className="w-full text-right border border-slate-200 rounded px-2 py-1 text-slate-900 text-sm focus:border-cyan-400 focus:outline-none print:border-none print:placeholder-transparent"
                                                min="0"
                                                step="0.01"
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 font-bold">
                                <td className="py-3 text-slate-900" colSpan={2}>Materials Subtotal</td>
                                <td className="py-3 text-right">${materialSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                            <tr>
                                <td className="py-1 text-slate-500 font-normal" colSpan={2}>Sales Tax (7%)</td>
                                <td className="py-1 text-right text-slate-500 font-normal">${tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Options section */}
                    {inputs.options.length > 0 && (
                        <div className="mb-6">
                            <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4">Options & Alternates</h2>
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-2 text-sm font-bold text-slate-600">Description</th>
                                        <th className="text-right py-2 text-sm font-bold text-slate-600 w-36">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {inputs.options.map((opt, i) => (
                                        <tr key={i}>
                                            <td className="py-2 text-slate-700">{opt.description || `Option ${i + 1}`}</td>
                                            <td className={`py-2 text-right font-medium ${opt.price >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {opt.price >= 0 ? '+' : ''}{opt.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-slate-200">
                                        <td className="py-2 text-slate-600 font-medium">Options Total</td>
                                        <td className={`py-2 text-right font-bold ${optionsTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {optionsTotal >= 0 ? '+' : ''}{optionsTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* Bid Total */}
                    <div className="bg-slate-900 text-white rounded-xl p-6 flex justify-between items-center">
                        <div>
                            <p className="text-slate-400 text-sm">Materials + Tax + Options</p>
                            <p className="text-2xl font-extrabold">Bid Total</p>
                        </div>
                        <p className="text-3xl font-extrabold text-cyan-300">
                            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>

                    {/* Print button */}
                    <div className="mt-6 flex justify-end print:hidden">
                        <button
                            onClick={() => window.print()}
                            className="px-6 py-2 rounded-lg font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition"
                        >
                            Print / Save PDF
                        </button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
                        <p>This estimate is valid for 30 days. Prices subject to change based on market fluctuations.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
