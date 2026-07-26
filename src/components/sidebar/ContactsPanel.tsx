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

/** One-line summary of a contact's configuration for the list row. */
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
  const setTool = useExperimentStore((s) => s.setTool);
  const runSimulation = useExperimentStore((s) => s.runSimulation);
  const simulationStatus = useExperimentStore((s) => s.simulationStatus);

  const selected = contactPoints.find((c) => c.id === selectedContactId) ?? null;
  const selectedAssignment = assignments.find(
    (a) => a.contactPointId === selectedContactId,
  );

  if (!design && !showBody) {
    return (
      <div className="sidebar__empty">
        <div className="sidebar__empty-title">Render a body or import a design</div>
        <p className="sidebar__empty-copy">
          Stimulus planes can be placed on the human body; contact points can
          also be marked on an imported STL/OBJ surface.
        </p>
      </div>
    );
  }

  return (
    <div className="contacts-panel">
      <div className="sidebar__actions">
        <button
          type="button"
          className="sidebar__btn sidebar__btn--primary"
          onClick={() => setTool("contact")}
        >
          Add stimulus plane
        </button>
        {contactPoints.length > 0 && (
          <>
            <button
              type="button"
              className="sidebar__btn sidebar__btn--primary"
              disabled={simulationStatus === "running"}
              onClick={() => void runSimulation()}
            >
              {simulationStatus === "running" ? "Solving…" : "Run simulation"}
            </button>
            <button
              type="button"
              className="sidebar__btn"
              onClick={() => clearContactPoints()}
            >
              Clear all contacts
            </button>
          </>
        )}
      </div>

      <p className="contacts-panel__help">
        1) Click the body to place a plane · 2) Set temperature & duration · 3) Run
        simulation. Results and the bottom terminal show what happened to the skin.
      </p>

      <div className="sidebar__section-label" style={{ paddingLeft: 0 }}>
        Contact points ({contactPoints.length})
      </div>

      {contactPoints.length === 0 ? (
        <div className="sidebar__empty">
          <div className="sidebar__empty-title">No contacts yet</div>
          <p className="sidebar__empty-copy">
            Click the mesh in the viewport to mark where the design touches
            skin.
          </p>
        </div>
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
                    style={{
                      background: active ? "#ffb020" : "#22d3ee",
                    }}
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
              <div className="contacts-detail__coords">
                pos{" "}
                {selected.position.map((n) => n.toFixed(2)).join(", ")}
              </div>
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
              className="sidebar__btn sidebar__btn--primary"
              style={{ marginBottom: 8 }}
              onClick={() => snapContactToSkin(selected.id)}
            >
              Snap contact to skin
            </button>
          )}

          {selectedAssignment && (
            <div className="contacts-detail__type">
              {stimulusLabel(selectedAssignment.stimulusType)}
            </div>
          )}

          {selected.surface === "body" && selected.anatomyRegionLabel && (
            <div className="contacts-site-banner">
              <div className="contacts-site-banner__title">
                Body site → tissue model
              </div>
              <div className="contacts-site-banner__value">
                {selected.anatomyRegionLabel}
                {selectedAssignment?.options.skinProfileId
                  ? ` · ${selectedAssignment.options.skinProfileId}`
                  : ""}
              </div>
              {selected.anatomyMeshName && (
                <div className="contacts-site-banner__mesh">
                  Hit: {selected.anatomyMeshName.replace(/\.\d+$/, "")}
                </div>
              )}
              {selected.anatomyProfileReason && (
                <div className="contacts-site-banner__reason">
                  {selected.anatomyProfileReason}
                  {selected.anatomyProfileConfidence
                    ? ` (${selected.anatomyProfileConfidence} confidence)`
                    : ""}
                </div>
              )}
              <p className="contacts-site-banner__note">
                Heat uses this site’s layered tissue table, not the GLB mesh
                materials. Override under Environment → Skin site if needed.
              </p>
            </div>
          )}

          <StimulusForm contactPointId={selected.id} />
        </div>
      )}
    </div>
  );
}
