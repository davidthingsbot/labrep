'use client';

import { examples } from '@/examples/registry';

interface ExampleSelectorProps {
  /** Currently selected example ID */
  selectedId: string;
  /** Callback when an example is selected */
  onSelect: (id: string) => void;
}

/** List of examples with selection state. */
export function ExampleSelector({ selectedId, onSelect }: ExampleSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {examples.map((example) => (
        <button
          key={example.id}
          data-testid="example-item"
          data-selected={example.id === selectedId}
          onClick={() => onSelect(example.id)}
          className={`text-left p-2 rounded border transition-colors ${
            example.id === selectedId
              ? 'border-blue-500 bg-blue-500/20 text-white'
              : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white'
          }`}
        >
          <div className="font-medium text-sm">{example.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">{example.description}</div>
        </button>
      ))}
    </div>
  );
}
