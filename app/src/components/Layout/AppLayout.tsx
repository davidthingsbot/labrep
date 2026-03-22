'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/Header';
import { Editor } from '@/components/Editor';
import { Viewer } from '@/components/Viewer';
import { LibraryBrowser } from '@/components/LibraryBrowser';
import { makeBox } from '@labrep/generation';

const DEFAULT_CODE = `// labrep - BRep geometry
import { makeBox } from '@labrep/generation';

const box = makeBox(1, 1, 1);
`;

export function AppLayout() {
  const [code, setCode] = useState(DEFAULT_CODE);

  const mesh = useMemo(() => {
    const result = makeBox(1, 1, 1);
    return result.success ? result.result : undefined;
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-gray-700">
          <Editor value={code} onChange={(v) => setCode(v ?? '')} />
        </div>
        <div className="w-1/2">
          <Viewer mesh={mesh} />
        </div>
      </div>
      <LibraryBrowser />
    </div>
  );
}
