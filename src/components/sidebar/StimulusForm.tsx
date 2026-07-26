import {
  BUILTIN_STIMULI,
  getStimulusDefinition,
  type StimulusType,
} from "../../lib/stimuli";
import { useExperimentStore } from "../../store/experimentStore";

type StimulusFormProps = {
  contactPointId: string;
};

export function StimulusForm({ contactPointId }: StimulusFormProps) {
  const assignment = useExperimentStore((s) =>
    s.assignments.find((a) => a.contactPointId === contactPointId),
  );
  const setStimulusType = useExperimentStore((s) => s.setStimulusType);
  const setStimulusParameter = useExperimentStore((s) => s.setStimulusParameter);

  if (!assignment) {
    return (
      <div className="stimulus-form__empty">No stimulus assigned yet.</div>
    );
  }

  const definition = getStimulusDefinition(assignment.stimulusType);

  return (
    <div className="stimulus-form">
      <label className="stimulus-form__field">
        <span className="stimulus-form__label">Stimulus type</span>
        <select
          className="stimulus-form__select"
          value={assignment.stimulusType}
          onChange={(event) =>
            setStimulusType(
              contactPointId,
              event.target.value as StimulusType,
            )
          }
        >
          {BUILTIN_STIMULI.map((stimulus) => (
            <option key={stimulus.type} value={stimulus.type}>
              {stimulus.label}
            </option>
          ))}
        </select>
      </label>

      {definition && (
        <p className="stimulus-form__hint">{definition.description}</p>
      )}

      <div className="stimulus-form__params">
        {(definition?.fields ?? []).map((field) => (
          <label key={field.key} className="stimulus-form__field">
            <span className="stimulus-form__label">
              {field.label}
              <span className="stimulus-form__unit">{field.unit}</span>
            </span>
            <input
              className="stimulus-form__input"
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={assignment.parameters[field.key] ?? field.defaultValue}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) {
                  setStimulusParameter(contactPointId, field.key, next);
                }
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
