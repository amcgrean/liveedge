'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPresetCategories } from '@/lib/takeoff/presets';
import { formatMeasurement } from '@/lib/takeoff/calculations';
import type { GroupState } from '@/hooks/useMeasurementReducer';

interface MeasurementSidebarProps {
  groups: GroupState[];
  activePresetId: string | null;
  sessionName: string;
  bidJobName?: string;
  onSelectPreset: (groupId: string | null) => void;
  onHighlightGroup: (groupId: string) => void;
  onAddCustomGroup: () => void;
}

export function MeasurementSidebar({
  groups,
  activePresetId,
  sessionName,
  bidJobName,
  onSelectPreset,
  onHighlightGroup,
  onAddCustomGroup,
}: MeasurementSidebarProps) {
  const categories = getPresetCategories();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Group the groups by category
  const groupsByCategory: Record<string, GroupState[]> = {};
  for (const g of groups) {
    const cat = g.category ?? 'Custom';
    if (!groupsByCategory[cat]) groupsByCategory[cat] = [];
    groupsByCategory[cat].push(g);
  }

  // All categories (standard + any custom ones)
  const allCategories = [...categories];
  for (const cat of Object.keys(groupsByCategory)) {
    if (!allCategories.includes(cat)) allCategories.push(cat);
  }

  return (
    <div className="w-full flex-shrink-0 border-l border-white/10 bg-slate-900/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center gap-2 text-white font-medium text-sm">
          <Layers className="w-4 h-4 text-cyan-400" />
          Takeoff Presets
        </div>
        {bidJobName && (
          <div className="text-xs text-slate-500 mt-1 truncate">{bidJobName}</div>
        )}
        {sessionName && (
          <div className="text-xs text-slate-400 truncate">{sessionName}</div>
        )}
      </div>

      {/* Preset categories */}
      <div className="flex-1 overflow-y-auto">
        {allCategories.map((cat) => {
          const catGroups = groupsByCategory[cat] ?? [];
          if (catGroups.length === 0) return null;
          const isCollapsed = collapsed[cat];

          // Category totals
          const catTotal = catGroups.reduce((sum, g) => sum + g.runningTotal, 0);
          const catUnit = catGroups[0]?.unit ?? '';
          const hasMeasurements = catGroups.some((g) => g.runningTotal > 0);

          return (
            <div key={cat} className="border-b border-white/5">
              <button
                onClick={() => toggleCollapse(cat)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800/50 transition"
              >
                <div className="flex items-center gap-1.5">
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  {cat}
                </div>
                {hasMeasurements && (
                  <span className="text-slate-500 font-normal normal-case">
                    {catTotal.toFixed(1)} {catUnit}
                  </span>
                )}
              </button>

              {!isCollapsed && (
                <div className="pb-1">
                  {catGroups.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => onSelectPreset(group.id === activePresetId ? null : group.id)}
                      onDoubleClick={() => onHighlightGroup(group.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-4 py-1.5 text-left text-xs transition',
                        group.id === activePresetId
                          ? 'bg-cyan-500/10 text-white'
                          : group.runningTotal > 0
                            ? 'text-slate-300 hover:bg-slate-800/50'
                            : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                      )}
                    >
                      {/* Color swatch */}
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/10"
                        style={{ backgroundColor: group.color }}
                      />

                      {/* Name */}
                      <span className="flex-1 truncate">{group.name}</span>

                      {/* Running total */}
                      {group.runningTotal > 0 && (
                        <span className="text-slate-400 font-mono tabular-nums">
                          {formatMeasurement(group.runningTotal, group.unit)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t border-white/10 space-y-2">
        <button
          onClick={onAddCustomGroup}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white border border-dashed border-slate-700 hover:border-slate-500 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Custom Preset
        </button>
      </div>
    </div>
  );
}
