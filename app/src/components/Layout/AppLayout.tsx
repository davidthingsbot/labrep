'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { Editor } from '@/components/Editor';
import { Viewer } from '@/components/Viewer';
import { LibraryBrowser } from '@/components/LibraryBrowser';

const DEFAULT_CODE = `// labrep - BRep geometry
import { makeBox, makeSphere, makeCylinder } from '@labrep/generation';
import { point3d, vec3d } from '@labrep/generation';

// Primitives
const box = makeBox(1, 1, 1);
const sphere = makeSphere(0.5);
const cylinder = makeCylinder(0.4, 1);

// Points and vectors
const origin = point3d(0, 0, 0);
const direction = vec3d(1, 1, 1);
`;

/** Root layout composing the Header, Editor, Viewer, and LibraryBrowser into a split-pane workspace. */
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
