import { ANATOMY_ATTRIBUTION } from "../../lib/anatomyAssets";

type AnatomyAttributionProps = {
  open: boolean;
  onClose: () => void;
};

export function AnatomyAttributionPanel({ open, onClose }: AnatomyAttributionProps) {
  if (!open) return null;

  return (
    <div className="anatomy-attribution" role="dialog" aria-label="Anatomy model attribution">
      <div className="anatomy-attribution__header">
        <strong>{ANATOMY_ATTRIBUTION.title}</strong>
        <button type="button" className="anatomy-attribution__close" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="anatomy-attribution__body">{ANATOMY_ATTRIBUTION.derivativeNote}</p>
      <ul className="anatomy-attribution__list">
        {ANATOMY_ATTRIBUTION.creators.map((creator) => (
          <li key={creator}>{creator}</li>
        ))}
      </ul>
      <p className="anatomy-attribution__license">
        Licensed under{" "}
        <a href={ANATOMY_ATTRIBUTION.licenseUrl} target="_blank" rel="noreferrer">
          {ANATOMY_ATTRIBUTION.license}
        </a>
        .{" "}
        <a href={ANATOMY_ATTRIBUTION.sourceUrl} target="_blank" rel="noreferrer">
          Source repository
        </a>
      </p>
    </div>
  );
}
