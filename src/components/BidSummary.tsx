import React, { useState } from 'react';
import { JobInputs, LineItem } from '../types/estimate';
import { Calculator, Calendar, FileText, UserCircle } from 'lucide-react';

interface Props {
    inputs: JobInputs;
    lineItems: LineItem[];
}

export function BidSummary({ inputs, lineItems }: Props) {
    const [groupPrices, setGroupPrices] = useState<Record<string, number>>({});

    const groups = Array.from(new Set(lineItems.map(item => item.group)));

    const handlePriceChange = (group: string, price: string) => {
        setGroupPrices({ ...groupPrices, [group]: parseFloat(price) || 0 });
    };

    const subtotal = Object.values(groupPrices).reduce((a, b) => a + b, 0);
    const tax = subtotal * 0.07;
    const optionsTotal = inputs.options.reduce((s, o) => s + o.price, 0);
    const total = subtotal + tax + optionsTotal;

    return (
        <div className="card p-8 md:p-12 bg-white/95 backdrop-blur-3xl shadow-2xl max-w-4xl mx-auto my-8 print:shadow-none print:my-0 rounded-3xl border border-white/50">
            <div className="border-b border-slate-200/60 pb-8 mb-8 flex flex-col md:flex-row justify-between md:items-end gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Calculator className="w-8 h-8 text-blue-600" />
                        Bid Summary
                    </h1>
                    <p className="text-slate-500 font-medium text-lg mt-1 ml-11">Beisser Lumber Co.</p>
                </div>
                <div className="flex flex-col gap-2 text-sm text-slate-600 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="font-semibold w-20">Date:</span>
                        {new Date().toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-slate-400" />
                        <span className="font-semibold w-20">Estimator:</span>
                        {inputs.setup.estimatorName || <span className="text-slate-400 italic">Not set</span>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-6 rounded-2xl border border-blue-100/50">
                    <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <UserCircle className="w-4 h-4" /> Customer Details
                    </h3>
                    <p className="text-xl font-bold text-slate-900 mb-1">{inputs.setup.customerName || 'Unknown Customer'}</p>
                    <p className="text-sm font-medium text-slate-500 bg-white/60 px-2 py-1 rounded inline-block">Code: {inputs.setup.customerCode || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Project
                    </h3>
                    <p className="text-xl font-bold text-slate-900">{inputs.setup.jobName || 'Unnamed Project'}</p>
                    <p className="text-sm font-medium text-slate-500 mt-1">Delivery: {inputs.setup.branch.replace('_', ' ').toUpperCase()}</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                            <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Material Group</th>
                            <th className="py-4 px-6 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-48">Estimated Price</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {groups.length === 0 && (
                            <tr>
                                <td colSpan={2} className="py-8 text-center text-slate-400 italic">No items estimated yet.</td>
                            </tr>
                        )}
                        {groups.map(group => (
                            <tr key={group} className="hover:bg-slate-50/50 transition-colors group/row text-slate-700">
                                <td className="py-3 px-6 font-medium font-sans">{group}</td>
                                <td className="py-3 px-6 relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-medium group-hover/row:text-slate-600 transition-colors">$</span>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={groupPrices[group] || ''}
                                        onChange={(e) => handlePriceChange(group, e.target.value)}
                                        className="w-full text-right outline-none bg-transparent font-medium focus:text-blue-600 transition-colors print:placeholder-transparent"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50/50">
                        <tr className="border-t border-slate-200">
                            <td className="py-4 px-6 font-bold text-slate-600 text-right">Subtotal</td>
                            <td className="py-4 px-6 text-right font-bold text-slate-800">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        <tr>
                            <td className="py-2 px-6 font-medium text-slate-500 text-right">Sales Tax <span className="text-xs bg-slate-200/50 px-1 rounded ml-1">7%</span></td>
                            <td className="py-2 px-6 text-right font-medium text-slate-500">${tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="border-t-2 border-slate-900 bg-white">
                            <td className="py-6 px-6 font-black text-slate-900 text-xl text-right tracking-tight">TOTAL ESTIMATE</td>
                            <td className="py-6 px-6 text-right font-black text-blue-600 text-2xl tracking-tight">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {inputs.options.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mt-6">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Options & Alternates</th>
                                <th className="py-4 px-6 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-48">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {inputs.options.map((opt, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors group/row text-slate-700">
                                    <td className="py-3 px-6 font-medium font-sans">{opt.description || `Option ${i + 1}`}</td>
                                    <td className={`py-3 px-6 text-right font-medium ${opt.price >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {opt.price >= 0 ? '+' : ''}{opt.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50/50">
                            <tr className="border-t border-slate-200">
                                <td className="py-4 px-6 font-bold text-slate-600 text-right">Options Total</td>
                                <td className={`py-4 px-6 text-right font-bold ${optionsTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {optionsTotal >= 0 ? '+' : ''}{optionsTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            <div className="mt-12 pt-8 border-t border-slate-200 text-center text-xs font-medium text-slate-400 print:mt-16">
                <p>This estimate is valid for 30 days. Prices are subject to change based on market fluctuations.</p>
                <p className="mt-1">Generated by Beisser Lumber Co. Takeoff Engine.</p>
            </div>
        </div>
    );
}
