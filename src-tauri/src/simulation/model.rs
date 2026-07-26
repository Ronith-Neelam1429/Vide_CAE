//! Physical inputs to the heat model, kept separate from the numerics so that
//! every value carries the source it came from and the range it may vary over.
//!
//! Nothing in this file is source-verified by the application. Each entry
//! records where the value is conventionally taken from and a review status,
//! so a run can be audited later without guessing which defaults were active.

use serde::Serialize;

pub const MODEL_VERSION: &str = "vide-heat-1d-fv-cn/2.0.0";

/// Review states for a tabulated property. Anything that has not been checked
/// against the primary source in-app stays `Unreviewed` so exports never imply
/// more confidence than the value has earned.
pub const UNREVIEWED: &str = "representative literature value, not source-verified in-app";

/// A single physical constant plus the plausible range it may take.
///
/// `low`/`high` are what drive the uncertainty band, so a property whose range
/// is unknown should repeat `value` rather than invent a spread.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Property {
    pub value: f64,
    pub low: f64,
    pub high: f64,
    pub unit: &'static str,
    pub source: &'static str,
    pub review_status: &'static str,
}

const fn prop(
    value: f64,
    low: f64,
    high: f64,
    unit: &'static str,
    source: &'static str,
) -> Property {
    Property {
        value,
        low,
        high,
        unit,
        source,
        review_status: UNREVIEWED,
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TissueLayerSpec {
    pub name: &'static str,
    pub thickness_m: Property,
    pub density_kg_per_m3: Property,
    pub specific_heat_j_per_kg_k: Property,
    pub conductivity_w_per_m_k: Property,
    pub perfusion_per_s: Property,
    pub metabolic_w_per_m3: Property,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinProfile {
    pub id: &'static str,
    pub label: &'static str,
    pub site: &'static str,
    pub description: &'static str,
    /// What the shallow depth marker (bottom of the first layer) represents in
    /// this tissue. For skin this is the basal layer; for other tissues the
    /// label keeps reported temperatures from silently implying skin anatomy.
    pub shallow_marker_label: &'static str,
    /// What the deep depth marker (bottom of the first two layers) represents.
    pub deep_marker_label: &'static str,
    /// Broad tissue family, used only to group profiles in the interface.
    pub category: &'static str,
    pub baseline_skin_c: Property,
    pub core_c: Property,
    pub blood_c: Property,
    pub blood_density_kg_per_m3: Property,
    pub blood_specific_heat_j_per_kg_k: Property,
    pub layers: &'static [TissueLayerSpec],
    pub citations: &'static [&'static str],
    pub review_status: &'static str,
}

impl SkinProfile {
    /// Depth of the dermal–epidermal junction, i.e. the basal layer where
    /// partial-thickness burn depth is conventionally assessed.
    pub fn basal_depth_m(&self) -> f64 {
        self.layers
            .first()
            .map(|layer| layer.thickness_m.value)
            .unwrap_or(0.0)
    }

    /// Depth of the dermis/subcutis boundary, the usual marker for a
    /// full-thickness (third-degree) burn.
    pub fn dermal_base_depth_m(&self) -> f64 {
        self.layers
            .iter()
            .take(2)
            .map(|layer| layer.thickness_m.value)
            .sum()
    }
}

const TISSUE_SOURCE: &str =
    "Representative human-skin values as compiled in bioheat-transfer literature \
     (e.g. Duck FA 1990, Physical Properties of Tissue; IT'IS Foundation Tissue Properties Database).";
const THICKNESS_SOURCE: &str =
    "Representative site-specific layer thicknesses reported in dermatological \
     morphometry literature; verify against the primary source for the target population.";

const fn epidermis(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Epidermis",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        // Avascular and essentially metabolically inert on the timescales here.
        density_kg_per_m3: prop(1200.0, 1100.0, 1250.0, "kg/m^3", TISSUE_SOURCE),
        specific_heat_j_per_kg_k: prop(3590.0, 3300.0, 3800.0, "J/(kg K)", TISSUE_SOURCE),
        conductivity_w_per_m_k: prop(0.235, 0.200, 0.280, "W/(m K)", TISSUE_SOURCE),
        perfusion_per_s: prop(0.0, 0.0, 0.0, "1/s", "Epidermis is avascular."),
        metabolic_w_per_m3: prop(0.0, 0.0, 0.0, "W/m^3", "Neglected in the epidermis."),
    }
}

const fn dermis(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Dermis",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1200.0, 1100.0, 1250.0, "kg/m^3", TISSUE_SOURCE),
        specific_heat_j_per_kg_k: prop(3300.0, 3200.0, 3600.0, "J/(kg K)", TISSUE_SOURCE),
        conductivity_w_per_m_k: prop(0.445, 0.370, 0.500, "W/(m K)", TISSUE_SOURCE),
        // Cutaneous perfusion swings by more than an order of magnitude with
        // vasodilation, which is why the range here is deliberately wide.
        perfusion_per_s: prop(0.0016, 0.0002, 0.0100, "1/s", TISSUE_SOURCE),
        metabolic_w_per_m3: prop(368.0, 200.0, 800.0, "W/m^3", TISSUE_SOURCE),
    }
}

const fn subcutis(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Subcutaneous fat",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1000.0, 850.0, 1050.0, "kg/m^3", TISSUE_SOURCE),
        specific_heat_j_per_kg_k: prop(2670.0, 2300.0, 2800.0, "J/(kg K)", TISSUE_SOURCE),
        conductivity_w_per_m_k: prop(0.185, 0.160, 0.250, "W/(m K)", TISSUE_SOURCE),
        perfusion_per_s: prop(0.0010, 0.0002, 0.0030, "1/s", TISSUE_SOURCE),
        metabolic_w_per_m3: prop(368.0, 200.0, 600.0, "W/m^3", TISSUE_SOURCE),
    }
}

/// Deep tissue exists only to push the fixed-temperature boundary far enough
/// away that it stops influencing the near-surface answer.
const fn muscle(thickness_m: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Muscle / deep tissue",
        thickness_m: prop(thickness_m, thickness_m, thickness_m, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1085.0, 1040.0, 1110.0, "kg/m^3", TISSUE_SOURCE),
        specific_heat_j_per_kg_k: prop(3800.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        conductivity_w_per_m_k: prop(0.510, 0.450, 0.560, "W/(m K)", TISSUE_SOURCE),
        perfusion_per_s: prop(0.0007, 0.0003, 0.0030, "1/s", TISSUE_SOURCE),
        metabolic_w_per_m3: prop(684.0, 500.0, 1000.0, "W/m^3", TISSUE_SOURCE),
    }
}

const BASELINE_SOURCE: &str =
    "Typical resting skin/core temperatures at thermoneutral ambient conditions; \
     measure and override for a specific protocol.";

const VOLAR_FOREARM_LAYERS: &[TissueLayerSpec] = &[
    epidermis(0.000_075, 0.000_050, 0.000_120),
    dermis(0.001_100, 0.000_800, 0.001_500),
    subcutis(0.001_200, 0.000_500, 0.004_000),
    muscle(0.030_000),
];

const PALM_LAYERS: &[TissueLayerSpec] = &[
    epidermis(0.000_600, 0.000_400, 0.000_900),
    dermis(0.001_500, 0.001_000, 0.002_200),
    subcutis(0.002_000, 0.001_000, 0.005_000),
    muscle(0.025_000),
];

const FINGERTIP_LAYERS: &[TissueLayerSpec] = &[
    epidermis(0.000_370, 0.000_200, 0.000_800),
    dermis(0.001_200, 0.000_900, 0.001_800),
    subcutis(0.001_000, 0.000_400, 0.002_500),
    muscle(0.012_000),
];

const UPPER_BACK_LAYERS: &[TissueLayerSpec] = &[
    epidermis(0.000_080, 0.000_050, 0.000_120),
    dermis(0.002_000, 0.001_400, 0.003_000),
    subcutis(0.005_000, 0.002_000, 0.012_000),
    muscle(0.030_000),
];

const ABDOMEN_LAYERS: &[TissueLayerSpec] = &[
    epidermis(0.000_070, 0.000_050, 0.000_110),
    dermis(0.001_400, 0.001_000, 0.002_000),
    subcutis(0.010_000, 0.004_000, 0.030_000),
    muscle(0.025_000),
];

const COMMON_CITATIONS: &[&str] = &[
    "Pennes HH (1948). Analysis of tissue and arterial blood temperatures in the resting human forearm. J Appl Physiol 1(2):93-122.",
    "Duck FA (1990). Physical Properties of Tissue: A Comprehensive Reference Book. Academic Press.",
    "Hasgall PA et al. IT'IS Database for thermal and electromagnetic parameters of biological tissues.",
];

const SKIN_SHALLOW_MARKER: &str = "Basal layer (dermo-epidermal junction)";
const SKIN_DEEP_MARKER: &str = "Dermal base (dermis–fat boundary)";

// ---------------------------------------------------------------------------
// Additional organic tissues
//
// These extend the model beyond skin. The same layered 1D Pennes solver is
// used, so every entry is a genuine conduction/perfusion stack; the marker
// labels above are set per tissue so a reported depth is never silently
// interpreted as skin anatomy. Values are representative literature figures and
// remain Unreviewed in-app, consistent with the skin profiles.
// ---------------------------------------------------------------------------

const BONE_SOURCE: &str =
    "Cortical/trabecular bone and marrow properties compiled in tissue databases \
     (IT'IS Foundation) with direct femoral measurements (Biyikli et al. 1986).";
const KERATIN_SOURCE: &str =
    "Keratin fibre conductivity ~0.2 W/(m K) from materials literature; the effective \
     hair-canopy value is lower because the canopy is mostly entrained air.";
const CARTILAGE_SOURCE: &str =
    "Hyaline (articular) cartilage properties from tissue databases (IT'IS Foundation) \
     and Duck (1990); cartilage is avascular so perfusion is taken as zero.";
const INVITRO_SOURCE: &str =
    "Cultured-cell construct approximated as an aqueous/lipid medium near 310 K \
     (water properties, CRC Handbook). No perfusion in vitro.";

/// Whole-skin cover treated as one layer, so the first depth marker lands on the
/// skin–tissue interface rather than inside the epidermis.
const fn skin_cover(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Skin (epidermis + dermis)",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1150.0, 1100.0, 1250.0, "kg/m^3", TISSUE_SOURCE),
        specific_heat_j_per_kg_k: prop(3400.0, 3200.0, 3700.0, "J/(kg K)", TISSUE_SOURCE),
        conductivity_w_per_m_k: prop(0.370, 0.300, 0.450, "W/(m K)", TISSUE_SOURCE),
        perfusion_per_s: prop(0.0016, 0.0002, 0.0100, "1/s", TISSUE_SOURCE),
        metabolic_w_per_m3: prop(400.0, 200.0, 800.0, "W/m^3", TISSUE_SOURCE),
    }
}

const fn cortical_bone(
    name: &'static str,
    thickness_m: f64,
    low: f64,
    high: f64,
) -> TissueLayerSpec {
    TissueLayerSpec {
        name,
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1908.0, 1700.0, 2000.0, "kg/m^3", BONE_SOURCE),
        specific_heat_j_per_kg_k: prop(1313.0, 1100.0, 1500.0, "J/(kg K)", BONE_SOURCE),
        conductivity_w_per_m_k: prop(0.320, 0.200, 0.580, "W/(m K)", BONE_SOURCE),
        // Cortical bone is poorly perfused on these timescales.
        perfusion_per_s: prop(0.0001, 0.0, 0.0003, "1/s", BONE_SOURCE),
        metabolic_w_per_m3: prop(26.0, 0.0, 100.0, "W/m^3", BONE_SOURCE),
    }
}

const fn trabecular_bone(thickness_m: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Trabecular bone",
        thickness_m: prop(thickness_m, thickness_m, thickness_m, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1178.0, 900.0, 1400.0, "kg/m^3", BONE_SOURCE),
        specific_heat_j_per_kg_k: prop(2274.0, 1800.0, 2500.0, "J/(kg K)", BONE_SOURCE),
        conductivity_w_per_m_k: prop(0.310, 0.200, 0.400, "W/(m K)", BONE_SOURCE),
        perfusion_per_s: prop(0.0008, 0.0003, 0.0030, "1/s", BONE_SOURCE),
        metabolic_w_per_m3: prop(26.0, 0.0, 100.0, "W/m^3", BONE_SOURCE),
    }
}

const fn yellow_marrow(thickness_m: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Bone marrow",
        thickness_m: prop(thickness_m, thickness_m, thickness_m, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(980.0, 900.0, 1050.0, "kg/m^3", BONE_SOURCE),
        specific_heat_j_per_kg_k: prop(2700.0, 2000.0, 3000.0, "J/(kg K)", BONE_SOURCE),
        conductivity_w_per_m_k: prop(0.185, 0.150, 0.300, "W/(m K)", BONE_SOURCE),
        perfusion_per_s: prop(0.0002, 0.0, 0.0010, "1/s", BONE_SOURCE),
        metabolic_w_per_m3: prop(5.0, 0.0, 50.0, "W/m^3", BONE_SOURCE),
    }
}

const fn hair_canopy(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Hair canopy (keratin + air)",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        // Effective medium: sparse keratin fibres in air, so both the density
        // and the conductivity are far below solid keratin.
        density_kg_per_m3: prop(250.0, 100.0, 500.0, "kg/m^3", KERATIN_SOURCE),
        specific_heat_j_per_kg_k: prop(1500.0, 1000.0, 2000.0, "J/(kg K)", KERATIN_SOURCE),
        conductivity_w_per_m_k: prop(0.100, 0.050, 0.200, "W/(m K)", KERATIN_SOURCE),
        perfusion_per_s: prop(0.0, 0.0, 0.0, "1/s", "Hair is not perfused."),
        metabolic_w_per_m3: prop(0.0, 0.0, 0.0, "W/m^3", "Hair is metabolically inert."),
    }
}

const fn scalp_skin(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Scalp skin",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1150.0, 1100.0, 1250.0, "kg/m^3", TISSUE_SOURCE),
        specific_heat_j_per_kg_k: prop(3400.0, 3200.0, 3700.0, "J/(kg K)", TISSUE_SOURCE),
        conductivity_w_per_m_k: prop(0.340, 0.300, 0.450, "W/(m K)", TISSUE_SOURCE),
        // The scalp is among the most vascular skin sites.
        perfusion_per_s: prop(0.0030, 0.0010, 0.0120, "1/s", TISSUE_SOURCE),
        metabolic_w_per_m3: prop(500.0, 200.0, 900.0, "W/m^3", TISSUE_SOURCE),
    }
}

const fn galea(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Galea / sub-galeal fat",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1000.0, 900.0, 1050.0, "kg/m^3", TISSUE_SOURCE),
        specific_heat_j_per_kg_k: prop(2500.0, 2300.0, 2800.0, "J/(kg K)", TISSUE_SOURCE),
        conductivity_w_per_m_k: prop(0.210, 0.160, 0.260, "W/(m K)", TISSUE_SOURCE),
        perfusion_per_s: prop(0.0008, 0.0002, 0.0030, "1/s", TISSUE_SOURCE),
        metabolic_w_per_m3: prop(300.0, 150.0, 600.0, "W/m^3", TISSUE_SOURCE),
    }
}

const fn cartilage(name: &'static str, thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name,
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1100.0, 1050.0, 1150.0, "kg/m^3", CARTILAGE_SOURCE),
        specific_heat_j_per_kg_k: prop(3568.0, 3200.0, 3800.0, "J/(kg K)", CARTILAGE_SOURCE),
        conductivity_w_per_m_k: prop(0.490, 0.210, 0.550, "W/(m K)", CARTILAGE_SOURCE),
        // Avascular.
        perfusion_per_s: prop(0.0, 0.0, 0.0, "1/s", "Cartilage is avascular."),
        metabolic_w_per_m3: prop(150.0, 50.0, 400.0, "W/m^3", CARTILAGE_SOURCE),
    }
}

const fn cell_construct(thickness_m: f64, low: f64, high: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name: "Cultured cell construct",
        thickness_m: prop(thickness_m, low, high, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1050.0, 1010.0, 1100.0, "kg/m^3", INVITRO_SOURCE),
        specific_heat_j_per_kg_k: prop(3900.0, 3700.0, 4100.0, "J/(kg K)", INVITRO_SOURCE),
        conductivity_w_per_m_k: prop(0.520, 0.450, 0.600, "W/(m K)", INVITRO_SOURCE),
        perfusion_per_s: prop(0.0, 0.0, 0.0, "1/s", "No perfusion in vitro."),
        metabolic_w_per_m3: prop(0.0, 0.0, 0.0, "W/m^3", INVITRO_SOURCE),
    }
}

const fn culture_medium(name: &'static str, thickness_m: f64) -> TissueLayerSpec {
    TissueLayerSpec {
        name,
        thickness_m: prop(thickness_m, thickness_m, thickness_m, "m", THICKNESS_SOURCE),
        density_kg_per_m3: prop(1000.0, 995.0, 1010.0, "kg/m^3", INVITRO_SOURCE),
        specific_heat_j_per_kg_k: prop(4180.0, 4150.0, 4200.0, "J/(kg K)", INVITRO_SOURCE),
        conductivity_w_per_m_k: prop(0.600, 0.580, 0.620, "W/(m K)", INVITRO_SOURCE),
        perfusion_per_s: prop(0.0, 0.0, 0.0, "1/s", "No perfusion in vitro."),
        metabolic_w_per_m3: prop(0.0, 0.0, 0.0, "W/m^3", INVITRO_SOURCE),
    }
}

const CORTICAL_BONE_LAYERS: &[TissueLayerSpec] = &[
    skin_cover(0.001_500, 0.001_000, 0.002_500),
    cortical_bone("Cortical bone", 0.004_000, 0.002_000, 0.007_000),
    trabecular_bone(0.006_000),
    yellow_marrow(0.020_000),
];

const SCALP_HAIR_LAYERS: &[TissueLayerSpec] = &[
    hair_canopy(0.003_000, 0.001_000, 0.010_000),
    scalp_skin(0.001_800, 0.001_000, 0.003_000),
    galea(0.003_000, 0.001_000, 0.006_000),
    cortical_bone("Skull (outer table)", 0.006_000, 0.003_000, 0.009_000),
    trabecular_bone(0.018_000),
];

const CARTILAGE_LAYERS: &[TissueLayerSpec] = &[
    cartilage("Superficial cartilage", 0.000_800, 0.000_400, 0.001_500),
    cartilage("Deep cartilage", 0.001_500, 0.001_000, 0.003_000),
    cortical_bone("Subchondral bone", 0.003_000, 0.001_500, 0.005_000),
    yellow_marrow(0.020_000),
];

const CELL_MEMBRANE_LAYERS: &[TissueLayerSpec] = &[
    cell_construct(0.000_200, 0.000_100, 0.000_500),
    culture_medium("Culture medium", 0.001_800),
    culture_medium("Culture medium (deep)", 0.004_000),
];

const BONE_CITATIONS: &[&str] = &[
    "Biyikli S, Modest MF, Tarr R (1986). Measurements of thermal properties for human femora. J Biomed Mater Res 20(9):1335-1345.",
    "Hasgall PA et al. IT'IS Database for thermal and electromagnetic parameters of biological tissues.",
    "Duck FA (1990). Physical Properties of Tissue. Academic Press.",
];

const HAIR_CITATIONS: &[&str] = &[
    "Hasgall PA et al. IT'IS Database (skin, fat, cortical bone).",
    "Keratin fibre thermal conductivity ~0.2 W/(m K) (materials literature); effective canopy value reduced by entrained air.",
    "Duck FA (1990). Physical Properties of Tissue. Academic Press.",
];

const CARTILAGE_CITATIONS: &[&str] = &[
    "Hasgall PA et al. IT'IS Database (cartilage, bone).",
    "Duck FA (1990). Physical Properties of Tissue. Academic Press.",
];

const CELL_CITATIONS: &[&str] = &[
    "Aqueous/cytoplasm properties approximated by water near 310 K (CRC Handbook of Chemistry and Physics).",
    "Scale note: a molecular lipid bilayer is ~5 nm; this profile is a bulk-thermal analogue of a cultured construct, not a resolved membrane.",
];

pub static SKIN_PROFILES: &[SkinProfile] = &[
    SkinProfile {
        id: "volar-forearm",
        label: "Volar forearm",
        site: "Volar (inner) forearm",
        description:
            "Thin epidermis and moderate dermis. The site most thermal-injury threshold work was performed on.",
        shallow_marker_label: SKIN_SHALLOW_MARKER,
        deep_marker_label: SKIN_DEEP_MARKER,
        category: "Skin",
        baseline_skin_c: prop(33.0, 30.0, 35.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: VOLAR_FOREARM_LAYERS,
        citations: COMMON_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "palm",
        label: "Palm (glabrous)",
        site: "Palmar hand",
        description:
            "Thick stratum corneum raises the surface thermal resistance and delays deep heating.",
        shallow_marker_label: SKIN_SHALLOW_MARKER,
        deep_marker_label: SKIN_DEEP_MARKER,
        category: "Skin",
        baseline_skin_c: prop(33.5, 30.0, 36.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: PALM_LAYERS,
        citations: COMMON_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "fingertip",
        label: "Fingertip",
        site: "Distal finger pad",
        description:
            "Thick epidermis over shallow tissue. Small contact patches here are the least likely to satisfy the 1D assumption.",
        shallow_marker_label: SKIN_SHALLOW_MARKER,
        deep_marker_label: SKIN_DEEP_MARKER,
        category: "Skin",
        baseline_skin_c: prop(32.0, 28.0, 35.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: FINGERTIP_LAYERS,
        citations: COMMON_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "upper-back",
        label: "Upper back",
        site: "Upper back / scapular",
        description: "Thick dermis with a substantial fat layer beneath.",
        shallow_marker_label: SKIN_SHALLOW_MARKER,
        deep_marker_label: SKIN_DEEP_MARKER,
        category: "Skin",
        baseline_skin_c: prop(34.0, 32.0, 36.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: UPPER_BACK_LAYERS,
        citations: COMMON_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "abdomen",
        label: "Abdomen",
        site: "Anterior abdominal wall",
        description: "Deep subcutaneous fat strongly insulates the deeper tissue.",
        shallow_marker_label: SKIN_SHALLOW_MARKER,
        deep_marker_label: SKIN_DEEP_MARKER,
        category: "Skin",
        baseline_skin_c: prop(34.0, 32.0, 36.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: ABDOMEN_LAYERS,
        citations: COMMON_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "cortical-bone",
        label: "Bone (subcutaneous, shin)",
        site: "Anterior tibia (bone just under thin skin)",
        description:
            "Thin skin directly over cortical bone, then trabecular bone and marrow. A site where a device heats bone with almost no soft-tissue buffer.",
        shallow_marker_label: "Skin–bone interface",
        deep_marker_label: "Cortical bone base",
        category: "Bone",
        baseline_skin_c: prop(33.0, 30.0, 35.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: CORTICAL_BONE_LAYERS,
        citations: BONE_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "scalp-hair",
        label: "Scalp with hair",
        site: "Haired scalp over skull",
        description:
            "An insulating hair canopy over vascular scalp skin, galea and skull. The hair canopy is modelled as an effective keratin-and-air medium, so it strongly buffers surface heat.",
        shallow_marker_label: "Scalp surface (under hair)",
        deep_marker_label: "Scalp base (sub-galeal plane)",
        category: "Skin / adnexa",
        baseline_skin_c: prop(34.5, 33.0, 36.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: SCALP_HAIR_LAYERS,
        citations: HAIR_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "articular-cartilage",
        label: "Articular cartilage (joint)",
        site: "Hyaline cartilage over subchondral bone",
        description:
            "Avascular hyaline cartilage over subchondral bone and marrow. With no perfusion to carry heat away, the cartilage relies on conduction alone.",
        shallow_marker_label: "Mid-cartilage zone",
        deep_marker_label: "Osteochondral (cartilage–bone) junction",
        category: "Cartilage",
        baseline_skin_c: prop(32.0, 28.0, 35.0, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: CARTILAGE_LAYERS,
        citations: CARTILAGE_CITATIONS,
        review_status: UNREVIEWED,
    },
    SkinProfile {
        id: "cell-membrane",
        label: "Cell membrane / monolayer (in vitro)",
        site: "Cultured cell construct in medium",
        description:
            "A cultured-cell construct in aqueous medium, for in-vitro thermal-dose exploration. A real lipid bilayer is nanometres thick, so this is a bulk-thermal analogue rather than a resolved membrane, and the skin burn thresholds do not physically apply.",
        shallow_marker_label: "Construct base",
        deep_marker_label: "Construct–medium column",
        category: "In-vitro",
        baseline_skin_c: prop(37.0, 36.0, 37.5, "degC", BASELINE_SOURCE),
        core_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_c: prop(37.0, 36.5, 37.5, "degC", BASELINE_SOURCE),
        blood_density_kg_per_m3: prop(1060.0, 1040.0, 1070.0, "kg/m^3", TISSUE_SOURCE),
        blood_specific_heat_j_per_kg_k: prop(3770.0, 3600.0, 3900.0, "J/(kg K)", TISSUE_SOURCE),
        layers: CELL_MEMBRANE_LAYERS,
        citations: CELL_CITATIONS,
        review_status:
            "In-vitro bulk-thermal analogue. Burn-depth and Ω interpretation are not physically meaningful at cellular scale; use for relative thermal-dose comparison only.",
    },
];

pub const DEFAULT_SKIN_PROFILE_ID: &str = "volar-forearm";

pub fn skin_profile(id: &str) -> Option<&'static SkinProfile> {
    SKIN_PROFILES.iter().find(|profile| profile.id == id)
}

// ---------------------------------------------------------------------------
// Device and interface materials
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceMaterial {
    pub id: &'static str,
    pub label: &'static str,
    pub density_kg_per_m3: f64,
    pub specific_heat_j_per_kg_k: f64,
    pub conductivity_w_per_m_k: f64,
    /// Vickers-equivalent microhardness of the softer contacting surface, used
    /// by the pressure-dependent contact-conductance correlation.
    pub microhardness_pa: f64,
    pub source: &'static str,
}

const MATERIAL_SOURCE: &str =
    "Nominal room-temperature engineering values; substitute the datasheet value for the actual grade.";

pub static DEVICE_MATERIALS: &[DeviceMaterial] = &[
    DeviceMaterial {
        id: "aluminium-6061",
        label: "Aluminium 6061",
        density_kg_per_m3: 2700.0,
        specific_heat_j_per_kg_k: 896.0,
        conductivity_w_per_m_k: 167.0,
        microhardness_pa: 1.0e9,
        source: MATERIAL_SOURCE,
    },
    DeviceMaterial {
        id: "stainless-316",
        label: "Stainless steel 316",
        density_kg_per_m3: 8000.0,
        specific_heat_j_per_kg_k: 500.0,
        conductivity_w_per_m_k: 16.3,
        microhardness_pa: 1.8e9,
        source: MATERIAL_SOURCE,
    },
    DeviceMaterial {
        id: "copper",
        label: "Copper C110",
        density_kg_per_m3: 8940.0,
        specific_heat_j_per_kg_k: 385.0,
        conductivity_w_per_m_k: 398.0,
        microhardness_pa: 0.9e9,
        source: MATERIAL_SOURCE,
    },
    DeviceMaterial {
        id: "abs",
        label: "ABS plastic",
        density_kg_per_m3: 1040.0,
        specific_heat_j_per_kg_k: 1400.0,
        conductivity_w_per_m_k: 0.17,
        microhardness_pa: 0.15e9,
        source: MATERIAL_SOURCE,
    },
    DeviceMaterial {
        id: "polycarbonate",
        label: "Polycarbonate",
        density_kg_per_m3: 1200.0,
        specific_heat_j_per_kg_k: 1200.0,
        conductivity_w_per_m_k: 0.21,
        microhardness_pa: 0.16e9,
        source: MATERIAL_SOURCE,
    },
    DeviceMaterial {
        id: "silicone-rubber",
        label: "Silicone rubber",
        density_kg_per_m3: 1150.0,
        specific_heat_j_per_kg_k: 1300.0,
        conductivity_w_per_m_k: 0.22,
        microhardness_pa: 0.01e9,
        source: MATERIAL_SOURCE,
    },
    DeviceMaterial {
        id: "borosilicate-glass",
        label: "Borosilicate glass",
        density_kg_per_m3: 2230.0,
        specific_heat_j_per_kg_k: 830.0,
        conductivity_w_per_m_k: 1.14,
        microhardness_pa: 5.0e9,
        source: MATERIAL_SOURCE,
    },
    DeviceMaterial {
        id: "ptfe",
        label: "PTFE",
        density_kg_per_m3: 2200.0,
        specific_heat_j_per_kg_k: 1000.0,
        conductivity_w_per_m_k: 0.25,
        microhardness_pa: 0.06e9,
        source: MATERIAL_SOURCE,
    },
];

pub const DEFAULT_DEVICE_MATERIAL_ID: &str = "aluminium-6061";

pub fn device_material(id: &str) -> Option<&'static DeviceMaterial> {
    DEVICE_MATERIALS.iter().find(|material| material.id == id)
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceMaterial {
    pub id: &'static str,
    pub label: &'static str,
    pub conductivity_w_per_m_k: f64,
    pub default_thickness_um: f64,
    /// When true the gap is treated as a solid-solid contact and the
    /// pressure-dependent correlation is applied instead of a fixed film.
    pub pressure_dependent: bool,
    pub source: &'static str,
}

pub static INTERFACE_MATERIALS: &[InterfaceMaterial] = &[
    InterfaceMaterial {
        id: "dry-contact",
        label: "Dry skin contact (pressure-dependent)",
        conductivity_w_per_m_k: 0.026,
        default_thickness_um: 20.0,
        pressure_dependent: true,
        source:
            "Air-filled asperity gap; conductance estimated from a Cooper-Mikic-Yovanovich-style contact correlation.",
    },
    InterfaceMaterial {
        id: "air-gap",
        label: "Still air gap",
        conductivity_w_per_m_k: 0.026,
        default_thickness_um: 100.0,
        pressure_dependent: false,
        source: "Thermal conductivity of dry air near 300 K.",
    },
    InterfaceMaterial {
        id: "hydrogel",
        label: "Hydrogel / conductive gel",
        conductivity_w_per_m_k: 0.59,
        default_thickness_um: 250.0,
        pressure_dependent: false,
        source: "Approximated by the conductivity of water, the dominant constituent.",
    },
    InterfaceMaterial {
        id: "water-film",
        label: "Water / sweat film",
        conductivity_w_per_m_k: 0.61,
        default_thickness_um: 30.0,
        pressure_dependent: false,
        source: "Thermal conductivity of liquid water near 310 K.",
    },
    InterfaceMaterial {
        id: "silicone-pad",
        label: "Silicone thermal pad",
        conductivity_w_per_m_k: 1.50,
        default_thickness_um: 500.0,
        pressure_dependent: false,
        source: "Typical filled-silicone gap-pad datasheet value.",
    },
    InterfaceMaterial {
        id: "medical-tape",
        label: "Medical adhesive tape",
        conductivity_w_per_m_k: 0.15,
        default_thickness_um: 150.0,
        pressure_dependent: false,
        source: "Typical acrylic/polymer adhesive tape value.",
    },
    InterfaceMaterial {
        id: "fabric",
        label: "Thin fabric layer",
        conductivity_w_per_m_k: 0.045,
        default_thickness_um: 400.0,
        pressure_dependent: false,
        source: "Typical woven-textile effective conductivity including trapped air.",
    },
];

pub const DEFAULT_INTERFACE_MATERIAL_ID: &str = "dry-contact";

pub fn interface_material(id: &str) -> Option<&'static InterfaceMaterial> {
    INTERFACE_MATERIALS
        .iter()
        .find(|material| material.id == id)
}

// ---------------------------------------------------------------------------
// Thermal damage kinetics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrheniusRegime {
    /// Upper temperature bound for this regime, in degrees Celsius.
    /// `None` means the regime has no upper bound.
    pub max_temperature_c: Option<f64>,
    pub frequency_factor_per_s: f64,
    pub activation_energy_j_per_mol: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DamageModel {
    pub id: &'static str,
    pub label: &'static str,
    /// Damage integration starts here; below it the Arrhenius fit is not
    /// considered applicable and the rate is taken as zero.
    pub threshold_c: f64,
    pub regimes: &'static [ArrheniusRegime],
    pub citation: &'static str,
    pub review_status: &'static str,
}

const HENRIQUES_REGIMES: &[ArrheniusRegime] = &[ArrheniusRegime {
    max_temperature_c: None,
    frequency_factor_per_s: 3.1e98,
    activation_energy_j_per_mol: 6.28e5,
}];

pub static DAMAGE_MODELS: &[DamageModel] = &[DamageModel {
    id: "henriques-1947",
    label: "Henriques single-regime Arrhenius",
    threshold_c: 44.0,
    regimes: HENRIQUES_REGIMES,
    citation:
        "Henriques FC (1947). Studies of thermal injury V: the predictability and significance of thermally induced rate processes leading to irreversible epidermal injury. Arch Pathol 43:489-502.",
    review_status:
        "Coefficients are the values most widely reproduced in secondary literature and are NOT source-verified in-app. Confirm against the primary paper before using them in a validation claim.",
}];

pub const DEFAULT_DAMAGE_MODEL_ID: &str = "henriques-1947";

pub fn damage_model(id: &str) -> Option<&'static DamageModel> {
    DAMAGE_MODELS.iter().find(|model| model.id == id)
}

pub const GAS_CONSTANT_J_PER_MOL_K: f64 = 8.314_462_618;

impl DamageModel {
    /// Instantaneous Arrhenius damage rate dΩ/dt at a given temperature.
    pub fn rate(&self, temperature_c: f64) -> f64 {
        if temperature_c < self.threshold_c {
            return 0.0;
        }

        let regime = self
            .regimes
            .iter()
            .find(|regime| {
                regime
                    .max_temperature_c
                    .is_none_or(|bound| temperature_c <= bound)
            })
            .or_else(|| self.regimes.last());

        let Some(regime) = regime else {
            return 0.0;
        };

        let temperature_k = temperature_c + 273.15;
        regime.frequency_factor_per_s
            * (-regime.activation_energy_j_per_mol / (GAS_CONSTANT_J_PER_MOL_K * temperature_k))
                .exp()
    }
}

/// Burn severity implied by where the damage integral reaches unity.
///
/// This reports the depth the model places the Ω = 1 isopleth at; it is not a
/// clinical diagnosis.
pub fn burn_classification(omega_basal: f64, omega_dermal_base: f64) -> &'static str {
    if omega_dermal_base >= 1.0 {
        "Ω ≥ 1 at the dermal base (full-thickness depth in this model)"
    } else if omega_basal >= 1.0 {
        "Ω ≥ 1 at the basal layer (partial-thickness depth in this model)"
    } else if omega_basal >= 0.53 {
        "Ω approaching the basal-layer injury threshold"
    } else if omega_basal > 0.0 {
        "measurable damage integral, below the model threshold"
    } else {
        "no accumulation above the model threshold temperature"
    }
}
