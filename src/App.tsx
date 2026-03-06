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
import { HardHat, FileSpreadsheet, FileDown, ArrowLeft, Loader2, Calculator } from 'lucide-react';

const initialInputs: JobInputs = {
    setup: { branch: 'grimes', estimatorName: '', customerName: '', customerCode: '', jobName: '' },
    materials: { plateType: 'Treated', wallSize: '2x4', triplePlate: false, tyvekType: 'Standard 9ft', roofSheetingSize: '7/16 OSB' },
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

export default function App() {
    const [loading, setLoading] = useState(true);
    const [inputs, setInputs] = useState<JobInputs>(initialInputs);
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [view, setView] = useState<'takeoff' | 'summary'>('takeoff');

    useEffect(() => {
        initializeData().then(() => setLoading(false));
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
        downloadCsv(lineItems, inputs.setup);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-slate-500 bg-slate-50">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-lg font-medium animate-pulse">Loading architectural takeoff data...</p>
            </div>
        );
    }

    return (
        <div className="pb-12">
            {/* Premium Header */}
            <div className="bg-white/70 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <header className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
                                <HardHat className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
                                    House Estimator <span className="text-blue-600 font-extrabold">Pro</span>
                                </h1>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
                                    Beisser Lumber Co. Digital Takeoff
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setView(view === 'takeoff' ? 'summary' : 'takeoff')}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm focus:ring-4 focus:ring-slate-100 outline-none"
                            >
                                {view === 'takeoff' ? (
                                    <><FileSpreadsheet size={18} /> Show Bid Summary</>
                                ) : (
                                    <><ArrowLeft size={18} /> Back to Takeoff</>
                                )}
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={lineItems.length === 0}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none focus:ring-4 focus:ring-blue-500/30 outline-none"
                            >
                                <FileDown size={18} /> Export CSV
                            </button>
                        </div>
                    </header>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                {view === 'takeoff' ? (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        <div className="xl:col-span-8 space-y-6">
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

                        <div className="xl:col-span-4 translate-y-0 xl:-translate-y-8 pointer-events-none">
                            <div className="estimate-sidebar pointer-events-auto mt-0 xl:mt-8">
                                <div className="card border-0 ring-1 ring-slate-200/50 shadow-xl shadow-slate-200/40 bg-white/90">
                                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
                                        <div className="flex items-center gap-2">
                                            <Calculator className="text-blue-600 w-5 h-5" />
                                            <span className="font-bold text-slate-800 text-lg">Live Estimate</span>
                                        </div>
                                        <span className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-full text-xs tracking-wide shadow-inner">
                                            {lineItems.length} ITEMS
                                        </span>
                                    </div>
                                    <div className="p-0 divide-y divide-slate-100 max-h-[calc(100vh-12rem)] overflow-y-auto custom-scrollbar">
                                        {lineItems.length === 0 && (
                                            <div className="p-12 text-center flex flex-col items-center justify-center">
                                                <Calculator className="w-12 h-12 text-slate-200 mb-4" />
                                                <p className="text-slate-400 text-sm font-medium">No items yet.<br />Enter dimensions to generate takeoff.</p>
                                            </div>
                                        )}
                                        {lineItems.map((item, idx) => (
                                            <div key={idx} className="p-4 hover:bg-blue-50/50 transition-colors group">
                                                <div className="flex justify-between items-start mb-1.5 gap-2">
                                                    <span className="font-semibold text-slate-800 text-sm leading-tight group-hover:text-blue-900 transition-colors">
                                                        {item.description}
                                                    </span>
                                                    <span className="font-bold text-blue-600 text-sm whitespace-nowrap bg-blue-50 px-2 rounded">
                                                        {item.qty} <span className="text-xs opacity-75">{item.uom}</span>
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">
                                                        {item.sku}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                                                        {item.group}
                                                    </span>
                                                </div>
                                                {item.warning && (
                                                    <div className="mt-3 text-[11px] bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-100 font-medium flex items-center gap-2">
                                                        <span className="relative flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                        </span>
                                                        {item.warning}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <BidSummary inputs={inputs} lineItems={lineItems} />
                )}
            </div>
        </div>
    );
}
