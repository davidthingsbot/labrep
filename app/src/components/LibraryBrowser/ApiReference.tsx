'use client';

import { useState, useMemo } from 'react';
import { apiEntries, API_MODULES } from '@/data/api-data';
import { ApiEntryCard } from './ApiEntryCard';

const FILTER_OPTIONS = ['all', ...API_MODULES] as const;

/** Browsable API reference panel with module filtering. */
export function ApiReference() {
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (selectedModule === 'all') return apiEntries;
    return apiEntries.filter((e) => e.module === selectedModule);
  }, [selectedModule]);

  const handleToggle = (name: string) => {
    setExpandedEntry((prev) => (prev === name ? null : name));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 mb-2">
        {FILTER_OPTIONS.map((mod) => (
          <button
            key={mod}
            onClick={() => {
              setSelectedModule(mod);
              setExpandedEntry(null);
            }}
            className={`px-2 py-0.5 text-xs rounded ${
              selectedModule === mod
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {mod}
          </button>
        ))}
        <span className="text-gray-500 text-xs ml-auto self-center">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      <div className="overflow-y-auto border border-gray-700 rounded flex-1 min-h-0">
        {filtered.map((entry) => (
          <ApiEntryCard
            key={entry.name}
            entry={entry}
            expanded={expandedEntry === entry.name}
            onToggle={() => handleToggle(entry.name)}
          />
        ))}
      </div>
    </div>
  );
}
