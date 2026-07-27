//! AI-assisted protocol extraction and mapping for Vide.
//!
//! The assist layer never replaces the Pennes bioheat solver. It maps natural
//! language and paper text to structured protocol parameters, flags unknowns,
//! and defers temperature prediction to `simulation::validation`.

pub mod azure;
pub mod config;
pub mod proof_lab;
pub mod protocol;

pub use config::{assist_config_status, AssistConfigStatus};
pub use proof_lab::{analyze_proof_lab_report, AnalyzeProofLabRequest, ProofLabAnalysis};
pub use protocol::{
    extract_protocol_from_text, suggest_protocol_from_text, ExtractProtocolRequest,
    ExtractProtocolResponse, ProtocolSuggestion, SuggestProtocolRequest,
};
