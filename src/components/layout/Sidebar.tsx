export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__header-title">Browser</span>
        <div className="sidebar__tabs">
          <button type="button" className="sidebar__tab is-active">
            Design
          </button>
          <button type="button" className="sidebar__tab">
            Stimuli
          </button>
        </div>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__section-label">Document</div>
        <div className="sidebar__body">
          <div className="sidebar__tree-row is-selected">
            <span className="sidebar__tree-dot" />
            <span className="sidebar__tree-label">Placeholder Cube</span>
          </div>

          <div className="sidebar__empty" style={{ marginTop: 12 }}>
            <div className="sidebar__empty-title">No design imported</div>
            <p className="sidebar__empty-copy">
              CAD import, contact points, and stimulus assignment land in later
              phases. This panel is reserved for the experiment browser.
            </p>
          </div>
        </div>
      </section>

      <div className="sidebar__footer">Ready · local workspace</div>
    </aside>
  );
}
