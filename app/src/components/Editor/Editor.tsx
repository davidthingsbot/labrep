'use client';

import MonacoEditor from '@monaco-editor/react';

interface EditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

export function Editor({ value, onChange }: EditorProps) {
  return (
    <div className="w-full h-full" data-testid="editor-container">
      <MonacoEditor
        height="100%"
        language="typescript"
        theme="vs-dark"
        value={value}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
        }}
      />
    </div>
  );
}
