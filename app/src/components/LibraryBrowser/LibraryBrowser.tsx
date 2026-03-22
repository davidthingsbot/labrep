'use client';

import { useState } from 'react';

const TABS = ['Examples', 'API Reference', 'OCCT Reference'] as const;

export function LibraryBrowser() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);

  return (
    <div className="border-t border-gray-700 bg-gray-800">
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
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="px-2 py-1 text-sm text-gray-400 hover:text-white"
          aria-label="Toggle library browser"
        >
          {isCollapsed ? '\u25B2' : '\u25BC'}
        </button>
      </div>
      <div
        data-testid="library-content"
        className="px-4 py-2 text-sm text-gray-400"
        style={{ display: isCollapsed ? 'none' : undefined }}
      >
        {activeTab === 'Examples' && <p>No examples yet.</p>}
        {activeTab === 'API Reference' && <p>Coming soon.</p>}
        {activeTab === 'OCCT Reference' && <p>Coming soon.</p>}
      </div>
    </div>
  );
}
