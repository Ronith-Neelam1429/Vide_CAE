import type { ReactNode } from "react";
import { useExperimentStore, type ToolMode } from "../../store/experimentStore";

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`viewport-tools__btn${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconMove() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="6.2" ry="2.8" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.8" ry="6.2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Viewport-corner transform / camera tools (Fusion-style). */
export function ViewportTools() {
  const tool = useExperimentStore((s) => s.tool);
  const setTool = useExperimentStore((s) => s.setTool);
  const canTransform = useExperimentStore(
    (s) => s.design !== null || s.showBody,
  );

  const select = (next: ToolMode) => () => setTool(next);

  return (
    <div className="viewport-tools" role="toolbar" aria-label="View and transform">
      <ToolButton
        label="Move"
        active={tool === "translate"}
        disabled={!canTransform}
        onClick={select("translate")}
      >
        <IconMove />
      </ToolButton>
      <ToolButton
        label="Rotate"
        active={tool === "rotate"}
        disabled={!canTransform}
        onClick={select("rotate")}
      >
        <IconRotate />
      </ToolButton>
      <ToolButton
        label="Scale"
        active={tool === "scale"}
        disabled={!canTransform}
        onClick={select("scale")}
      >
        <IconScale />
      </ToolButton>
      <span className="viewport-tools__divider" aria-hidden />
      <ToolButton
        label="Orbit camera"
        active={tool === "orbit"}
        onClick={select("orbit")}
      >
        <IconOrbit />
      </ToolButton>
    </div>
  );
}
