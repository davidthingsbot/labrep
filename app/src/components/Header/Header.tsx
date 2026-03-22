interface HeaderProps {
  /** Whether the library browser is visible */
  libraryVisible?: boolean;
  /** Callback to toggle library browser visibility */
  onToggleLibrary?: () => void;
  /** Whether the editor is visible */
  editorVisible?: boolean;
  /** Callback to toggle editor visibility */
  onToggleEditor?: () => void;
  /** Whether animation is running */
  animationEnabled?: boolean;
  /** Callback to toggle animation */
  onToggleAnimation?: () => void;
}

export function Header({ 
  libraryVisible = true, 
  onToggleLibrary,
  editorVisible = true,
  onToggleEditor,
  animationEnabled = true,
  onToggleAnimation,
}: HeaderProps) {
  const toggleButtonClass = (active: boolean) => 
    `px-2 sm:px-3 py-1 text-sm rounded border ${
      active 
        ? 'text-white bg-gray-600 border-gray-500' 
        : 'text-gray-400 border-gray-600 hover:text-white hover:border-gray-500'
    }`;

  return (
    <header className="flex items-center justify-between px-2 sm:px-4 py-2 bg-gray-800 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span className="text-base sm:text-lg font-bold text-gray-100">labrep</span>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        {onToggleAnimation && (
          <button 
            onClick={onToggleAnimation}
            className={toggleButtonClass(animationEnabled)}
            aria-label="Toggle animation"
          >
            {animationEnabled ? 'pause' : 'play'}
          </button>
        )}
        {onToggleEditor && (
          <button 
            onClick={onToggleEditor}
            className={toggleButtonClass(editorVisible)}
            aria-label="Toggle editor"
          >
            code
          </button>
        )}
        {onToggleLibrary && (
          <button 
            onClick={onToggleLibrary}
            className={toggleButtonClass(libraryVisible)}
            aria-label="Toggle examples"
          >
            examples
          </button>
        )}
      </div>
    </header>
  );
}
