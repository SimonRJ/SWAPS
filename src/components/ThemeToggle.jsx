export default function ThemeToggle({ isDark, onToggle, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={onToggle}
      className={`inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-300 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${className}`}
    >
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
          isDark ? 'bg-slate-800 border-slate-600' : 'bg-white/80 border-gray-200 shadow-sm'
        }`}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] shadow transition-transform ${
            isDark ? 'translate-x-5 text-slate-700' : 'translate-x-0 text-amber-500'
          }`}
        >
          {isDark ? '🌙' : '☀️'}
        </span>
      </span>
    </button>
  );
}
