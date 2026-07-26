import {
  LITERATURE_CASES,
  literatureCaseById,
  type LiteratureCase,
} from "./literatureCases";
import type { StimulusOptions, StimulusParameters } from "./stimuli";

export type ProtocolSuggestion = {
  caseId: string;
  label: string;
  citation: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  availability: LiteratureCase["availability"];
  availabilityNote: string;
  parameters: StimulusParameters;
  options: StimulusOptions;
};

function scoreCase(caseEntry: LiteratureCase, normalized: string): number {
  let score = 0;
  for (const keyword of caseEntry.keywords) {
    if (normalized.includes(keyword.toLowerCase())) {
      score += keyword.length >= 4 ? 2 : 1;
    }
  }
  if (normalized.includes("forearm") && caseEntry.site.includes("forearm")) {
    score += 2;
  }
  if (normalized.includes("calibrat") && caseEntry.split === "calibration") {
    score += 1;
  }
  if (normalized.includes("hold") && caseEntry.split === "holdout") {
    score += 1;
  }
  return score;
}

/**
 * Map free text to the best-matching literature protocol. Rule-based for YC
 * demo reliability; replace inner matcher with LLM structured output in Phase 2.
 */
export function suggestProtocolFromText(text: string): ProtocolSuggestion | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  let best: LiteratureCase | null = null;
  let bestScore = 0;
  for (const entry of LITERATURE_CASES) {
    const score = scoreCase(entry, normalized);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best || bestScore < 2) return null;

  const confidence: ProtocolSuggestion["confidence"] =
    bestScore >= 6 ? "high" : bestScore >= 4 ? "medium" : "low";

  return {
    caseId: best.id,
    label: best.label,
    citation: best.citation,
    confidence,
    reason: `Matched ${bestScore} protocol keyword(s) in: “${text.trim()}”`,
    availability: best.availability,
    availabilityNote: best.availabilityNote,
    parameters: { ...best.parameters },
    options: { ...best.options },
  };
}

export function protocolFromLiteratureCase(caseId: string): ProtocolSuggestion | null {
  const entry = literatureCaseById(caseId);
  if (!entry) return null;
  return {
    caseId: entry.id,
    label: entry.label,
    citation: entry.citation,
    confidence: "high",
    reason: "Selected from curated literature registry.",
    availability: entry.availability,
    availabilityNote: entry.availabilityNote,
    parameters: { ...entry.parameters },
    options: { ...entry.options },
  };
}
