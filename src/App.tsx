import React, { useEffect, useState } from 'react';
import { initializeData, dataCache } from './utils/lookup';
import { JobInputs, LineItem } from './types/estimate';
import { calculateEstimate } from './calculations/engine';
import { JobSetupSection } from './components/sections/JobSetupSection';
import { MaterialSelectionSection } from './components/sections/MaterialSelectionSection';
import { BasementSectionComp } from './components/sections/BasementSection';
import { FloorSectionComp } from './components/sections/FloorSection';
import { RoofSectionComp } from './components/sections/RoofSection';
import { ShinglesSectionComp } from './components/sections/ShinglesSection';
import { SidingSectionComp } from './components/sections/SidingSection';
import { TrimSectionComp } from './components/sections/TrimSection';
import { HardwareSectionComp } from './components/sections/HardwareSection';
import { ExteriorDeckSectionComp } from './components/sections/ExteriorDeckSection';
import { WindowsDoorsSectionComp } from './components/sections/WindowsDoorsSection';
import { OptionsSectionComp } from './components/sections/OptionsSection';
import { downloadCsv } from './utils/export';
import { BidSummary } from './components/BidSummary';

const initialInputs: JobInputs = {
    setup: { branch: 'grimes', estimatorName: '', customerName: '', customerCode: '', jobName: '' },
    materials: { plateType: 'Treated', wallSize: '2x4', triplePlate: false, tyvekType: 'Standard 9ft', roofSheetingSize: '7/16" OSB' },
    basement: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, intWallLF: 0, beamLF: 0, stairCount: 0, headers: [], fhaCeilingHeight: 0, fhaPostCount: 0, stoopJoistSize: '2x8', stoopSF: 0 },
    firstFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, intWallLF: 0, beamLF: 0, stairCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', tjiCount: 0, garageWallLF: 0 },
    secondFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, intWallLF: 0, beamLF: 0, stairCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', tjiCount: 0, garageWallLF: 0 },
    roof: { sheetingSF: 0, postCount: 0, postSize: '4x4', headerSize: '2x8', headerCount: 0, soffitOverhang: 12 },
    shingles: { sf: 0, ridgeLF: 0, hipLF: 0 },
    siding: { lapType: 'LP', lapProfileSize: '8in', lapSF: 0, shakeType: 'N/A', shakeSF: 0, soffitType: 'LP', soffitSF: 0, porchSoffitType: 'N/A', porchSoffitSF: 0, trimBoardType: 'N/A', trimBoardLF: 0, cornerType: 'N/A', cornerCount: 0, splicers: false },
    trim: { baseType: '', baseLF: 0, caseType: '', doorCounts: { single68: 0, single80: 0, double30: 0, double40: 0, double50: 0, bifold40: 0, bifold50: 0, bifold30: 0 }, windowCount: 0, windowLF: 0, handrailType: '', handrailLF: 0 },
    hardware: { type: '', counts: { keyed: 0, passage: 0, privacy: 0, dummy: 0, deadbolt: 0, handleset: 0, stopHinged: 0, stopSpring: 0, fingerPull: 0, bifoldKnob: 0, pocketLock: 0, insideTrim: 0 } },
    exteriorDeck: { deckSF: 0, joistSize: '2x8', beamSize: '2x10', deckingType: 'Treated', deckingLengths: [], railingStyle: 'Treated', railingLF: 0, postCount: 0, stairCount: 0, landing: false },
    windowsDoors: { windowCount: 0, doors: [] },
    options: []
};

function validateInputs(inputs: JobInputs): string[] {
    const errors: string[] = [];
    if (!inputs.setup.branch) errors.push('Branch is required');
    if (!inputs.setup.estimatorName.trim()) errors.push('Estimator name is required');
    if (!inputs.setup.customerName.trim()) errors.push('Customer name is required');
    if (!inputs.setup.jobName.trim()) errors.push('Job name is required');
    return errors;
}

// Group items by group label for sidebar display
function groupItems(items: LineItem[]): Record<string, LineItem[]> {
    return items.reduce((acc, item) => {
        (acc[item.group] = acc[item.group] || []).push(item);
        return acc;
    }, {} as Record<string, LineItem[]>);
}

export default function App() {
    const [loading, setLoading] = useState(true);
    const [inputs, setInputs] = useState<JobInputs>(initialInputs);
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [view, setView] = useState<'takeoff' | 'summary'>('takeoff');
    const [darkMode, setDarkMode] = useState(true);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [showValidation, setShowValidation] = useState(false);
    const [sidebarGrouped, setSidebarGrouped] = useState(false);

    useEffect(() => {
        initializeData().then(() => {
            const osbTypes = dataCache.osbSheeting?.roof_sheeting_types || [];
            if (osbTypes.length > 0) {
                setInputs(prev => ({
                    ...prev,
                    materials: { ...prev.materials, roofSheetingSize: osbTypes[1]?.display || osbTypes[0]?.display }
                }));
            }
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        if (!loading) {
            const items = calculateEstimate(inputs, {
                multipliers: dataCache.multipliers,
                hardwareMatrix: dataCache.hardwareMatrix,
                hardwareLookup: dataCache.hardwareLookup,
                engineeredLumber: dataCache.engineeredLumber,
                branches: dataCache.branches,
                trimSwitches: dataCache.trimSwitches,
                railingMatrix: dataCache.railingMatrix,
                osbSheeting: dataCache.osbSheeting,
                doorStyles: dataCache.doorStyles,
                customerOverrides: dataCache.customerOverrides,
            });
            setLineItems(items);
        }
    }, [inputs, loading]);

    const handleExport = () => {
        const errors = validateInputs(inputs);
        if (errors.length > 0) {
            setValidationErrors(errors);
            setShowValidation(true);
            return;
        }
        setShowValidation(false);
        downloadCsv(lineItems, inputs.setup);
    };

    const warnCount = lineItems.filter(i => i.warning).length;
    const grouped = groupItems(lineItems);
    const groupNames = Object.keys(grouped);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center space-y-4">
                <div className="w-12 h-12 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <div>
                    <div className="text-xl font-bold text-white">Beisser Lumber Co.</div>
                    <div className="text-slate-400 text-sm mt-1 animate-pulse">Loading takeoff data...</div>
                </div>
            </div>
        </div>
    );

    return (
        <div className={darkMode ? '' : 'light-mode'} style={!darkMode ? { background: '#f0f4f8', minHeight: '100vh' } : {}}>
            <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-5">

                {/* ── Header ── */}
                <header className="mb-6">
                    <div className={`rounded-2xl border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${darkMode ? 'bg-slate-900/80 border-white/10 shadow-xl' : 'bg-white border-slate-200 shadow-md'}`}>
                        {/* Brand */}
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12 12 2.25 21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                                </svg>
                            </div>
                            <div>
                                <h1 className={`text-lg font-bold leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    House Estimator <span className="text-cyan-400 font-extrabold">Takeoff</span>
                                </h1>
                                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Beisser Lumber Co. &mdash; Digital Estimating Tool</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                            {/* Stats */}
                            <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                <span className="text-cyan-400 font-bold">{lineItems.length}</span> items
                                {warnCount > 0 && (
                                    <span className="flex items-center gap-1 text-amber-400 font-semibold ml-1 pl-2 border-l border-slate-600">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>
                                        {warnCount}
                                    </span>
                                )}
                            </div>

                            {/* Mode toggle */}
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                title="Toggle theme"
                            >
                                {darkMode ? '☀ Light' : '🌙 Dark'}
                            </button>

                            {/* View toggle */}
                            <button
                                onClick={() => setView(view === 'takeoff' ? 'summary' : 'takeoff')}
                                className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                            >
                                {view === 'takeoff' ? 'Bid Summary →' : '← Back to Takeoff'}
                            </button>

                            {/* Export */}
                            <button
                                onClick={handleExport}
                                disabled={lineItems.length === 0}
                                className="btn-primary flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Validation banner */}
                    {showValidation && validationErrors.length > 0 && (
                        <div className="mt-3 px-5 py-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            <div>
                                <p className="font-semibold text-red-400 text-sm">Required fields missing:</p>
                                <ul className="mt-1 space-y-0.5">
                                    {validationErrors.map((e, i) => <li key={i} className="text-red-300 text-xs">• {e}</li>)}
                                </ul>
                            </div>
                            <button onClick={() => setShowValidation(false)} className="ml-auto text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
                        </div>
                    )}
                </header>

                {/* ── Main content ── */}
                {view === 'takeoff' ? (
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

                        {/* Form column */}
                        <div className="min-w-0">
                            {/* SETUP */}
                            <div className="section-group-label">Project Setup</div>
                            <JobSetupSection data={inputs.setup} onChange={(val) => setInputs({ ...inputs, setup: val })} />
                            <MaterialSelectionSection data={inputs.materials} onChange={(val) => setInputs({ ...inputs, materials: val })} />

                            {/* FRAMING */}
                            <div className="section-group-label">Framing</div>
                            <BasementSectionComp data={inputs.basement} onChange={(val) => setInputs({ ...inputs, basement: val })} />
                            <FloorSectionComp
                                sectionNumber={4}
                                title="First Floor Deck & Walls"
                                data={inputs.firstFloor}
                                onChange={(val) => setInputs({ ...inputs, firstFloor: val })}
                            />
                            <FloorSectionComp
                                sectionNumber={5}
                                title="Second Floor Deck & Walls"
                                data={inputs.secondFloor}
                                onChange={(val) => setInputs({ ...inputs, secondFloor: val })}
                            />
                            <RoofSectionComp data={inputs.roof} onChange={(val) => setInputs({ ...inputs, roof: val })} />
                            <ShinglesSectionComp data={inputs.shingles} onChange={(val) => setInputs({ ...inputs, shingles: val })} />

                            {/* ENVELOPE */}
                            <div className="section-group-label">Envelope & Finishes</div>
                            <SidingSectionComp data={inputs.siding} onChange={(val) => setInputs({ ...inputs, siding: val })} />
                            <TrimSectionComp data={inputs.trim} onChange={(val) => setInputs({ ...inputs, trim: val })} />
                            <WindowsDoorsSectionComp data={inputs.windowsDoors} onChange={(val) => setInputs({ ...inputs, windowsDoors: val })} />

                            {/* ACCESSORIES */}
                            <div className="section-group-label">Accessories & Extras</div>
                            <HardwareSectionComp data={inputs.hardware} lookups={dataCache.hardwareLookup || []} onChange={(val) => setInputs({ ...inputs, hardware: val })} />
                            <ExteriorDeckSectionComp data={inputs.exteriorDeck} onChange={(val) => setInputs({ ...inputs, exteriorDeck: val })} />
                            <OptionsSectionComp data={inputs.options} onChange={(val) => setInputs({ ...inputs, options: val })} />
                        </div>

                        {/* Sticky sidebar */}
                        <div className="hidden xl:block">
                            <div className={`sticky top-5 rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-900/80 border-white/10 shadow-2xl' : 'bg-white border-slate-200 shadow-lg'}`}>
                                {/* Sidebar header */}
                                <div className={`px-4 py-3 border-b flex items-center justify-between ${darkMode ? 'bg-slate-950/70 border-white/8' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Estimate Preview</span>
                                        <span className="bg-cyan-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded">{lineItems.length}</span>
                                        {warnCount > 0 && <span className="bg-amber-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded">⚠{warnCount}</span>}
                                    </div>
                                    <button
                                        onClick={() => setSidebarGrouped(!sidebarGrouped)}
                                        className={`text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${darkMode ? 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500' : 'border-slate-200 text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {sidebarGrouped ? 'Flat' : 'Grouped'}
                                    </button>
                                </div>

                                {/* Items list */}
                                <div className="max-h-[calc(100vh-160px)] overflow-y-auto">
                                    {lineItems.length === 0 ? (
                                        <div className="px-4 py-12 text-center">
                                            <svg className="w-10 h-10 mx-auto text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                                            </svg>
                                            <p className={`text-xs italic ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Enter dimensions above to see your estimate.</p>
                                        </div>
                                    ) : sidebarGrouped ? (
                                        // Grouped view
                                        groupNames.map(grp => (
                                            <div key={grp}>
                                                <div className={`px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest border-b sticky top-0 ${darkMode ? 'bg-slate-950/90 text-slate-500 border-white/5' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                    {grp} <span className="text-slate-600">({grouped[grp].length})</span>
                                                </div>
                                                {grouped[grp].map((item, idx) => (
                                                    <SidebarItem key={idx} item={item} darkMode={darkMode} />
                                                ))}
                                            </div>
                                        ))
                                    ) : (
                                        // Flat view
                                        lineItems.map((item, idx) => (
                                            <SidebarItem key={idx} item={item} darkMode={darkMode} />
                                        ))
                                    )}
                                </div>

                                {/* Footer with actions */}
                                <div className={`px-4 py-3 border-t ${darkMode ? 'border-white/8 bg-slate-950/50' : 'border-slate-200 bg-slate-50'}`}>
                                    <button
                                        onClick={() => setView('summary')}
                                        className="w-full py-2 rounded-lg text-sm font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-colors"
                                    >
                                        View Bid Summary →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <BidSummary inputs={inputs} lineItems={lineItems} darkMode={darkMode} />
                )}
            </div>
        </div>
    );
}

function SidebarItem({ item, darkMode }: { item: LineItem; darkMode: boolean }) {
    return (
        <div className={`px-4 py-2.5 border-b transition-colors ${darkMode ? 'border-white/5 hover:bg-white/3' : 'border-slate-100 hover:bg-slate-50'} ${item.warning ? 'border-l-2 !border-l-amber-500' : ''}`}>
            <div className="flex justify-between items-start gap-2 mb-0.5">
                <span className={`text-xs font-medium leading-snug flex-1 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{item.description}</span>
                <span className={`text-xs font-bold whitespace-nowrap ${darkMode ? 'text-cyan-300' : 'text-cyan-600'}`}>{item.qty} {item.uom}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-mono ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{item.sku}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{item.group}</span>
            </div>
            {item.warning && (
                <div className="mt-1 text-[10px] text-amber-300 font-medium">{item.warning}</div>
            )}
        </div>
    );
}
