import React, { useEffect, useMemo, useState } from 'react';
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
import { PartyWallSectionComp } from './components/sections/PartyWallSection';
import { OptionsSectionComp } from './components/sections/OptionsSection';
import { downloadCsv } from './utils/export';
import { BidSummary } from './components/BidSummary';
import { AdminDashboard } from './components/admin/AdminDashboard';
import {
    HardHat,
    FileSpreadsheet,
    FileDown,
    ArrowLeft,
    Loader2,
    Calculator,
    ShieldCheck,
    RotateCcw,
    ArrowUp,
    Search,
    CircleAlert,
    CheckCircle2,
    Clock3
} from 'lucide-react';

const STORAGE_KEY = 'beisser-takeoff-inputs-v1';

const initialInputs: JobInputs = {
    setup: { branch: 'grimes', estimatorName: '', customerName: '', customerCode: '', jobName: '' },
    materials: { plateType: 'Treated', wallSize: '2x4', triplePlate: false, tyvekType: 'Standard 9ft', roofSheetingSize: '7/16 OSB' },
    basement: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x4_12ft: 0, ext2x4_14ft: 0, ext2x4_16ft: 0, ext2x4_20ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, ext2x6_12ft: 0, ext2x6_14ft: 0, ext2x6_16ft: 0, ext2x6_20ft: 0, ext2x4_lsl_8ft: 0, ext2x4_lsl_9ft: 0, ext2x4_lsl_10ft: 0, ext2x6_lsl_8ft: 0, ext2x6_lsl_9ft: 0, ext2x6_lsl_10ft: 0, intWallLF: 0, bearingWallLF: 0, finishWallLF: 0, rimLF: 0, beamLF: 0, beam2x8LF: 0, beam2x10LF: 0, beam2x12LF: 0, beamLVLLF: 0, beamSteelLF: 0, stairCount: 0, pocketFrameCount: 0, headers: [], fhaCeilingHeight: 0, fhaPostCount: 0, stoopJoistSize: '2x8', stoopSF: 0, stoopRimLF: 0, stoopDowSF: 0, stoopHangerCount: 0 },
    firstFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x4_12ft: 0, ext2x4_14ft: 0, ext2x4_16ft: 0, ext2x4_20ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, ext2x6_12ft: 0, ext2x6_14ft: 0, ext2x6_16ft: 0, ext2x6_20ft: 0, ext2x4_lsl_8ft: 0, ext2x4_lsl_9ft: 0, ext2x4_lsl_10ft: 0, ext2x6_lsl_8ft: 0, ext2x6_lsl_9ft: 0, ext2x6_lsl_10ft: 0, intWallLF: 0, bearingWallLF: 0, finishWallLF: 0, rimLF: 0, beamLF: 0, beam2x8LF: 0, beam2x10LF: 0, beam2x12LF: 0, beamLVLLF: 0, beamSteelLF: 0, stairCount: 0, pocketFrameCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', tjiCount: 0, joistSize: '2x10', joistCount: 0, facemountQty: 0, gypsumSF: 0, garageWallLF: 0 },
    secondFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x4_12ft: 0, ext2x4_14ft: 0, ext2x4_16ft: 0, ext2x4_20ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, ext2x6_12ft: 0, ext2x6_14ft: 0, ext2x6_16ft: 0, ext2x6_20ft: 0, ext2x4_lsl_8ft: 0, ext2x4_lsl_9ft: 0, ext2x4_lsl_10ft: 0, ext2x6_lsl_8ft: 0, ext2x6_lsl_9ft: 0, ext2x6_lsl_10ft: 0, intWallLF: 0, bearingWallLF: 0, finishWallLF: 0, rimLF: 0, beamLF: 0, beam2x8LF: 0, beam2x10LF: 0, beam2x12LF: 0, beamLVLLF: 0, beamSteelLF: 0, stairCount: 0, pocketFrameCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', tjiCount: 0, joistSize: '2x10', joistCount: 0, facemountQty: 0, gypsumSF: 0, garageWallLF: 0 },
    roof: { sheetingSF: 0, postCount: 0, postSize: '4x4', headerSize: '2x8', headerCount: 0, soffitOverhang: 12, valleyCount: 0, rakeLF: 0, soffitLF: 0, gableSF: 0, valley_flash_rolls: 0 },
    shingles: { sf: 0, ridgeLF: 0, hipLF: 0, ridgecatLF: 0, starterLF: 0, roofVentCount: 0, iceWaterLF: 0 },
    siding: { lapType: 'LP', lapProfileSize: '8in', lapSF: 0, shakeType: 'N/A', shakeSF: 0, soffitType: 'LP', soffitSF: 0, porchSoffitType: 'N/A', porchSoffitSF: 0, trimBoardType: 'N/A', trimBoardLF: 0, cornerType: 'N/A', cornerCount: 0, splicers: false, trim1x2LF: 0, trim1x4LF: 0, trim1x6LF: 0, trim1x8LF: 0, trim1x12LF: 0, trim5_4x4LF: 0, trim5_4x6LF: 0, trim5_4x8LF: 0, trim5_4x12LF: 0, jChannelLF: 0, undersillLF: 0, metalStartLF: 0 },
    trim: { baseType: '', baseLF: 0, caseType: '', doorCounts: { single68: 0, single80: 0, double30: 0, double40: 0, double50: 0, bifold40: 0, bifold50: 0, bifold30: 0, slab28: 0, slab30: 0, pocket28: 0, pocket30: 0 }, windowCount: 0, windowLF: 0, handrailType: '', handrailLF: 0, handrailBracketCount: 0, crownType: '', crownLF: 0, balusterCount: 0, newelCount: 0, rosetteCount: 0, skirtBoardLF: 0, falseTreadCount: 0, stairSetCount: 0 },
    hardware: { type: '', counts: { keyed: 0, passage: 0, privacy: 0, dummy: 0, deadbolt: 0, handleset: 0, stopHinged: 0, stopSpring: 0, fingerPull: 0, bifoldKnob: 0, pocketLock: 0, insideTrim: 0 } },
    exteriorDeck: { deckSF: 0, joistSize: '2x8', joistSpacing: 16, beamSize: '2x10', beamSpan: 8, deckingType: 'Treated', deckingLengths: [], railingStyle: 'Treated', railingLF: 0, postCount: 0, postHeight: 8, ledgerLF: 0, facemountQty: 0, stairCount: 0, landing: false },
    partyWall: { lf: 0, height: 9, gypsumLayers: 1, framingSize: '2x4' },
    windowsDoors: { windowCount: 0, doors: [] },
    options: []
};

const takeoffSections = [
    { id: 'section-job-setup', label: 'Job Setup' },
    { id: 'section-materials', label: 'Materials' },
    { id: 'section-basement', label: 'Basement' },
    { id: 'section-first-floor', label: '1st Floor' },
    { id: 'section-second-floor', label: '2nd Floor' },
    { id: 'section-roof', label: 'Roof' },
    { id: 'section-shingles', label: 'Shingles' },
    { id: 'section-siding', label: 'Siding' },
    { id: 'section-trim', label: 'Trim' },
    { id: 'section-hardware', label: 'Hardware' },
    { id: 'section-exterior-deck', label: 'Ext Deck' },
    { id: 'section-party-wall', label: 'Party Wall' },
    { id: 'section-windows-doors', label: 'Windows/Doors' },
    { id: 'section-options', label: 'Options' },
];


export default function App() {
    const [loading, setLoading] = useState(true);
    const [inputs, setInputs] = useState<JobInputs>(initialInputs);
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [view, setView] = useState<'takeoff' | 'summary' | 'admin'>('takeoff');
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [itemFilter, setItemFilter] = useState('');
    const [pendingProfile, setPendingProfile] = useState<any>(null);
    const [dismissedForCustomer, setDismissedForCustomer] = useState('');
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

    const requiredChecks = useMemo(() => {
        const missing: string[] = [];
        if (!inputs.setup.estimatorName.trim()) missing.push('Estimator name');
        if (!inputs.setup.customerName.trim()) missing.push('Customer name');
        if (!inputs.setup.customerCode.trim()) missing.push('Customer code');
        if (!inputs.setup.jobName.trim()) missing.push('Job name');
        if (!inputs.trim.baseType.trim()) missing.push('Trim base type');
        if (!inputs.trim.caseType.trim()) missing.push('Trim case type');
        if (!inputs.hardware.type.trim()) missing.push('Door hardware type');
        return missing;
    }, [inputs]);

    const completedSections = useMemo(() => {
        const sectionStatus = [
            inputs.setup.estimatorName && inputs.setup.customerName && inputs.setup.customerCode && inputs.setup.jobName,
            !!inputs.materials.roofSheetingSize,
            inputs.basement.ext2x4_8ft + inputs.basement.ext2x4_9ft + inputs.basement.ext2x4_10ft + inputs.basement.ext2x6_8ft + inputs.basement.ext2x6_9ft + inputs.basement.ext2x6_10ft + inputs.basement.intWallLF > 0,
            inputs.firstFloor.deckSF + inputs.firstFloor.intWallLF + inputs.firstFloor.garageWallLF > 0,
            inputs.secondFloor.deckSF + inputs.secondFloor.intWallLF + inputs.secondFloor.garageWallLF > 0,
            inputs.roof.sheetingSF > 0,
            inputs.shingles.sf > 0,
            inputs.siding.lapSF + inputs.siding.shakeSF + inputs.siding.soffitSF > 0,
            !!inputs.trim.baseType && !!inputs.trim.caseType,
            !!inputs.hardware.type,
            inputs.exteriorDeck.railingLF + inputs.exteriorDeck.postCount + inputs.exteriorDeck.stairCount > 0,
            inputs.windowsDoors.windowCount + inputs.windowsDoors.doors.length > 0,
            true,
        ];
        return sectionStatus.filter(Boolean).length;
    }, [inputs]);

    const warningsCount = useMemo(() => lineItems.filter(item => !!item.warning).length, [lineItems]);

    const filteredLineItems = useMemo(() => {
        const query = itemFilter.trim().toLowerCase();
        if (!query) return lineItems;
        return lineItems.filter((item) =>
            item.description.toLowerCase().includes(query) ||
            item.group.toLowerCase().includes(query) ||
            item.sku.toLowerCase().includes(query)
        );
    }, [lineItems, itemFilter]);

    const groupedItemCounts = useMemo(() => {
        return filteredLineItems.reduce<Record<string, number>>((acc, item) => {
            acc[item.group] = (acc[item.group] || 0) + 1;
            return acc;
        }, {});
    }, [filteredLineItems]);

    useEffect(() => {
        initializeData().then(() => {
            try {
                const saved = window.localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    setInputs(JSON.parse(saved) as JobInputs);
                }
            } catch (error) {
                console.warn('Unable to load saved estimate.', error);
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

            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
            setLastSavedAt(new Date());
        }
    }, [inputs, loading]);

    useEffect(() => {
        const onScroll = () => setShowBackToTop(window.scrollY > 500);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const name = inputs.setup.customerName.trim().toLowerCase();
        if (!name || name === dismissedForCustomer) { setPendingProfile(null); return; }
        const profiles: any[] = dataCache.customerProfiles?.profiles ?? [];
        const match = profiles.find((p: any) => p.customer_name.toLowerCase() === name);
        setPendingProfile(match ?? null);
    }, [inputs.setup.customerName, dismissedForCustomer]);

    const applyCustomerProfile = () => {
        if (!pendingProfile) return;
        setInputs((prev) => ({
            ...prev,
            materials: { ...prev.materials, ...pendingProfile.materials },
            firstFloor: { ...prev.firstFloor, deckType: pendingProfile.floorDefaults?.deckType ?? prev.firstFloor.deckType },
            secondFloor: { ...prev.secondFloor, deckType: pendingProfile.floorDefaults?.deckType ?? prev.secondFloor.deckType },
        }));
        setDismissedForCustomer(inputs.setup.customerName.trim().toLowerCase());
        setPendingProfile(null);
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                if (requiredChecks.length === 0 && lineItems.length > 0) {
                    downloadCsv(lineItems, inputs.setup);
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [inputs.setup, lineItems, requiredChecks.length]);

    const handleExport = () => {
        if (requiredChecks.length > 0) return;
        downloadCsv(lineItems, inputs.setup);
    };

    const handleResetEstimate = () => {
        const confirmed = window.confirm('Reset all estimate inputs and clear autosaved data?');
        if (!confirmed) return;
        setInputs(initialInputs);
        setLineItems([]);
        setItemFilter('');
        window.localStorage.removeItem(STORAGE_KEY);
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
                                    LiveEdge
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">
                                        <CheckCircle2 size={13} /> {completedSections}/{takeoffSections.length} sections active
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-semibold">
                                        <Clock3 size={13} />
                                        {lastSavedAt ? `Autosaved ${lastSavedAt.toLocaleTimeString()}` : 'Autosave idle'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => setView(view === 'summary' ? 'takeoff' : 'summary')}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm focus:ring-4 focus:ring-slate-100 outline-none"
                            >
                                {view === 'summary' ? (
                                    <><ArrowLeft size={18} /> Back to Takeoff</>
                                ) : (
                                    <><FileSpreadsheet size={18} /> Show Bid Summary</>
                                )}
                            </button>
                            <button
                                onClick={() => setView(view === 'admin' ? 'takeoff' : 'admin')}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm focus:ring-4 focus:ring-slate-100 outline-none"
                            >
                                {view === 'admin' ? (
                                    <><ArrowLeft size={18} /> Back to Takeoff</>
                                ) : (
                                    <><ShieldCheck size={18} /> Admin Portal Plan</>
                                )}
                            </button>
                            <button
                                onClick={handleResetEstimate}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                            >
                                <RotateCcw size={18} /> Reset
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={lineItems.length === 0 || requiredChecks.length > 0}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none focus:ring-4 focus:ring-blue-500/30 outline-none"
                                title="Shortcut: Ctrl/Cmd + E"
                            >
                                <FileDown size={18} /> Export CSV
                            </button>
                        </div>
                    </header>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                {view === 'takeoff' ? (
                    <>
                        {requiredChecks.length > 0 && (
                            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900">
                                <p className="font-semibold text-sm flex items-center gap-2">
                                    <CircleAlert size={16} /> Complete required fields before export ({requiredChecks.length} missing)
                                </p>
                                <p className="text-xs mt-1">Missing: {requiredChecks.join(', ')}</p>
                            </div>
                        )}

                        {pendingProfile && (
                            <div className="mb-5 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 flex items-center justify-between gap-4">
                                <p className="text-sm font-semibold text-cyan-900">
                                    Apply <span className="font-extrabold">{pendingProfile.label}</span> defaults? (wall size, plate type, Tyvek, deck type)
                                </p>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button onClick={applyCustomerProfile} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-700 transition">Apply</button>
                                    <button onClick={() => { setDismissedForCustomer(inputs.setup.customerName.trim().toLowerCase()); setPendingProfile(null); }} className="px-3 py-1.5 rounded-lg bg-white border border-cyan-200 text-cyan-800 text-xs font-semibold hover:bg-cyan-50 transition">Dismiss</button>
                                </div>
                            </div>
                        )}

                        <div className="mb-4 rounded-2xl bg-white/80 border border-slate-200 p-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Quick Jump</p>
                            <div className="flex flex-wrap gap-2">
                                {takeoffSections.map((section) => (
                                    <button
                                        key={section.id}
                                        onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-blue-50 hover:text-blue-700"
                                    >
                                        {section.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                            <div className="xl:col-span-8 space-y-2">
                                <div id="section-job-setup"><JobSetupSection data={inputs.setup} onChange={(val) => setInputs({ ...inputs, setup: val })} /></div>
                                <div id="section-materials"><MaterialSelectionSection data={inputs.materials} onChange={(val) => setInputs({ ...inputs, materials: val })} /></div>
                                <div id="section-basement"><BasementSectionComp data={inputs.basement} onChange={(val) => setInputs({ ...inputs, basement: val })} /></div>
                                <div id="section-first-floor"><FloorSectionComp
                                    sectionNumber={4}
                                    title="First Floor Deck & Walls"
                                    data={inputs.firstFloor}
                                    onChange={(val) => setInputs({ ...inputs, firstFloor: val })}
                                /></div>
                                <div id="section-second-floor"><FloorSectionComp
                                    sectionNumber={5}
                                    title="Second Floor Deck & Walls"
                                    data={inputs.secondFloor}
                                    onChange={(val) => setInputs({ ...inputs, secondFloor: val })}
                                /></div>
                                <div id="section-roof"><RoofSectionComp data={inputs.roof} onChange={(val) => setInputs({ ...inputs, roof: val })} /></div>
                                <div id="section-shingles"><ShinglesSectionComp data={inputs.shingles} onChange={(val) => setInputs({ ...inputs, shingles: val })} /></div>
                                <div id="section-siding"><SidingSectionComp data={inputs.siding} onChange={(val) => setInputs({ ...inputs, siding: val })} /></div>
                                <div id="section-trim"><TrimSectionComp data={inputs.trim} onChange={(val) => setInputs({ ...inputs, trim: val })} /></div>
                                <div id="section-hardware"><HardwareSectionComp data={inputs.hardware} lookups={dataCache.hardwareLookup || []} onChange={(val) => setInputs({ ...inputs, hardware: val })} /></div>
                                <div id="section-exterior-deck"><ExteriorDeckSectionComp data={inputs.exteriorDeck} onChange={(val) => setInputs({ ...inputs, exteriorDeck: val })} /></div>
                                <div id="section-party-wall"><PartyWallSectionComp data={inputs.partyWall} onChange={(val) => setInputs({ ...inputs, partyWall: val })} /></div>
                                <div id="section-windows-doors"><WindowsDoorsSectionComp data={inputs.windowsDoors} onChange={(val) => setInputs({ ...inputs, windowsDoors: val })} /></div>
                                <div id="section-options"><OptionsSectionComp data={inputs.options} onChange={(val) => setInputs({ ...inputs, options: val })} /></div>
                            </div>

                            <div className="xl:col-span-4 translate-y-0 xl:-translate-y-8 pointer-events-none">
                                <div className="estimate-sidebar pointer-events-auto mt-0 xl:mt-8">
                                    <div className="card border-0 ring-1 ring-slate-200/50 shadow-xl shadow-slate-200/40 bg-white/90">
                                        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white space-y-3">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <Calculator className="text-blue-600 w-5 h-5" />
                                                    <span className="font-bold text-slate-800 text-lg">Live Estimate</span>
                                                </div>
                                                <span className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-full text-xs tracking-wide shadow-inner">
                                                    {filteredLineItems.length}/{lineItems.length} ITEMS
                                                </span>
                                            </div>
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    value={itemFilter}
                                                    onChange={(e) => setItemFilter(e.target.value)}
                                                    className="input-field pl-9 py-2"
                                                    placeholder="Filter by SKU, group, description"
                                                />
                                            </div>
                                            {warningsCount > 0 && (
                                                <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md">
                                                    {warningsCount} item warning{warningsCount === 1 ? '' : 's'} need review before final export.
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-1.5">
                                                {Object.entries(groupedItemCounts).slice(0, 6).map(([group, count]) => (
                                                    <span key={group} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                                                        {group}: {count}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="p-0 divide-y divide-slate-100 max-h-[calc(100vh-16rem)] overflow-y-auto custom-scrollbar">
                                            {filteredLineItems.length === 0 && (
                                                <div className="p-12 text-center flex flex-col items-center justify-center">
                                                    <Calculator className="w-12 h-12 text-slate-200 mb-4" />
                                                    <p className="text-slate-400 text-sm font-medium">No items match.<br />Adjust filters or input dimensions.</p>
                                                </div>
                                            )}
                                            {filteredLineItems.map((item, idx) => (
                                                <div key={`${item.sku}-${idx}`} className="p-4 hover:bg-blue-50/50 transition-colors group">
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
                    </>
                ) : view === 'summary' ? (
                    <BidSummary inputs={inputs} lineItems={lineItems} />
                ) : (
                    <AdminDashboard />
                )}
            </div>

            {showBackToTop && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-6 right-6 rounded-full p-3 bg-blue-600 text-white shadow-lg hover:bg-blue-700 z-40"
                    aria-label="Back to top"
                >
                    <ArrowUp size={18} />
                </button>
            )}
        </div>
    );
}
