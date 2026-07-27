//! One-dimensional Pennes bioheat solver.
//!
//! Formulation notes that matter for accuracy:
//!
//! * **Finite volume, not finite difference.** Each cell is a control volume
//!   and the scheme transports fluxes across faces, so energy is conserved to
//!   round-off even where material properties jump.
//! * **Harmonic-mean face conductivity.** At a layer interface the series
//!   resistance of the two half-cells is what governs the flux; averaging the
//!   conductivities arithmetically would let heat cross the epidermis/dermis
//!   boundary too easily.
//! * **Crank–Nicolson in time.** Second-order and unconditionally stable, which
//!   decouples the timestep from the near-surface cell size and lets the mesh
//!   be graded finely at the surface where the gradient actually lives.
//! * **Graded mesh.** Cells start small at the surface and grow geometrically,
//!   always terminating exactly on a layer boundary.

use super::model::DamageModel;

/// Crank–Nicolson weighting. 0.5 is second-order; 1.0 would be backward Euler.
const THETA: f64 = 0.5;

/// Number of fully implicit steps to take at the start of each phase.
///
/// Applying or removing a device is a step change in the boundary condition,
/// and Crank–Nicolson responds to a discontinuity with a decaying oscillation
/// concentrated in the near-surface cells. Damping the first couple of steps
/// with backward Euler removes it. Two first-order steps contribute O(dt²)
/// total, so the scheme stays second-order overall.
const RANNACHER_STEPS: usize = 2;

#[derive(Debug, Clone, Copy)]
pub struct LayerMaterial {
    pub thickness_m: f64,
    pub density_kg_per_m3: f64,
    pub specific_heat_j_per_kg_k: f64,
    pub conductivity_w_per_m_k: f64,
    pub perfusion_per_s: f64,
    pub metabolic_w_per_m3: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct Cell {
    pub center_m: f64,
    pub width_m: f64,
    pub conductivity: f64,
    /// ρ·c, the volumetric heat capacity [J/(m³ K)].
    pub volumetric_heat_capacity: f64,
    /// ω_b·ρ_b·c_b, the Pennes perfusion coefficient [W/(m³ K)].
    pub perfusion_coefficient: f64,
    pub metabolic_w_per_m3: f64,
    pub layer_index: usize,
}

#[derive(Debug, Clone)]
pub struct Mesh {
    pub cells: Vec<Cell>,
    /// Face conductances between consecutive cell centres [W/(m² K)].
    pub face_conductance: Vec<f64>,
    pub depth_m: f64,
    pub blood_temperature_c: f64,
    pub core_temperature_c: f64,
}

/// Build a graded mesh that respects every layer boundary exactly.
///
/// Cells grow geometrically away from the surface up to `max_cell_m`. Within a
/// layer the widths are rescaled so they sum to the layer thickness exactly,
/// which keeps material interfaces on cell faces rather than inside a cell.
pub fn build_mesh(
    layers: &[LayerMaterial],
    surface_cell_m: f64,
    max_cell_m: f64,
    growth: f64,
    blood: BloodProperties,
    core_temperature_c: f64,
) -> Mesh {
    let mut cells: Vec<Cell> = Vec::new();
    let mut running_depth = 0.0;
    let mut next_width = surface_cell_m.max(1e-9);

    for (layer_index, layer) in layers.iter().enumerate() {
        if layer.thickness_m <= 0.0 {
            continue;
        }

        let mut widths: Vec<f64> = Vec::new();
        let mut accumulated = 0.0;
        let mut width = next_width.min(max_cell_m);

        while accumulated < layer.thickness_m {
            widths.push(width);
            accumulated += width;
            width = (width * growth).min(max_cell_m);
        }

        // Rescale so the layer closes exactly on its nominal thickness.
        let scale = layer.thickness_m / accumulated;
        for width in widths.iter_mut() {
            *width *= scale;
        }
        next_width = widths.last().copied().unwrap_or(next_width);

        for width in widths {
            cells.push(Cell {
                center_m: running_depth + width / 2.0,
                width_m: width,
                conductivity: layer.conductivity_w_per_m_k,
                volumetric_heat_capacity: layer.density_kg_per_m3 * layer.specific_heat_j_per_kg_k,
                perfusion_coefficient: layer.perfusion_per_s
                    * blood.density_kg_per_m3
                    * blood.specific_heat_j_per_kg_k,
                metabolic_w_per_m3: layer.metabolic_w_per_m3,
                layer_index,
            });
            running_depth += width;
        }
    }

    let face_conductance = cells
        .windows(2)
        .map(|pair| {
            let left = &pair[0];
            let right = &pair[1];
            // Series resistance of the two half-cells, which is exactly the
            // distance-weighted harmonic mean of the conductivities.
            1.0 / ((left.width_m / 2.0) / left.conductivity
                + (right.width_m / 2.0) / right.conductivity)
        })
        .collect();

    Mesh {
        cells,
        face_conductance,
        depth_m: running_depth,
        blood_temperature_c: blood.temperature_c,
        core_temperature_c,
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BloodProperties {
    pub temperature_c: f64,
    pub density_kg_per_m3: f64,
    pub specific_heat_j_per_kg_k: f64,
}

/// How cutaneous perfusion responds during a run.
///
/// Local thermal hyperemia is the dominant blood-flow effect under contact
/// heating: Mayrovitz et al. (2020) report ~8.8× forearm SBF at 42 °C, and the
/// EPOS 42 °C sessions show ~10× total perfusion relative to baseline.
#[derive(Debug, Clone, Copy)]
pub enum PerfusionModel {
    /// Constant baseline perfusion from the tissue profile.
    Static,
    /// Temperature-dependent local vasodilation (sigmoid).
    LocalHyperemia {
        /// Below this local tissue temperature the multiplier stays at 1.
        onset_c: f64,
        /// Temperature at which the fold-change is halfway to its maximum.
        half_max_c: f64,
        /// Peak perfusion / baseline (dimensionless), typically 8–12 for 42 °C.
        max_fold: f64,
        /// Sigmoid steepness in °C.
        steepness_c: f64,
    },
}

impl Default for PerfusionModel {
    fn default() -> Self {
        Self::LocalHyperemia {
            onset_c: 33.0,
            half_max_c: 39.0,
            max_fold: 9.0,
            steepness_c: 1.2,
        }
    }
}

impl PerfusionModel {
    pub fn multiplier(self, local_temperature_c: f64) -> f64 {
        match self {
            Self::Static => 1.0,
            Self::LocalHyperemia {
                onset_c,
                half_max_c,
                max_fold,
                steepness_c,
            } => {
                if local_temperature_c <= onset_c || max_fold <= 1.0 {
                    return 1.0;
                }
                let steepness = steepness_c.max(0.05);
                let fraction =
                    1.0 / (1.0 + (-(local_temperature_c - half_max_c) / steepness).exp());
                1.0 + (max_fold - 1.0) * fraction
            }
        }
    }
}

impl Default for BloodProperties {
    fn default() -> Self {
        Self {
            temperature_c: 37.0,
            density_kg_per_m3: 1060.0,
            specific_heat_j_per_kg_k: 3770.0,
        }
    }
}

impl Mesh {
    pub fn cell_count(&self) -> usize {
        self.cells.len()
    }

    /// Conductance from the outer skin surface to the first cell centre.
    fn half_cell_conductance_surface(&self) -> f64 {
        let first = &self.cells[0];
        first.conductivity / (first.width_m / 2.0)
    }

    /// Conductance from the last cell centre to the fixed deep boundary.
    fn half_cell_conductance_core(&self) -> f64 {
        let last = &self.cells[self.cells.len() - 1];
        last.conductivity / (last.width_m / 2.0)
    }

    /// Temperature at the true skin surface, recovered from the first cell by
    /// adding back the drop across its half-width.
    ///
    /// The first cell centre sits half a cell deep, so reporting its value as
    /// "surface temperature" would both understate the peak and make the
    /// reported number depend on the mesh.
    pub fn surface_temperature(&self, first_cell_c: f64, flux_w_per_m2: f64) -> f64 {
        let first = &self.cells[0];
        first_cell_c + flux_w_per_m2 * (first.width_m / 2.0) / first.conductivity
    }

    /// Linearly interpolate the field at an arbitrary depth between centres.
    pub fn interpolate(&self, field: &[f64], depth_m: f64) -> f64 {
        if self.cells.is_empty() {
            return f64::NAN;
        }
        if depth_m <= self.cells[0].center_m {
            return field[0];
        }
        for index in 0..self.cells.len() - 1 {
            let left = self.cells[index].center_m;
            let right = self.cells[index + 1].center_m;
            if depth_m <= right {
                let weight = (depth_m - left) / (right - left);
                return field[index] * (1.0 - weight) + field[index + 1] * weight;
            }
        }
        field[self.cells.len() - 1]
    }
}

/// How the skin surface exchanges heat during a phase of the run.
#[derive(Debug, Clone, Copy)]
pub enum SurfaceCoupling {
    /// Coupled through a finite conductance to a node held at a known
    /// temperature. Used for an ideal-controller device and for verification.
    Conductance { conductance: f64, external_c: f64 },
    /// Prescribed heat flux into the tissue. Verification only.
    Flux { flux_w_per_m2: f64 },
    /// Coupled to a device whose temperature is solved simultaneously.
    Device { conductance: f64 },
}

/// Controller behaviour for a device with finite thermal mass.
#[derive(Debug, Clone, Copy)]
pub enum DeviceControl {
    /// No power input; the device coasts down as it dumps heat into skin.
    Passive,
    /// Proportional control, saturating at a finite power density.
    Regulated {
        gain_w_per_m2_k: f64,
        max_flux_w_per_m2: f64,
    },
}

#[derive(Debug, Clone, Copy)]
pub struct DeviceModel {
    pub setpoint_c: f64,
    /// m·c/A, the device heat capacity per unit contact area [J/(m² K)].
    pub areal_heat_capacity_j_per_m2_k: f64,
    pub control: DeviceControl,
    /// Loss from the device's exposed back face to ambient [W/(m² K)].
    pub back_loss_w_per_m2_k: f64,
    pub ambient_c: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct Phase {
    pub duration_s: f64,
    pub surface: SurfaceCoupling,
    /// Present only when `surface` is `Device`.
    pub device: Option<DeviceModel>,
}

/// Running tally of every energy pathway, used to prove the discretisation is
/// conservative rather than merely plausible.
#[derive(Debug, Clone, Copy, Default)]
pub struct EnergyLedger {
    pub surface_in_j_per_m2: f64,
    pub core_out_j_per_m2: f64,
    pub perfusion_out_j_per_m2: f64,
    pub metabolic_in_j_per_m2: f64,
    pub stored_j_per_m2: f64,
}

impl EnergyLedger {
    pub fn residual_j_per_m2(&self) -> f64 {
        self.surface_in_j_per_m2 + self.metabolic_in_j_per_m2
            - self.core_out_j_per_m2
            - self.perfusion_out_j_per_m2
            - self.stored_j_per_m2
    }

    /// Residual as a fraction of the largest single pathway, so a tiny run and
    /// a large run are judged on the same scale.
    pub fn relative_residual(&self) -> f64 {
        let scale = self
            .surface_in_j_per_m2
            .abs()
            .max(self.core_out_j_per_m2.abs())
            .max(self.perfusion_out_j_per_m2.abs())
            .max(self.stored_j_per_m2.abs())
            .max(self.metabolic_in_j_per_m2.abs());

        if scale < 1e-12 {
            0.0
        } else {
            self.residual_j_per_m2().abs() / scale
        }
    }
}

pub struct SolverState {
    pub mesh: Mesh,
    pub temperature_c: Vec<f64>,
    pub device_temperature_c: f64,
    pub omega: Vec<f64>,
    pub peak_temperature_c: Vec<f64>,
    pub energy: EnergyLedger,
    pub elapsed_s: f64,
    /// Controller heat input per area from the most recent accepted step.
    pub controller_flux_w_per_m2: f64,
    /// True when the regulated controller used its configured power ceiling.
    pub controller_saturated: bool,
    initial_temperature_c: Vec<f64>,
    /// Baseline Pennes coefficients frozen at mesh build; scaled each step.
    baseline_perfusion_coefficient: Vec<f64>,
    perfusion_model: PerfusionModel,
}

/// Solve for the resting temperature profile before any device is applied.
///
/// Starting a run from a uniform core temperature would overstate the heat
/// needed to reach a given surface temperature; real skin already sits at a
/// gradient between its baseline surface value and the core.
pub fn steady_state(mesh: &Mesh, surface_temperature_c: f64) -> Vec<f64> {
    let count = mesh.cell_count();
    let mut lower = vec![0.0; count];
    let mut diagonal = vec![0.0; count];
    let mut upper = vec![0.0; count];
    let mut rhs = vec![0.0; count];

    let surface_conductance = mesh.half_cell_conductance_surface();
    let core_conductance = mesh.half_cell_conductance_core();

    for index in 0..count {
        let cell = &mesh.cells[index];
        let perfusion = cell.perfusion_coefficient * cell.width_m;
        let metabolic = cell.metabolic_w_per_m3 * cell.width_m;

        let left = if index == 0 {
            surface_conductance
        } else {
            mesh.face_conductance[index - 1]
        };
        let right = if index == count - 1 {
            core_conductance
        } else {
            mesh.face_conductance[index]
        };

        diagonal[index] = left + right + perfusion;
        rhs[index] = perfusion * mesh.blood_temperature_c + metabolic;

        if index == 0 {
            rhs[index] += left * surface_temperature_c;
        } else {
            lower[index] = -left;
        }

        if index == count - 1 {
            rhs[index] += right * mesh.core_temperature_c;
        } else {
            upper[index] = -right;
        }
    }

    solve_tridiagonal(&lower, &diagonal, &upper, &rhs)
}

impl SolverState {
    pub fn new(mesh: Mesh, initial: Vec<f64>, device_temperature_c: f64) -> Self {
        Self::with_perfusion(mesh, initial, device_temperature_c, PerfusionModel::Static)
    }

    pub fn with_perfusion(
        mesh: Mesh,
        initial: Vec<f64>,
        device_temperature_c: f64,
        perfusion_model: PerfusionModel,
    ) -> Self {
        let count = mesh.cell_count();
        let baseline_perfusion_coefficient = mesh
            .cells
            .iter()
            .map(|cell| cell.perfusion_coefficient)
            .collect();
        Self {
            temperature_c: initial.clone(),
            peak_temperature_c: initial.clone(),
            initial_temperature_c: initial,
            device_temperature_c,
            omega: vec![0.0; count],
            energy: EnergyLedger::default(),
            elapsed_s: 0.0,
            controller_flux_w_per_m2: 0.0,
            controller_saturated: false,
            baseline_perfusion_coefficient,
            perfusion_model,
            mesh,
        }
    }

    /// Scale each cell's perfusion from its baseline using the local tissue
    /// temperature from the previous accepted step (explicit lag of one dt).
    fn apply_perfusion_model(&mut self) {
        for index in 0..self.mesh.cells.len() {
            let multiplier = self
                .perfusion_model
                .multiplier(self.temperature_c[index]);
            self.mesh.cells[index].perfusion_coefficient =
                self.baseline_perfusion_coefficient[index] * multiplier;
        }
    }

    /// Local Pennes perfusion relative to the profile baseline at a reporting
    /// depth. Avascular layers report 1× so the chart remains interpretable.
    pub fn perfusion_fold_at_depth(&self, depth_m: f64) -> f64 {
        let cells = &self.mesh.cells;
        let (left, right, weight) = if depth_m <= cells[0].center_m {
            (0, 0, 0.0)
        } else {
            cells
                .windows(2)
                .enumerate()
                .find_map(|(index, pair)| {
                    if depth_m <= pair[1].center_m {
                        let weight =
                            (depth_m - pair[0].center_m) / (pair[1].center_m - pair[0].center_m);
                        Some((index, index + 1, weight))
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| {
                    let last = cells.len() - 1;
                    (last, last, 0.0)
                })
        };
        let current = cells[left].perfusion_coefficient * (1.0 - weight)
            + cells[right].perfusion_coefficient * weight;
        let baseline = self.baseline_perfusion_coefficient[left] * (1.0 - weight)
            + self.baseline_perfusion_coefficient[right] * weight;

        if baseline > 1.0e-12 {
            (current / baseline).max(0.0)
        } else {
            1.0
        }
    }

    fn stored_energy_j_per_m2(&self) -> f64 {
        self.mesh
            .cells
            .iter()
            .zip(&self.temperature_c)
            .zip(&self.initial_temperature_c)
            .map(|((cell, current), initial)| {
                cell.volumetric_heat_capacity * cell.width_m * (current - initial)
            })
            .sum()
    }

    /// Advance one step with the given time weighting and return the surface
    /// heat flux used, so the caller can record it without recomputing.
    fn step(
        &mut self,
        dt: f64,
        theta: f64,
        surface: SurfaceCoupling,
        device: Option<DeviceModel>,
    ) -> f64 {
        self.controller_flux_w_per_m2 = 0.0;
        self.controller_saturated = false;
        let count = self.mesh.cell_count();
        let dynamic_device = matches!(surface, SurfaceCoupling::Device { .. });
        let offset = usize::from(dynamic_device);
        let rows = count + offset;

        let mut lower = vec![0.0; rows];
        let mut diagonal = vec![0.0; rows];
        let mut upper = vec![0.0; rows];
        let mut rhs = vec![0.0; rows];

        let core_conductance = self.mesh.half_cell_conductance_core();
        let core_temperature = self.mesh.core_temperature_c;
        let blood_temperature = self.mesh.blood_temperature_c;

        // Surface coupling resolved into (conductance, external temperature) or
        // a direct flux. The external half-cell resistance is folded in here so
        // the conductance is measured from the true skin surface.
        let (surface_conductance, surface_external_c, surface_flux) = match surface {
            SurfaceCoupling::Conductance {
                conductance,
                external_c,
            } => (
                series_with_half_cell(conductance, &self.mesh),
                external_c,
                0.0,
            ),
            SurfaceCoupling::Flux { flux_w_per_m2 } => (0.0, 0.0, flux_w_per_m2),
            SurfaceCoupling::Device { conductance } => (
                series_with_half_cell(conductance, &self.mesh),
                self.device_temperature_c,
                0.0,
            ),
        };

        // Device row, when the device temperature is an unknown.
        let mut control_conductance = 0.0;
        let mut control_flux = 0.0;
        if let (true, Some(device)) = (dynamic_device, device) {
            match device.control {
                DeviceControl::Passive => {}
                DeviceControl::Regulated {
                    gain_w_per_m2_k,
                    max_flux_w_per_m2,
                } => {
                    // Decide the saturation regime from the known state, then
                    // keep the unsaturated branch implicit for stability.
                    let demand = gain_w_per_m2_k * (device.setpoint_c - self.device_temperature_c);
                    if demand >= max_flux_w_per_m2 {
                        control_flux = max_flux_w_per_m2;
                        self.controller_saturated = true;
                    } else if demand > 0.0 {
                        control_conductance = gain_w_per_m2_k;
                    }
                }
            }

            let capacity = device.areal_heat_capacity_j_per_m2_k / dt;
            let back = device.back_loss_w_per_m2_k;
            let residual_now = surface_conductance
                * (self.temperature_c[0] - self.device_temperature_c)
                + back * (device.ambient_c - self.device_temperature_c)
                + control_conductance * (device.setpoint_c - self.device_temperature_c)
                + control_flux;

            diagonal[0] = capacity + theta * (surface_conductance + back + control_conductance);
            upper[0] = -theta * surface_conductance;
            rhs[0] = capacity * self.device_temperature_c
                + (1.0 - theta) * residual_now
                + theta
                    * (back * device.ambient_c
                        + control_conductance * device.setpoint_c
                        + control_flux);
        }

        for index in 0..count {
            let row = index + offset;
            let cell = &self.mesh.cells[index];
            let capacity = cell.volumetric_heat_capacity * cell.width_m / dt;
            let perfusion = cell.perfusion_coefficient * cell.width_m;
            let metabolic = cell.metabolic_w_per_m3 * cell.width_m;

            let left_conductance = if index == 0 {
                surface_conductance
            } else {
                self.mesh.face_conductance[index - 1]
            };
            let right_conductance = if index == count - 1 {
                core_conductance
            } else {
                self.mesh.face_conductance[index]
            };

            let left_temperature = if index == 0 {
                surface_external_c
            } else {
                self.temperature_c[index - 1]
            };
            let right_temperature = if index == count - 1 {
                core_temperature
            } else {
                self.temperature_c[index + 1]
            };

            let residual_now = left_conductance * (left_temperature - self.temperature_c[index])
                + right_conductance * (right_temperature - self.temperature_c[index])
                + perfusion * (blood_temperature - self.temperature_c[index])
                + metabolic
                + if index == 0 { surface_flux } else { 0.0 };

            diagonal[row] = capacity + theta * (left_conductance + right_conductance + perfusion);
            rhs[row] = capacity * self.temperature_c[index]
                + (1.0 - theta) * residual_now
                + theta * (perfusion * blood_temperature + metabolic)
                + if index == 0 {
                    theta * surface_flux
                } else {
                    0.0
                };

            if index == 0 {
                if dynamic_device {
                    lower[row] = -theta * surface_conductance;
                } else {
                    rhs[row] += theta * surface_conductance * surface_external_c;
                }
            } else {
                lower[row] = -theta * left_conductance;
            }

            if index == count - 1 {
                rhs[row] += theta * right_conductance * core_temperature;
            } else {
                upper[row] = -theta * right_conductance;
            }
        }

        let solution = solve_tridiagonal(&lower, &diagonal, &upper, &rhs);

        let previous = self.temperature_c.clone();
        let previous_device = self.device_temperature_c;

        if dynamic_device {
            self.device_temperature_c = solution[0];
        }
        self.temperature_c
            .copy_from_slice(&solution[offset..offset + count]);

        if let (true, Some(device)) = (dynamic_device, device) {
            self.controller_flux_w_per_m2 = match device.control {
                DeviceControl::Passive => 0.0,
                DeviceControl::Regulated {
                    gain_w_per_m2_k,
                    max_flux_w_per_m2,
                } => {
                    if self.controller_saturated {
                        max_flux_w_per_m2
                    } else {
                        (gain_w_per_m2_k * (device.setpoint_c - self.device_temperature_c))
                            .max(0.0)
                    }
                }
            };
        }

        // Energy accounting reuses the same time weighting as the solve, so the
        // ledger closes to round-off rather than to truncation error.
        let external_before = if dynamic_device {
            previous_device
        } else {
            surface_external_c
        };
        let external_after = if dynamic_device {
            self.device_temperature_c
        } else {
            surface_external_c
        };

        let surface_flux_avg = if matches!(surface, SurfaceCoupling::Flux { .. }) {
            surface_flux
        } else {
            theta * surface_conductance * (external_after - self.temperature_c[0])
                + (1.0 - theta) * surface_conductance * (external_before - previous[0])
        };
        self.energy.surface_in_j_per_m2 += surface_flux_avg * dt;

        let core_flux =
            theta * core_conductance * (self.temperature_c[count - 1] - core_temperature)
                + (1.0 - theta) * core_conductance * (previous[count - 1] - core_temperature);
        self.energy.core_out_j_per_m2 += core_flux * dt;

        for index in 0..count {
            let cell = &self.mesh.cells[index];
            let average = theta * self.temperature_c[index] + (1.0 - theta) * previous[index];
            self.energy.perfusion_out_j_per_m2 +=
                cell.perfusion_coefficient * cell.width_m * (average - blood_temperature) * dt;
            self.energy.metabolic_in_j_per_m2 += cell.metabolic_w_per_m3 * cell.width_m * dt;

            if self.temperature_c[index] > self.peak_temperature_c[index] {
                self.peak_temperature_c[index] = self.temperature_c[index];
            }
        }

        self.energy.stored_j_per_m2 = self.stored_energy_j_per_m2();
        self.elapsed_s += dt;

        surface_flux_avg
    }

    /// Run one phase, integrating thermal damage and invoking `observe` after
    /// each accepted step.
    pub fn run_phase<F>(&mut self, phase: Phase, dt: f64, damage: &DamageModel, mut observe: F)
    where
        F: FnMut(&mut Self, f64),
    {
        if phase.duration_s <= 0.0 {
            return;
        }

        // Split the phase into a whole number of equal steps so the phase
        // boundary lands exactly on a step boundary.
        let steps = (phase.duration_s / dt).ceil().max(1.0) as usize;
        let step_dt = phase.duration_s / steps as f64;

        for index in 0..steps {
            let theta = if index < RANNACHER_STEPS { 1.0 } else { THETA };
            self.apply_perfusion_model();
            let previous = self.temperature_c.clone();
            let flux = self.step(step_dt, theta, phase.surface, phase.device);
            self.accumulate_damage(&previous, step_dt, damage);
            observe(self, flux);
        }
    }

    /// Integrate dΩ/dt over the step using the trapezoid rule on the rate.
    ///
    /// The rate is exponential in temperature, so evaluating it at both ends of
    /// the step rather than only at the start keeps Ω second-order accurate and
    /// consistent with the Crank–Nicolson temperature field.
    fn accumulate_damage(&mut self, previous: &[f64], dt: f64, damage: &DamageModel) {
        for index in 0..self.temperature_c.len() {
            let rate_before = damage.rate(previous[index]);
            let rate_after = damage.rate(self.temperature_c[index]);
            self.omega[index] += 0.5 * (rate_before + rate_after) * dt;
        }
    }
}

/// Fold the first half-cell's conduction resistance into an external surface
/// conductance so it is referenced to the true skin surface.
fn series_with_half_cell(external_conductance: f64, mesh: &Mesh) -> f64 {
    series_with_half_cell_parts(
        external_conductance,
        mesh.cells.first().map(|c| c.width_m).unwrap_or(1e-6),
        mesh.cells.first().map(|c| c.conductivity).unwrap_or(0.4),
    )
}

/// Fold the first half-cell conduction resistance into an external conductance.
pub(crate) fn series_with_half_cell_parts(
    external_conductance: f64,
    surface_half_width_m: f64,
    surface_conductivity: f64,
) -> f64 {
    if external_conductance <= 0.0 {
        return 0.0;
    }
    if !external_conductance.is_finite() {
        return surface_conductivity / surface_half_width_m.max(1e-12);
    }
    let half_cell = surface_conductivity / (surface_half_width_m / 2.0).max(1e-12);
    1.0 / (1.0 / external_conductance + 1.0 / half_cell)
}

/// Thomas algorithm for a tridiagonal system.
///
/// The matrices produced above are diagonally dominant with positive diagonals,
/// so no pivoting is required.
pub fn solve_tridiagonal(lower: &[f64], diagonal: &[f64], upper: &[f64], rhs: &[f64]) -> Vec<f64> {
    let count = diagonal.len();
    let mut sweep_upper = vec![0.0; count];
    let mut sweep_rhs = vec![0.0; count];

    let mut denominator = diagonal[0];
    sweep_upper[0] = upper[0] / denominator;
    sweep_rhs[0] = rhs[0] / denominator;

    for index in 1..count {
        denominator = diagonal[index] - lower[index] * sweep_upper[index - 1];
        sweep_upper[index] = upper[index] / denominator;
        sweep_rhs[index] = (rhs[index] - lower[index] * sweep_rhs[index - 1]) / denominator;
    }

    let mut solution = vec![0.0; count];
    solution[count - 1] = sweep_rhs[count - 1];
    for index in (0..count - 1).rev() {
        solution[index] = sweep_rhs[index] - sweep_upper[index] * solution[index + 1];
    }
    solution
}

/// Gauss error function, Abramowitz & Stegun 7.1.26.
///
/// Maximum absolute error 1.5e-7, which is several orders below the tolerance
/// the analytic verification cases are judged against.
pub fn erf(x: f64) -> f64 {
    const A1: f64 = 0.254_829_592;
    const A2: f64 = -0.284_496_736;
    const A3: f64 = 1.421_413_741;
    const A4: f64 = -1.453_152_027;
    const A5: f64 = 1.061_405_429;
    const P: f64 = 0.327_591_1;

    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let x = x.abs();
    let t = 1.0 / (1.0 + P * x);
    let y = 1.0 - (((((A5 * t + A4) * t) + A3) * t + A2) * t + A1) * t * (-x * x).exp();
    sign * y
}

pub fn erfc(x: f64) -> f64 {
    1.0 - erf(x)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uniform_layer(thickness_m: f64) -> LayerMaterial {
        LayerMaterial {
            thickness_m,
            density_kg_per_m3: 1000.0,
            specific_heat_j_per_kg_k: 4000.0,
            conductivity_w_per_m_k: 0.5,
            perfusion_per_s: 0.0,
            metabolic_w_per_m3: 0.0,
        }
    }

    #[test]
    fn local_hyperemia_fold_matches_mayrovitz_anchor() {
        let model = PerfusionModel::LocalHyperemia {
            onset_c: 33.0,
            half_max_c: 39.0,
            max_fold: 8.8,
            steepness_c: 1.2,
        };
        assert!((model.multiplier(30.0) - 1.0).abs() < 1e-9);
        let at_42 = model.multiplier(42.0);
        assert!(at_42 > 7.0 && at_42 <= 8.8, "fold at 42 °C was {at_42}");
        assert!(model.multiplier(39.0) > 4.0);
    }

    #[test]
    fn reported_perfusion_fold_tracks_local_hyperemia() {
        let mut layer = uniform_layer(0.002);
        layer.perfusion_per_s = 0.001;
        let mesh = build_mesh(&[layer], 0.0001, 0.0005, 1.1, BloodProperties::default(), 37.0);
        let initial = vec![42.0; mesh.cell_count()];
        let mut state = SolverState::with_perfusion(
            mesh,
            initial,
            42.0,
            PerfusionModel::LocalHyperemia {
                onset_c: 33.0,
                half_max_c: 39.0,
                max_fold: 9.0,
                steepness_c: 1.2,
            },
        );
        state.apply_perfusion_model();
        assert!(state.perfusion_fold_at_depth(0.001) > 7.0);
    }

    #[test]
    fn mesh_closes_exactly_on_layer_boundaries() {
        let layers = [
            uniform_layer(0.0001),
            uniform_layer(0.002),
            uniform_layer(0.02),
        ];
        let mesh = build_mesh(&layers, 5e-6, 5e-4, 1.15, BloodProperties::default(), 37.0);

        assert!((mesh.depth_m - 0.0221).abs() < 1e-12);

        // Every layer boundary must fall on a cell face.
        let mut edge = 0.0;
        let mut boundaries = Vec::new();
        let mut current_layer = mesh.cells[0].layer_index;
        for cell in &mesh.cells {
            if cell.layer_index != current_layer {
                boundaries.push(edge);
                current_layer = cell.layer_index;
            }
            edge += cell.width_m;
        }
        assert!((boundaries[0] - 0.0001).abs() < 1e-12);
        assert!((boundaries[1] - 0.0021).abs() < 1e-12);
    }

    #[test]
    fn tridiagonal_solve_matches_known_system() {
        // [2 -1 0; -1 2 -1; 0 -1 2] x = [1 0 1] has solution [1 1 1].
        let solution = solve_tridiagonal(
            &[0.0, -1.0, -1.0],
            &[2.0, 2.0, 2.0],
            &[-1.0, -1.0, 0.0],
            &[1.0, 0.0, 1.0],
        );
        for value in solution {
            assert!((value - 1.0).abs() < 1e-12);
        }
    }

    #[test]
    fn erf_matches_reference_values() {
        assert!((erf(0.0)).abs() < 1e-9);
        assert!((erf(0.5) - 0.520_499_877).abs() < 2e-7);
        assert!((erf(1.0) - 0.842_700_792).abs() < 2e-7);
        assert!((erf(2.0) - 0.995_322_265).abs() < 2e-7);
        assert!((erf(-1.0) + 0.842_700_792).abs() < 2e-7);
    }
}
