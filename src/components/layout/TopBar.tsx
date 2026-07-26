import type { ReactNode } from "react";

type ToolButtonProps = {
  label: string;
  active?: boolean;
  children: ReactNode;
};

function ToolButton({ label, active = false, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`top-bar__tool${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function IconSelect() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 2.5h4v4h-4v-4Zm7 0h4v4h-4v-4Zm-7 7h4v4h-4v-4Zm9.5-.5 2.5 5.5-5.5-2.5L12 9Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconMove() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5 6 12.5M8 14.5l2-2M1.5 8 3.5 6M1.5 8l2 2M14.5 8 12.5 6M14.5 8l-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconRotate() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M12.5 6.5A5 5 0 1 0 13 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12.5 3.5v3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconOrbit() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="6.2" ry="2.8" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.8" ry="6.2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <div className="top-bar__mark">V</div>
        <div>
          <span className="top-bar__title">Vide</span>
          <span className="top-bar__subtitle">CAE</span>
        </div>
      </div>

      <div className="top-bar__tools" aria-label="Primary tools">
        <div className="top-bar__tool-group">
          <ToolButton label="Select" active>
            <IconSelect />
          </ToolButton>
          <ToolButton label="Move">
            <IconMove />
          </ToolButton>
          <ToolButton label="Rotate">
            <IconRotate />
          </ToolButton>
        </div>
        <div className="top-bar__divider" />
        <div className="top-bar__tool-group">
          <ToolButton label="Orbit camera" active>
            <IconOrbit />
          </ToolButton>
        </div>
      </div>

      <div className="top-bar__meta">
        <span className="top-bar__pill">Phase 0</span>
        <span>Workspace</span>
      </div>
    </header>
  );
}
