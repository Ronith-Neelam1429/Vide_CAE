import type { HeatContactResult } from "./simulation";
import type { ContactPoint, StimulusAssignment } from "../store/experimentStore";

export type FailModeSeverity = "info" | "warning" | "critical";

export type FailMode = {
  id: string;
  severity: FailModeSeverity;
  title: string;
  detail: string;
};

export function detectFailModes(
  contact: HeatContactResult,
  assignment: StimulusAssignment | undefined,
  contactPoint: ContactPoint | undefined,
): FailMode[] {
  const modes: FailMode[] = [];

  if (
    contact.solver.solverDimensionRequested === "1d" &&
    contact.dimensionality.verdict !== "1D assumption well satisfied"
  ) {
    modes.push({
      id: "forced-1d",
      severity: contact.dimensionality.verdict === "1D assumption not valid" ? "critical" : "warning",
      title: "Depth-only solver forced",
      detail: "This contact is small enough for lateral heat spreading to matter. Use Auto or 2D axisymmetric.",
    });
  }

  if (contact.inputs.postExposureS < 10) {
    modes.push({
      id: "short-cooling-window",
      severity: "warning",
      title: "Short cooling window",
      detail: "Damage can continue while tissue cools; use at least 10 s after contact for a more complete Ω estimate.",
    });
  }

  if (contact.series.some((sample) => sample.controllerSaturated)) {
    modes.push({
      id: "controller-saturated",
      severity: "warning",
      title: "Controller power limit reached",
      detail: "The regulated device could not hold its requested setpoint for part of this run. Use delivered flux, not the commanded setpoint, when assessing the design.",
    });
  }

  if (
    contact.contact.method === "pressure-dependent dry contact" &&
    contact.inputs.contactPressureKpa < 1
  ) {
    modes.push({
      id: "low-pressure-dry-contact",
      severity: "info",
      title: "Low-pressure dry contact",
      detail: "Dry-contact conductance is an order-of-magnitude estimate at very low pressure. A measured conductance or film state is more reliable.",
    });
  }

  if (assignment?.parameters.contactConductanceWM2K && assignment.parameters.contactConductanceWM2K > 0) {
    modes.push({
      id: "measured-conductance-override",
      severity: "info",
      title: "Measured conductance override",
      detail: "Interface material and pressure do not affect this run because the supplied conductance takes precedence.",
    });
  }

  if (contactPoint?.surface === "body" && contactPoint.anatomyProfileConfidence === "low") {
    modes.push({
      id: "low-confidence-site",
      severity: "info",
      title: "Approximate body-site mapping",
      detail: "The anatomy mesh did not identify this surface confidently. Confirm the selected skin site before comparing results.",
    });
  }

  return modes;
}
