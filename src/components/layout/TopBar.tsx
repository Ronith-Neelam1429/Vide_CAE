import type { ReactNode } from "react";
import { importDesignFromDisk } from "../../lib/importDesign";
import { useExperimentStore } from "../../store/experimentStore";

function ToolButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="top-bar__tool"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
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
  const isImporting = useExperimentStore((s) => s.isImporting);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);

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
      </div>

      <div className="top-bar__meta">
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
