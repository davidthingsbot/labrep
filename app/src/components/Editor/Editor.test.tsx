import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, ...props }: any) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e: any) => onChange?.(e.target.value)}
      {...props}
    />
  ),
}));

import { Editor } from './Editor';

describe('Editor', () => {
  it('renders the editor', () => {
    render(<Editor value="" onChange={() => {}} />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('displays the initial value', () => {
    render(<Editor value="const x = 1;" onChange={() => {}} />);
    expect(screen.getByTestId('monaco-editor')).toHaveValue('const x = 1;');
  });

  it('calls onChange when the user types', async () => {
    const handleChange = vi.fn();
    render(<Editor value="" onChange={handleChange} />);
    const textarea = screen.getByTestId('monaco-editor');
    await userEvent.type(textarea, 'a');
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders inside an editor container', () => {
    render(<Editor value="" onChange={() => {}} />);
    expect(screen.getByTestId('editor-container')).toBeInTheDocument();
  });
});
