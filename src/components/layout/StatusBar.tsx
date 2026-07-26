export function StatusBar() {
  return (
    <footer className="status-bar">
      <div className="status-bar__left">
        <span className="status-bar__item">
          <span className="status-bar__dot" aria-hidden />
          Viewport ready
        </span>
        <span className="status-bar__item">Units: mm</span>
      </div>
      <div className="status-bar__right">
        <span className="status-bar__item status-bar__mono">RMB orbit</span>
        <span className="status-bar__item status-bar__mono">MMB / Shift pan</span>
        <span className="status-bar__item status-bar__mono">Scroll zoom</span>
      </div>
    </footer>
  );
}
