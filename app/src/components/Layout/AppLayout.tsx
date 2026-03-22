'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { Editor } from '@/components/Editor';
import { Viewer } from '@/components/Viewer';
import { LibraryBrowser } from '@/components/LibraryBrowser';

const DEFAULT_CODE = `// labrep - BRep geometry
// import { primitives } from 'labrep';
//
// const box = primitives.makeBox(10, 20, 30);
`;

export function AppLayout() {
  const [code, setCode] = useState(DEFAULT_CODE);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-gray-700">
          <Editor value={code} onChange={(v) => setCode(v ?? '')} />
        </div>
        <div className="w-1/2">
          <Viewer />
        </div>
      </div>
      <LibraryBrowser />
    </div>
  );
}
