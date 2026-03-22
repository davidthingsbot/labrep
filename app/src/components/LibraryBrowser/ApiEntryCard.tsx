'use client';

import type { ApiEntry } from '@/data/api-data';

interface ApiEntryCardProps {
  entry: ApiEntry;
  expanded: boolean;
  onToggle: () => void;
}

const KIND_LABELS: Record<ApiEntry['kind'], string> = {
  function: 'fn',
  interface: 'interface',
  constant: 'const',
  type: 'type',
};

/** Renders a single API entry as a collapsible card. */
export function ApiEntryCard({ entry, expanded, onToggle }: ApiEntryCardProps) {
  return (
    <div className="border-b border-gray-700/50">
      <button
        onClick={onToggle}
        className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-gray-700/30 transition-colors"
      >
        <span className="text-gray-500 text-xs w-14 shrink-0">{KIND_LABELS[entry.kind]}</span>
        <span className="font-mono text-sm text-gray-100">{entry.name}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 pl-[4.5rem] space-y-1.5">
          <p className="text-gray-400 text-xs">{entry.description}</p>
          {entry.signature && (
            <pre className="text-gray-300 font-mono text-xs bg-gray-900/50 px-2 py-1 rounded overflow-x-auto">
              {entry.signature}
            </pre>
          )}
          {entry.params && entry.params.length > 0 && (
            <div>
              <div className="text-gray-500 text-xs mb-0.5">params</div>
              {entry.params.map((p) => (
                <div key={p.name} className="flex gap-2 text-xs pl-2">
                  <span className="font-mono text-gray-300 shrink-0">{p.name}</span>
                  <span className="text-gray-500 shrink-0">{p.type}</span>
                  <span className="text-gray-400">{p.description}</span>
                </div>
              ))}
            </div>
          )}
          {entry.returns && (
            <div className="text-xs">
              <span className="text-gray-500">returns </span>
              <span className="text-gray-400">{entry.returns}</span>
            </div>
          )}
          {entry.properties && entry.properties.length > 0 && (
            <div>
              <div className="text-gray-500 text-xs mb-0.5">properties</div>
              {entry.properties.map((p) => (
                <div key={p.name} className="flex gap-2 text-xs pl-2">
                  <span className="font-mono text-gray-300 shrink-0">{p.name}</span>
                  <span className="text-gray-500 shrink-0">{p.type}</span>
                  <span className="text-gray-400">{p.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
