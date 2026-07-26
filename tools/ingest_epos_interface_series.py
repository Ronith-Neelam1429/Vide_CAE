#!/usr/bin/env python3
"""Convert one Wang et al. EPOS MATLAB record to Vide's validation CSV format.

The source is CC0: https://doi.org/10.6084/m9.figshare.8299343.v4

This script intentionally labels the result a *thermode-interface* record.
The EPOS thermostatic probe reports temperature at the heated measurement
point; it is not independent skin-under-probe ground truth, so its output must
not be used to calibrate tissue contact conductance.

Example:
  python3 tools/ingest_epos_interface_series.py \
    --input "benchmarks/heat/source-downloads/epos-data1/Data 1/T6_070_42.mat" \
    --output "benchmarks/heat/cases/epos-forearm-42c-subject-070.csv"
"""

from __future__ import annotations

import argparse
import csv
import hashlib
from pathlib import Path

from scipy.io import loadmat


def as_vector(value: object, name: str) -> list[float]:
    """Flatten a MATLAB numeric vector and reject non-finite values."""
    flattened = getattr(value, "reshape")(-1)
    result = [float(entry) for entry in flattened]
    if not result:
        raise ValueError(f"{name} is empty")
    if not all(entry == entry and abs(entry) != float("inf") for entry in result):
        raise ValueError(f"{name} contains NaN or infinity")
    return result


def normalize_time(time_s: list[float], sample_count: int, sample_rate_hz: float) -> list[float]:
    """Use source timestamps, converting MATLAB day fractions when detected."""
    if len(time_s) == sample_count and all(
        next_time > current
        for current, next_time in zip(time_s, time_s[1:])
    ):
        origin = time_s[0]
        elapsed = [entry - origin for entry in time_s]
        expected_duration_s = (sample_count - 1) / sample_rate_hz
        source_duration = elapsed[-1]

        # EPOS exports MATLAB serial dates. Their difference is in days, while
        # the documented session duration and 3 Hz rate are in seconds.
        if abs(source_duration * 86_400 - expected_duration_s) < abs(
            source_duration - expected_duration_s
        ):
            return [entry * 86_400 for entry in elapsed]
        return elapsed
    return [index / sample_rate_hz for index in range(sample_count)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="EPOS .mat input")
    parser.add_argument("--output", type=Path, required=True, help="Vide two-column CSV output")
    parser.add_argument(
        "--sample-rate-hz",
        type=float,
        default=3.0,
        help="Fallback rate documented for EPOS data (default: 3)",
    )
    args = parser.parse_args()

    mat = loadmat(args.input)
    if "temperature" not in mat:
        raise ValueError("Source .mat has no temperature variable")
    temperature_c = as_vector(mat["temperature"], "temperature")
    source_time = as_vector(mat["time"], "time") if "time" in mat else []
    time_s = normalize_time(source_time, len(temperature_c), args.sample_rate_hz)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["time_s", "temperature_c"])
        writer.writerows(zip(time_s, temperature_c))

    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f"Wrote {len(temperature_c)} interface-temperature samples to {args.output}")
    print(f"SHA-256: {digest}")
    print("Target: thermode_interface; never use this CSV for skin-surface conductance calibration.")


if __name__ == "__main__":
    main()
