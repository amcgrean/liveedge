'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
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
import { TopNav } from './components/nav/TopNav';
import { OpenBidModal } from './components/bids/OpenBidModal';
import { SaveBidModal } from './components/bids/SaveBidModal';
import { FolderOpen, Save, FilePlus, AlertCircle } from 'lucide-react';

const initialInputs: JobInputs = {
  setup: { branch: 'grimes', estimatorName: '', customerName: '', customerCode: '', jobName: '' },
  materials: { plateType: 'Treated', wallSize: '2x4', triplePlate: false, tyvekType: 'Standard 9ft', roofSheetingSize: '7/16" OSB' },
  basement: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x4_12ft: 0, ext2x4_14ft: 0, ext2x4_16ft: 0, ext2x4_20ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, ext2x6_12ft: 0, ext2x6_14ft: 0, ext2x6_16ft: 0, ext2x6_20ft: 0, ext2x4_lsl_8ft: 0, ext2x4_lsl_9ft: 0, ext2x4_lsl_10ft: 0, ext2x6_lsl_8ft: 0, ext2x6_lsl_9ft: 0, ext2x6_lsl_10ft: 0, intWallLF: 0, bearingWallLF: 0, finishWallLF: 0, rimLF: 0, beamLF: 0, beam2x8LF: 0, beam2x10LF: 0, beam2x12LF: 0, beamLVLLF: 0, beamSteelLF: 0, stairCount: 0, pocketFrameCount: 0, headers: [], fhaCeilingHeight: 0, fhaPostCount: 0, stoopJoistSize: '2x8', stoopSF: 0, stoopRimLF: 0, stoopDowSF: 0, stoopHangerCount: 0 },
  firstFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x4_12ft: 0, ext2x4_14ft: 0, ext2x4_16ft: 0, ext2x4_20ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, ext2x6_12ft: 0, ext2x6_14ft: 0, ext2x6_16ft: 0, ext2x6_20ft: 0, ext2x4_lsl_8ft: 0, ext2x4_lsl_9ft: 0, ext2x4_lsl_10ft: 0, ext2x6_lsl_8ft: 0, ext2x6_lsl_9ft: 0, ext2x6_lsl_10ft: 0, intWallLF: 0, bearingWallLF: 0, finishWallLF: 0, rimLF: 0, beamLF: 0, beam2x8LF: 0, beam2x10LF: 0, beam2x12LF: 0, beamLVLLF: 0, beamSteelLF: 0, stairCount: 0, pocketFrameCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', tjiLF: 0, joistSize: '2x10', joistCount: 0, facemountQty: 0, gypsumSF: 0, garageWallLF: 0 },
  secondFloor: { ext2x4_8ft: 0, ext2x4_9ft: 0, ext2x4_10ft: 0, ext2x4_12ft: 0, ext2x4_14ft: 0, ext2x4_16ft: 0, ext2x4_20ft: 0, ext2x6_8ft: 0, ext2x6_9ft: 0, ext2x6_10ft: 0, ext2x6_12ft: 0, ext2x6_14ft: 0, ext2x6_16ft: 0, ext2x6_20ft: 0, ext2x4_lsl_8ft: 0, ext2x4_lsl_9ft: 0, ext2x4_lsl_10ft: 0, ext2x6_lsl_8ft: 0, ext2x6_lsl_9ft: 0, ext2x6_lsl_10ft: 0, intWallLF: 0, bearingWallLF: 0, finishWallLF: 0, rimLF: 0, beamLF: 0, beam2x8LF: 0, beam2x10LF: 0, beam2x12LF: 0, beamLVLLF: 0, beamSteelLF: 0, stairCount: 0, pocketFrameCount: 0, headers: [], deckSF: 0, deckType: 'Edge T&G', tjiSize: '11-7/8', tjiLF: 0, joistSize: '2x10', joistCount: 0, facemountQty: 0, gypsumSF: 0, garageWallLF: 0 },
  roof: { sheetingSF: 0, postCount: 0, postSize: '4x4', headerSize: '2x8', headerCount: 0, soffitOverhang: 12, valleyCount: 0, rakeLF: 0, soffitLF: 0, gableSF: 0, valley_flash_rolls: 0, hucqCount: 0, vycorLF: 0, roofGypsumSF: 0 },
  shingles: { sf: 0, ridgeLF: 0, hipLF: 0, ridgecatLF: 0, starterLF: 0, roofVentCount: 0, iceWaterLF: 0 },
  siding: { lapType: 'LP', lapProfileSize: '8in', lapSF: 0, shakeType: 'N/A', shakeSF: 0, soffitType: 'LP', soffitSF: 0, porchSoffitType: 'N/A', porchSoffitSF: 0, trimBoardType: 'N/A', trimBoardLF: 0, cornerType: 'N/A', cornerCount: 0, splicers: false, trim1x2LF: 0, trim1x4LF: 0, trim1x6LF: 0, trim1x8LF: 0, trim1x12LF: 0, trim5_4x4LF: 0, trim5_4x6LF: 0, trim5_4x8LF: 0, trim5_4x12LF: 0, jChannelLF: 0, undersillLF: 0, metalStartLF: 0 },
  trim: { baseType: '', baseLF: 0, caseType: '', doorCounts: { single68: 0, single80: 0, double30: 0, double40: 0, double50: 0, bifold40: 0, bifold50: 0, bifold30: 0, slab28: 0, slab30: 0, pocket28: 0, pocket30: 0, barnDoor28: 0, barnDoor30: 0 }, windowCount: 0, windowLF: 0, handrailType: '', handrailLF: 0, handrailBracketCount: 0, crownType: '', crownLF: 0, chairRailLF: 0, shoeLF: 0, baseLFBasement: 0, balusterCount: 0, newelCount: 0, rosetteCount: 0, skirtBoardLF: 0, falseTreadCount: 0, stairSetCount: 0 },
  hardware: { type: '', counts: { keyed: 0, passage: 0, privacy: 0, dummy: 0, deadbolt: 0, handleset: 0, stopHinged: 0, stopSpring: 0, fingerPull: 0, bifoldKnob: 0, pocketLock: 0, insideTrim: 0 } },
  exteriorDeck: { deckSF: 0, joistSize: '2x8', joistSpacing: 16, beamSize: '2x10', beamSpan: 8, glulamBeamLF: 0, hurricaneTieCount: 0, deckingType: 'Treated', deckingLengths: [], railingStyle: 'Treated', railingLF: 0, postCount: 0, postHeight: 8, ledgerLF: 0, facemountQty: 0, stairCount: 0, landing: false },
  partyWall: { lf: 0, height: 9, gypsumLayers: 1, framingSize: '2x4' as const },
  windowsDoors: { windowCount: 0, doors: [] },
  options: [],
};

function validateInputs(inputs: JobInputs): string[] {
  const errors: string[] = [];
  if (!inputs.setup.branch) errors.push('Branch is required');
  if (!inputs.setup.estimatorName.trim()) errors.push('Estimator name is required');
  if (!inputs.setup.customerName.trim()) errors.push('Customer name is required');
  if (!inputs.setup.jobName.trim()) errors.push('Job name is required');
  return errors;
}

interface Props {
  session: Session;
  initialBidId?: string;
}

export default function TakeoffApp({ session, initialBidId }: Props) {
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<JobInputs>(initialInputs);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [view, setView] = useState<'takeoff' | 'summary'>('takeoff');
  const [darkMode, setDarkMode] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  // Bid persistence state
  const [currentBidId, setCurrentBidId] = useState<string | null>(null);
  const [currentBidNumber, setCurrentBidNumber] = useState<string | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingProfile, setPendingProfile] = useState<any>(null);
  const [dismissedForCustomer, setDismissedForCustomer] = useState('');

  const userRole = (session.user as { role?: string }).role ?? 'estimator';

  useEffect(() => {
    initializeData().then(async () => {
      const osbTypes = dataCache.osbSheeting?.roof_sheeting_types || [];
      if (osbTypes.length > 0) {
        setInputs((prev) => ({
          ...prev,
          materials: { ...prev.materials, roofSheetingSize: osbTypes[1]?.display || osbTypes[0]?.display },
        }));
      }

      // Load bid from URL query param (?bid=id)
      if (initialBidId) {
        try {
          const res = await fetch(`/api/bids/${initialBidId}`);
          if (res.ok) {
            const data = await res.json();
            setInputs(data.bid.inputs as JobInputs);
            setCurrentBidId(data.bid.id);
            setCurrentBidNumber(data.bid.bidNumber);
          }
        } catch { /* silently ignore */ }
      }

      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleInputChange = useCallback((updater: (prev: JobInputs) => JobInputs) => {
    setInputs(updater);
    setHasUnsavedChanges(true);
  }, []);

  const handleNewBid = () => {
    if (hasUnsavedChanges && !confirm('You have unsaved changes. Start a new bid anyway?')) return;
    setInputs(initialInputs);
    setCurrentBidId(null);
    setCurrentBidNumber(null);
    setHasUnsavedChanges(false);
    setShowValidation(false);
  };

  const handleBidLoaded = (loadedInputs: JobInputs, bidId: string, bidNumber: string) => {
    setInputs(loadedInputs);
    setCurrentBidId(bidId);
    setCurrentBidNumber(bidNumber);
    setHasUnsavedChanges(false);
    setView('takeoff');
  };

  const handleBidSaved = (bidId: string, bidNumber: string) => {
    setCurrentBidId(bidId);
    setCurrentBidNumber(bidNumber);
    setHasUnsavedChanges(false);
  };

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

  useEffect(() => {
    const name = inputs.setup.customerName.trim().toLowerCase();
    if (!name || name === dismissedForCustomer) { setPendingProfile(null); return; }
    const profiles: any[] = dataCache.customerProfiles?.profiles ?? [];
    const match = profiles.find((p: any) => p.customer_name.toLowerCase() === name);
    setPendingProfile(match ?? null);
  }, [inputs.setup.customerName, dismissedForCustomer]);

  const applyCustomerProfile = () => {
    if (!pendingProfile) return;
    handleInputChange((prev) => ({
      ...prev,
      materials: { ...prev.materials, ...pendingProfile.materials },
      firstFloor: { ...prev.firstFloor, deckType: pendingProfile.floorDefaults?.deckType ?? prev.firstFloor.deckType },
      secondFloor: { ...prev.secondFloor, deckType: pendingProfile.floorDefaults?.deckType ?? prev.secondFloor.deckType },
    }));
    setDismissedForCustomer(inputs.setup.customerName.trim().toLowerCase());
    setPendingProfile(null);
  };

  const warnCount = lineItems.filter((i) => i.warning).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl font-bold text-white mb-2">House Estimator</div>
          <div className="text-slate-300 animate-pulse">Loading takeoff data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? '' : 'light-mode'} style={!darkMode ? { background: '#f1f5f9', minHeight: '100vh' } : {}}>
      {/* Top Navigation */}
      <TopNav userName={session.user?.name} userRole={userRole} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-extrabold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              House Estimator <span className="text-cyan-400">Takeoff</span>
            </h1>
            {currentBidNumber ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`font-mono text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {currentBidNumber}
                </span>
                {hasUnsavedChanges && (
                  <span className="text-amber-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Unsaved changes
                  </span>
                )}
              </div>
            ) : (
              <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                LiveEdge · New Bid
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Item count badge */}
            <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600 shadow-sm border border-slate-200'}`}>
              <span className="text-cyan-400 font-bold">{lineItems.length}</span> items
              {warnCount > 0 && <span className="ml-2 text-amber-400">⚠ {warnCount}</span>}
            </div>

            {/* Bid actions */}
            <button
              onClick={handleNewBid}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                darkMode
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="New bid"
            >
              <FilePlus className="w-3.5 h-3.5" /> New
            </button>

            <button
              onClick={() => setShowOpenModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                darkMode
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" /> Open
            </button>

            <button
              onClick={() => setShowSaveModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                hasUnsavedChanges
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                  : darkMode
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              {currentBidId ? 'Update' : 'Save'}
            </button>

            {/* Dark/Light toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
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
              Export CSV
            </button>
          </div>
        </header>

        {/* Validation errors */}
        {showValidation && validationErrors.length > 0 && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="font-semibold text-red-400 mb-2">Fix these before exporting:</p>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((e, i) => (
                <li key={i} className="text-red-300 text-sm">{e}</li>
              ))}
            </ul>
          </div>
        )}

        {pendingProfile && (
          <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 flex items-center justify-between gap-4">
            <p className={`text-sm font-semibold ${darkMode ? 'text-cyan-200' : 'text-cyan-900'}`}>
              Apply <span className="font-extrabold">{pendingProfile.label}</span> defaults? (wall size, plate type, Tyvek, deck type)
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={applyCustomerProfile} className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 transition">Apply</button>
              <button onClick={() => { setDismissedForCustomer(inputs.setup.customerName.trim().toLowerCase()); setPendingProfile(null); }} className="px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/10 transition">Dismiss</button>
            </div>
          </div>
        )}

        {view === 'takeoff' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main form */}
            <div className="lg:col-span-2 space-y-4">
              <JobSetupSection data={inputs.setup} onChange={(val) => handleInputChange((p) => ({ ...p, setup: val }))} />
              <MaterialSelectionSection data={inputs.materials} onChange={(val) => handleInputChange((p) => ({ ...p, materials: val }))} />
              <BasementSectionComp data={inputs.basement} onChange={(val) => handleInputChange((p) => ({ ...p, basement: val }))} />
              <FloorSectionComp
                sectionNumber={4}
                title="First Floor Deck & Walls"
                data={inputs.firstFloor}
                onChange={(val) => handleInputChange((p) => ({ ...p, firstFloor: val }))}
              />
              <FloorSectionComp
                sectionNumber={5}
                title="Second Floor Deck & Walls"
                data={inputs.secondFloor}
                onChange={(val) => handleInputChange((p) => ({ ...p, secondFloor: val }))}
              />
              <RoofSectionComp data={inputs.roof} onChange={(val) => handleInputChange((p) => ({ ...p, roof: val }))} />
              <ShinglesSectionComp data={inputs.shingles} onChange={(val) => handleInputChange((p) => ({ ...p, shingles: val }))} />
              <SidingSectionComp data={inputs.siding} onChange={(val) => handleInputChange((p) => ({ ...p, siding: val }))} />
              <TrimSectionComp data={inputs.trim} onChange={(val) => handleInputChange((p) => ({ ...p, trim: val }))} />
              <HardwareSectionComp data={inputs.hardware} lookups={dataCache.hardwareLookup || []} onChange={(val) => handleInputChange((p) => ({ ...p, hardware: val }))} />
              <ExteriorDeckSectionComp data={inputs.exteriorDeck} onChange={(val) => handleInputChange((p) => ({ ...p, exteriorDeck: val }))} />
              <PartyWallSectionComp data={inputs.partyWall} onChange={(val) => handleInputChange((p) => ({ ...p, partyWall: val }))} />
              <WindowsDoorsSectionComp data={inputs.windowsDoors} onChange={(val) => handleInputChange((p) => ({ ...p, windowsDoors: val }))} />
              <OptionsSectionComp data={inputs.options} onChange={(val) => handleInputChange((p) => ({ ...p, options: val }))} />
            </div>

            {/* Sticky sidebar */}
            <div className="lg:col-span-1">
              <div className={`sticky top-20 rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-900/80 border-white/15 shadow-xl shadow-slate-950/30' : 'bg-white border-slate-200 shadow-lg'}`}>
                <div className={`p-4 font-bold flex justify-between items-center border-b ${darkMode ? 'bg-slate-950/90 text-white border-white/10' : 'bg-slate-50 text-slate-900 border-slate-200'}`}>
                  <span>Estimate Review</span>
                  <div className="flex items-center gap-2">
                    <span className="bg-cyan-400 text-slate-950 px-2 py-0.5 rounded text-xs font-bold">{lineItems.length} items</span>
                    {warnCount > 0 && <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-xs font-bold">⚠ {warnCount}</span>}
                  </div>
                </div>
                <div className="divide-y divide-slate-800 max-h-[70vh] overflow-y-auto">
                  {lineItems.length === 0 && (
                    <div className="p-8 text-center">
                      <p className={`text-sm italic ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        No items yet. Enter dimensions to see your estimate.
                      </p>
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
          <BidSummary inputs={inputs} lineItems={lineItems} />
        )}
      </div>

      {/* Modals */}
      <OpenBidModal
        open={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onLoad={handleBidLoaded}
      />
      <SaveBidModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        inputs={inputs}
        lineItems={lineItems}
        currentBidId={currentBidId}
        currentBidNumber={currentBidNumber}
        onSaved={handleBidSaved}
      />
    </div>
  );
}
