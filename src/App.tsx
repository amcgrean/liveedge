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
    basement: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, intWallLF: 0, beamLF: 0, stairCount: 0, headers: [], fhaCeilingHeight: 0, stoopJoistSize: '2x8' },
    firstFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, intWallLF: 0, beamLF: 0, stairCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', garageWallLF: 0 },
    secondFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, intWallLF: 0, beamLF: 0, stairCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', garageWallLF: 0 },
    roof: { sheetingSF: 0, postCount: 0, postSize: '4x4', headerSize: '2x8', headerCount: 0, soffitOverhang: 12 },
    shingles: { sf: 0, ridgeLF: 0, hipLF: 0 },
    siding: { lapType: 'LP', lapProfileSize: '8in', lapSF: 0, shakeType: 'N/A', shakeSF: 0, soffitType: 'LP', soffitSF: 0, porchSoffitType: 'N/A', porchSoffitSF: 0, trimBoardType: 'N/A', trimBoardLF: 0, cornerType: 'N/A', cornerCount: 0, splicers: false },
    trim: { baseType: '', caseType: '', doorCounts: { single68: 0, single80: 0, double30: 0, double40: 0, double50: 0, bifold40: 0, bifold50: 0, bifold30: 0 }, windowCount: 0, windowLF: 0, handrailType: '', handrailLF: 0 },
    hardware: { type: '', counts: { keyed: 0, passage: 0, privacy: 0, dummy: 0, deadbolt: 0, handleset: 0, stopHinged: 0, stopSpring: 0, fingerPull: 0, bifoldKnob: 0, pocketLock: 0, insideTrim: 0 } },
    exteriorDeck: { joistSize: '2x8', beamSize: '2x10', deckingType: 'Treated', deckingLengths: [], railingStyle: 'Treated', railingLF: 0, postCount: 0, stairCount: 0, landing: false },
    windowsDoors: { windowCount: 0, doorCount: 0 },
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

export default function App() {
    const [loading, setLoading] = useState(true);
    const [inputs, setInputs] = useState<JobInputs>(initialInputs);
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [view, setView] = useState<'takeoff' | 'summary'>('takeoff');
    const [darkMode, setDarkMode] = useState(true);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [showValidation, setShowValidation] = useState(false);

    useEffect(() => {
        initializeData().then(() => {
            // Update initial roof sheeting size from loaded data
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

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="text-3xl font-bold text-white mb-2">House Estimator</div>
                <div className="text-slate-300 animate-pulse">Loading takeoff data...</div>
            </div>
        </div>
    );

    return (
        <div className={darkMode ? '' : 'light-mode'} style={!darkMode ? { background: '#f1f5f9', minHeight: '100vh' } : {}}>
            <div className="max-w-7xl mx-auto px-4 py-6">
                {/* Header */}
                <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className={`text-3xl font-extrabold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            House Estimator <span className="text-cyan-400">Takeoff</span>
                        </h1>
                        <p className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>Beisser Lumber Co. Digital Estimator</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Line item count */}
                        <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600 shadow-sm border border-slate-200'}`}>
                            <span className="text-cyan-400 font-bold">{lineItems.length}</span> line items
                            {warnCount > 0 && <span className="ml-2 text-amber-400">⚠ {warnCount} warnings</span>}
                        </div>

                        {/* Dark/Light toggle */}
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            title="Toggle dark/light mode"
                        >
                            {darkMode ? '☀ Light' : '🌙 Dark'}
                        </button>

                        <button
                            onClick={() => setView(view === 'takeoff' ? 'summary' : 'takeoff')}
                            className={`px-4 py-2 rounded-lg font-semibold transition shadow-sm ${darkMode ? 'bg-slate-900/70 border border-white/15 text-slate-100 hover:bg-slate-800' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                        >
                            {view === 'takeoff' ? 'Bid Summary' : 'Back to Takeoff'}
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={lineItems.length === 0}
                            className="px-6 py-2 rounded-lg font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition shadow-md disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                        >
                            Export Agility CSV
                        </button>
                    </div>
                </header>

                {/* Validation errors */}
                {showValidation && validationErrors.length > 0 && (
                    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <p className="font-semibold text-red-400 mb-2">Please fix the following before exporting:</p>
                        <ul className="list-disc list-inside space-y-1">
                            {validationErrors.map((e, i) => <li key={i} className="text-red-300 text-sm">{e}</li>)}
                        </ul>
                    </div>
                )}

                {view === 'takeoff' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main form */}
                        <div className="lg:col-span-2 space-y-4">
                            <JobSetupSection data={inputs.setup} onChange={(val) => setInputs({ ...inputs, setup: val })} />
                            <MaterialSelectionSection data={inputs.materials} onChange={(val) => setInputs({ ...inputs, materials: val })} />
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
                            <SidingSectionComp data={inputs.siding} onChange={(val) => setInputs({ ...inputs, siding: val })} />
                            <TrimSectionComp data={inputs.trim} onChange={(val) => setInputs({ ...inputs, trim: val })} />
                            <HardwareSectionComp data={inputs.hardware} lookups={dataCache.hardwareLookup || []} onChange={(val) => setInputs({ ...inputs, hardware: val })} />
                            <ExteriorDeckSectionComp data={inputs.exteriorDeck} onChange={(val) => setInputs({ ...inputs, exteriorDeck: val })} />
                            <WindowsDoorsSectionComp data={inputs.windowsDoors} onChange={(val) => setInputs({ ...inputs, windowsDoors: val })} />
                            <OptionsSectionComp data={inputs.options} onChange={(val) => setInputs({ ...inputs, options: val })} />
                        </div>

                        {/* Sticky sidebar */}
                        <div className="lg:col-span-1">
                            <div className={`sticky top-6 rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-900/80 border-white/15 shadow-xl shadow-slate-950/30' : 'bg-white border-slate-200 shadow-lg'}`}>
                                <div className={`p-4 font-bold flex justify-between items-center border-b ${darkMode ? 'bg-slate-950/90 text-white border-white/10' : 'bg-slate-50 text-slate-900 border-slate-200'}`}>
                                    <span>Estimate Review</span>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-cyan-400 text-slate-950 px-2 py-0.5 rounded text-xs font-bold">{lineItems.length} items</span>
                                        {warnCount > 0 && <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-xs font-bold">⚠ {warnCount}</span>}
                                    </div>
                                </div>
                                <div className="divide-y divide-slate-800 max-h-[75vh] overflow-y-auto">
                                    {lineItems.length === 0 && (
                                        <div className="p-8 text-center">
                                            <p className={`text-sm italic ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No items yet. Enter dimensions to see your estimate.</p>
                                        </div>
                                    )}
                                    {lineItems.map((item, idx) => (
                                        <div key={idx} className={`p-3 hover:bg-slate-800/40 transition-colors ${item.warning ? 'border-l-2 border-amber-500' : ''}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`font-medium text-sm leading-tight ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{item.description}</span>
                                                <span className="font-bold text-cyan-300 text-sm whitespace-nowrap ml-2">{item.qty} {item.uom}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className={`text-[10px] font-mono uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{item.sku}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{item.group}</span>
                                            </div>
                                            {item.warning && (
                                                <div className="mt-1.5 text-[11px] bg-amber-500/10 text-amber-300 p-1.5 rounded border border-amber-500/20 font-medium">
                                                    {item.warning}
                                                </div>
                                            )}
                                        </div>
                                    ))}
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
