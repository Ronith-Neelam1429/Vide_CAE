//! Shared stimulus timeline primitives.
//!
//! A timeline is deliberately modality-neutral: heat, compression, and future
//! transport solvers can consume the same ordered protocol without treating a
//! repeated experiment as a single hold plus a cosmetic cycle count.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimelineSegmentKind {
    Hold,
    Ramp,
    Release,
    Repeat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineSegment {
    pub kind: TimelineSegmentKind,
    pub duration_s: f64,
    /// Number of repetitions for a repeated segment; one for all other kinds.
    pub repetitions: u64,
    /// Fraction of a cycle spent under the active load, when applicable.
    pub duty_cycle: Option<f64>,
    pub label: String,
    /// Optional modality value (°C for thermal protocols).
    pub start_value: Option<f64>,
    pub end_value: Option<f64>,
    pub value_unit: Option<String>,
}

impl TimelineSegment {
    pub fn hold(duration_s: f64, label: impl Into<String>) -> Self {
        Self {
            kind: TimelineSegmentKind::Hold,
            duration_s: duration_s.max(0.0),
            repetitions: 1,
            duty_cycle: None,
            label: label.into(),
            start_value: None,
            end_value: None,
            value_unit: None,
        }
    }

    pub fn release(duration_s: f64, label: impl Into<String>) -> Self {
        Self {
            kind: TimelineSegmentKind::Release,
            duration_s: duration_s.max(0.0),
            repetitions: 1,
            duty_cycle: None,
            label: label.into(),
            start_value: None,
            end_value: None,
            value_unit: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolTimeline {
    pub segments: Vec<TimelineSegment>,
}

impl ProtocolTimeline {
    /// Backward-compatible representation of the existing heat protocol.
    pub fn exposure_and_cooling(exposure_s: f64, cooling_s: f64) -> Self {
        let mut segments = vec![TimelineSegment::hold(exposure_s, "Exposure")];
        if cooling_s > 0.0 {
            segments.push(TimelineSegment::release(cooling_s, "Post-exposure cooling"));
        }
        Self { segments }
    }

    #[allow(dead_code)]
    pub fn total_duration_s(&self) -> f64 {
        self.segments
            .iter()
            .map(|segment| segment.duration_s * segment.repetitions.max(1) as f64)
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_exposure_remains_two_segments() {
        let timeline = ProtocolTimeline::exposure_and_cooling(10.0, 20.0);
        assert_eq!(timeline.segments.len(), 2);
        assert_eq!(timeline.total_duration_s(), 30.0);
    }
}
