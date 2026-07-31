export type WorkspaceTab = 'campaign' | 'ward' | 'political' | 'council' | 'party'

export function WorkspaceTabs({ activeTab, tabs, onChange }: {
  activeTab: WorkspaceTab
  tabs: Array<{ id: WorkspaceTab; label: string; badge?: string }>
  onChange: (tab: WorkspaceTab) => void
}) {
  return (
    <nav className="workspace-tabs" aria-label="Game workspace">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`workspace-tab${activeTab === tab.id ? ' is-active' : ''}`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}{tab.badge && <span>{tab.badge}</span>}
        </button>
      ))}
    </nav>
  )
}
