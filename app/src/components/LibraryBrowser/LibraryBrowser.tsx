'use client';

import { useState } from 'react';
import { ExampleSelector } from './ExampleSelector';
import { ApiReference } from './ApiReference';

const TABS = ['Examples', 'API Reference', 'OCCT Reference'] as const;

interface LibraryBrowserProps {
  /** Currently selected example ID */
  selectedExampleId?: string;
  /** Callback when an example is selected */
  onExampleSelect?: (id: string) => void;
  /** Controlled visibility - hides entire component when false */
  visible?: boolean;
  /** Panel height in pixels (controlled by resize handle) */
  height?: number;
}

export function LibraryBrowser({ selectedExampleId, onExampleSelect, visible = true, height }: LibraryBrowserProps) {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="flex flex-col bg-gray-800 overflow-hidden"
      style={{
        height: height ? `${height}px` : undefined,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-1 shrink-0">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-sm rounded ${
                activeTab === tab
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div
        data-testid="library-content"
        className="px-4 py-2 text-sm text-gray-400 flex-1 overflow-y-auto min-h-0"
      >
        {activeTab === 'Examples' && (
          selectedExampleId && onExampleSelect ? (
            <ExampleSelector selectedId={selectedExampleId} onSelect={onExampleSelect} />
          ) : (
            <p>No examples configured.</p>
          )
        )}
        {activeTab === 'API Reference' && <ApiReference />}
        {activeTab === 'OCCT Reference' && <p>Coming soon.</p>}
      </div>
    </div>
  );
}
