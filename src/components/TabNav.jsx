export default function TabNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'team', label: 'Team', icon: '👥' },
    { id: 'game', label: 'Game', icon: '⚽' },
    { id: 'stats', label: 'Stats', icon: '📊' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe-bottom bg-white/80 backdrop-blur-lg border-t border-gray-200/60">
      <div className="flex max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto px-3 py-1.5 gap-2">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl transition-all duration-200 touch-manipulation ${
                isActive
                  ? 'bg-pitch-600 text-white shadow-md shadow-pitch-600/30'
                  : 'text-gray-500 hover:bg-gray-100 active:bg-gray-200'
              }`}
            >
              <span className={`text-sm leading-none ${isActive ? '' : 'grayscale opacity-70'}`}>{tab.icon}</span>
              <span className={`text-xs font-semibold leading-none ${isActive ? 'text-white' : 'text-gray-600'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
