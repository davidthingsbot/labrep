'use client';

import { useState } from 'react';
import { ExampleSelector } from './ExampleSelector';

const TABS = ['Examples', 'API Reference', 'OCCT Reference'] as const;

interface LibraryBrowserProps {
  /** Currently selected example ID */
  selectedExampleId?: string;
  /** Callback when an example is selected */
  onExampleSelect?: (id: string) => void;
  /** Controlled visibility - hides entire component when false */
  visible?: boolean;
}

export function LibraryBrowser({ selectedExampleId, onExampleSelect, visible = true }: LibraryBrowserProps) {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);

  if (!visible) {
    return null;
  }

  return (
    <div 
      className="border-t border-gray-700 bg-gray-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-between px-4 py-1">
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
        className="px-4 py-2 text-sm text-gray-400"
      >
        {activeTab === 'Examples' && (
          selectedExampleId && onExampleSelect ? (
            <ExampleSelector selectedId={selectedExampleId} onSelect={onExampleSelect} />
          ) : (
            <p>No examples configured.</p>
          )
        )}
        {activeTab === 'API Reference' && <p>Coming soon.</p>}
        {activeTab === 'OCCT Reference' && <p>Coming soon.</p>}
      </div>
    </div>
  );
}
