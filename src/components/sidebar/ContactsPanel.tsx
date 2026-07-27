import { stimulusLabel } from "../../lib/stimuli";
import {
  useExperimentStore,
  type StimulusAssignment,
} from "../../store/experimentStore";
import { StimulusForm } from "./StimulusForm";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Number(seconds.toFixed(1))} s`;
  if (seconds < 3600) return `${Number((seconds / 60).toFixed(1))} min`;
  return `${Number((seconds / 3600).toFixed(1))} h`;
}

function describeAssignment(
  assignment: StimulusAssignment | undefined,
  regionLabel?: string | null,
): string {
  if (!assignment) return "Unassigned";
  if (assignment.stimulusType !== "heat") {
    return `${stimulusLabel(assignment.stimulusType)} · not implemented`;
  }
  const { temperatureC, durationS, contactAreaMm2 } = assignment.parameters;
  return [
    regionLabel ?? null,
    temperatureC === undefined ? null : `${temperatureC} °C`,
    durationS === undefined ? null : formatDuration(durationS),
    contactAreaMm2 === undefined ? null : `${contactAreaMm2} mm²`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ContactsPanel() {
  const design = useExperimentStore((s) => s.design);
  const showBody = useExperimentStore((s) => s.showBody);
  const contactPoints = useExperimentStore((s) => s.contactPoints);
  const assignments = useExperimentStore((s) => s.assignments);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const selectContact = useExperimentStore((s) => s.selectContact);
  const removeContactPoint = useExperimentStore((s) => s.removeContactPoint);
  const clearContactPoints = useExperimentStore((s) => s.clearContactPoints);
  const snapContactToSkin = useExperimentStore((s) => s.snapContactToSkin);
  const tool = useExperimentStore((s) => s.tool);

  const selected = contactPoints.find((c) => c.id === selectedContactId) ?? null;
  const selectedAssignment = assignments.find(
    (a) => a.contactPointId === selectedContactId,
  );

  if (!design && !showBody) {
    return (
      <p className="design-panel__hint">
        Show the body from the scene bar, or import a design, then place a stimulus.
      </p>
    );
  }

  return (
    <div className="contacts-panel">
      <div className="contacts-panel__list-head">
        Contacts ({contactPoints.length})
        <div className="contacts-panel__list-actions">
          {tool === "contact" && (
            <span className="contacts-panel__mode-pill">Click once to place</span>
          )}
          {contactPoints.length > 0 && (
            <button
              type="button"
              className="sidebar__btn sidebar__btn--compact"
              onClick={() => clearContactPoints()}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {contactPoints.length === 0 ? (
        <p className="design-panel__hint">
          {tool === "contact"
            ? "Stimulus mode is on. Click the body once — mode turns off after you place."
            : "Press Stimulus in the scene bar, click the body once, then press Run."}
        </p>
      ) : (
        <ul className="contacts-list">
          {contactPoints.map((contact) => {
            const assignment = assignments.find(
              (a) => a.contactPointId === contact.id,
            );
            const active = contact.id === selectedContactId;
            return (
              <li key={contact.id}>
                <button
                  type="button"
                  className={`contacts-list__item${active ? " is-active" : ""}`}
                  onClick={() => selectContact(contact.id)}
                >
                  <span
                    className="contacts-list__swatch"
                    style={{ background: active ? "#ffb020" : "#22d3ee" }}
                  />
                  <span className="contacts-list__text">
                    <span className="contacts-list__name">{contact.label}</span>
                    <span className="contacts-list__meta">
                      {describeAssignment(assignment, contact.anatomyRegionLabel)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <div className="contacts-detail">
          <div className="contacts-detail__header">
            <div>
              <div className="contacts-detail__title">{selected.label}</div>
              {selected.anatomyRegionLabel && (
                <div className="contacts-detail__coords">
                  {selected.anatomyRegionLabel}
                  {selectedAssignment?.options.skinProfileId
                    ? ` · ${selectedAssignment.options.skinProfileId}`
                    : ""}
                </div>
              )}
            </div>
            <button
              type="button"
              className="sidebar__btn contacts-detail__delete"
              onClick={() => removeContactPoint(selected.id)}
            >
              Delete
            </button>
          </div>

          {selected.surface === "design" && (
            <button
              type="button"
              className="sidebar__btn"
              style={{ marginBottom: 8 }}
              onClick={() => snapContactToSkin(selected.id)}
            >
              Snap to skin
            </button>
          )}

          <StimulusForm contactPointId={selected.id} />
        </div>
      )}
    </div>
  );
}
