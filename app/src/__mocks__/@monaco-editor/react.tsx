import React from 'react';

const MockEditor = ({ value, onChange, ...props }: any) => (
  <textarea
    data-testid="monaco-editor"
    value={value}
    onChange={(e) => onChange?.(e.target.value)}
    {...props}
  />
);

export default MockEditor;
