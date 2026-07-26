import type { ReactNode } from "react";
import { importDesignFromDisk } from "../../lib/importDesign";
import {
  useExperimentStore,
  type ToolMode,
} from "../../store/experimentStore";

type ToolButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`top-bar__tool${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconContact() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMove() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5 6 12.5M8 14.5l2-2M1.5 8 3.5 6M1.5 8l2 2M14.5 8 12.5 6M14.5 8l-2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRotate() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M12.5 6.5A5 5 0 1 0 13 8.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M12.5 3.5v3h-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconScale() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 13V8M3 13h5M3 13l4.5-4.5M13 3H8M13 3v5M13 3 8.5 7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function IconImport() {
  return (
    <svg className="top-bar__tool-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5v7M5.5 7 8 9.5 10.5 7M3 11.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TopBar() {
  const tool = useExperimentStore((s) => s.tool);
  const setTool = useExperimentStore((s) => s.setTool);
  const setSidebarTab = useExperimentStore((s) => s.setSidebarTab);
  const hasDesign = useExperimentStore((s) => s.design !== null);
  const showBody = useExperimentStore((s) => s.showBody);
  const isImporting = useExperimentStore((s) => s.isImporting);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const canTransform = hasDesign || showBody;

  const selectTool = (next: ToolMode) => () => {
    setTool(next);
    if (next === "contact") setSidebarTab("contacts");
  };

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
          <ToolButton
            label="Import STL / OBJ"
            onClick={() => void importDesignFromDisk()}
            disabled={isImporting}
          >
            <IconImport />
          </ToolButton>
        </div>
        <div className="top-bar__divider" />
        <div className="top-bar__tool-group">
          <ToolButton
            label="Place stimulus plane"
            active={tool === "contact"}
            disabled={!canTransform}
            onClick={selectTool("contact")}
          >
            <IconContact />
          </ToolButton>
          <ToolButton
            label="Move"
            active={tool === "translate"}
            disabled={!canTransform}
            onClick={selectTool("translate")}
          >
            <IconMove />
          </ToolButton>
          <ToolButton
            label="Rotate"
            active={tool === "rotate"}
            disabled={!canTransform}
            onClick={selectTool("rotate")}
          >
            <IconRotate />
          </ToolButton>
          <ToolButton
            label="Scale"
            active={tool === "scale"}
            disabled={!canTransform}
            onClick={selectTool("scale")}
          >
            <IconScale />
          </ToolButton>
        </div>
        <div className="top-bar__divider" />
        <div className="top-bar__tool-group">
          <ToolButton
            label="Orbit camera"
            active={tool === "orbit"}
            onClick={selectTool("orbit")}
          >
            <IconOrbit />
          </ToolButton>
        </div>
      </div>

      <div className="top-bar__meta">
        <span className="top-bar__pill">Phase 2</span>
        <span>
          {isImporting
            ? "Importing…"
            : contactCount > 0
              ? `${contactCount} contacts`
              : "Workspace"}
        </span>
      </div>
    </header>
  );
}
