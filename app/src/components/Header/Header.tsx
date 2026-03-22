export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-white">labrep viewer</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded">
          Settings
        </button>
        <button className="px-3 py-1 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded">
          Export
        </button>
      </div>
    </header>
  );
}
