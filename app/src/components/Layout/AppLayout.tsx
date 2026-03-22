'use client';

import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Editor } from '@/components/Editor';
import { Viewer } from '@/components/Viewer';
import { LibraryBrowser } from '@/components/LibraryBrowser';
import { getExampleById } from '@/examples/registry';

/** Root layout composing the Header, Editor, Viewer, and LibraryBrowser into a split-pane workspace. */
export function AppLayout() {
  const [selectedExampleId, setSelectedExampleId] = useState('primitives-all');
  const [code, setCode] = useState(() => getExampleById('primitives-all')?.code ?? '');
  const [libraryVisible, setLibraryVisible] = useState(true);
  const [editorVisible, setEditorVisible] = useState(true);
  const [animationEnabled, setAnimationEnabled] = useState(true);

  const handleExampleSelect = useCallback((id: string) => {
    setSelectedExampleId(id);
    const example = getExampleById(id);
    if (example) {
      setCode(example.code);
    }
  }, []);

  return (
    <div 
      className="flex flex-col bg-gray-900 text-white"
      style={{ height: '100dvh' }}  // dynamic viewport height (accounts for mobile browser chrome)
    >
      <Header 
        libraryVisible={libraryVisible}
        onToggleLibrary={() => setLibraryVisible(!libraryVisible)}
        editorVisible={editorVisible}
        onToggleEditor={() => setEditorVisible(!editorVisible)}
        animationEnabled={animationEnabled}
        onToggleAnimation={() => setAnimationEnabled(!animationEnabled)}
      />
      {/* Mobile: flex-col (viewer top, editor bottom), Desktop: flex-row (side by side) */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Viewer - always first in DOM for mobile-first (appears on top) */}
        <div className={`${editorVisible ? 'h-1/2 md:h-full md:w-1/2' : 'h-full w-full'} ${editorVisible ? 'order-1 md:order-2' : ''}`}>
          <Viewer exampleId={selectedExampleId} animationEnabled={animationEnabled} />
        </div>
        {/* Editor - second in DOM, but on mobile appears below viewer */}
        {editorVisible && (
          <div className="h-1/2 md:h-full md:w-1/2 border-t md:border-t-0 md:border-r border-gray-700 order-2 md:order-1">
            <Editor value={code} onChange={(v) => setCode(v ?? '')} />
          </div>
        )}
      </div>
      <LibraryBrowser 
        visible={libraryVisible}
        selectedExampleId={selectedExampleId}
        onExampleSelect={handleExampleSelect}
      />
    </div>
  );
}
