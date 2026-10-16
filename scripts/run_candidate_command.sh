#!/usr/bin/env bash
set -euo pipefail
# Portable single-node computation wrapper.
# See THIRD_PARTY_NOTICES.md. Host cgroups and workspace quota are operator duties.
if [ "$#" -ne 3 ]; then
  echo "usage: run_candidate_command.sh WORKSPACE TIMEOUT_SECONDS COMMAND" >&2
  exit 64
fi
workspace="$1"
timeout_seconds="$2"
candidate_command="$3"
runtime="${RESEARCH_EXAM_PODMAN_WRAPPER:?missing container runtime}"
image="${RESEARCH_EXAM_IMAGE:?missing digest-pinned science image}"
expected_workspace="${RESEARCH_EXAM_EXPECTED_WORKSPACE:?missing authorized workspace}"
clock_file="${RESEARCH_EXAM_CLOCK_FILE:?missing controller clock}"
container_records="${RESEARCH_EXAM_CONTAINER_RECORDS:?missing attempt container records}"
container_prefix="${RESEARCH_EXAM_CONTAINER_NAME_PREFIX:?missing attempt container prefix}"
workspace_real="$(realpath -- "${workspace}")"
expected_real="$(realpath -- "${expected_workspace}")"
if [ "${workspace_real}" != "${expected_real}" ]; then
  echo "workspace is not authorized" >&2
  exit 65
fi
if [ ! -f "${clock_file}" ] || [ -L "${clock_file}" ]; then
  echo "controller clock is missing or unsafe" >&2
  exit 65
fi
if ! [[ "${timeout_seconds}" =~ ^[1-9][0-9]*$ ]]; then
  echo "timeout must be a positive number of seconds" >&2
  exit 64
fi
# Independently bound a shell call by remaining examination
# time. The host controller also stops the whole harness at the total deadline.
remaining="$(python3 -c 'import json, math, sys, time; print(max(0, math.ceil(json.load(open(sys.argv[1]))["deadline_epoch_seconds"]-time.time())))' "${clock_file}")"
if [ "${remaining}" -le 0 ]; then
  echo "examination deadline reached" >&2
  exit 124
fi
if [ "${timeout_seconds}" -gt "${remaining}" ]; then
  timeout_seconds="${remaining}"
fi
clock_real="$(realpath -- "${clock_file}")"
# Podman runs containers through a daemon/runtime, so killing its client is not
# sufficient. Register the controller-owned name before starting each container.
# Clean up immediately after each tool call; the controller also retries cleanup
# before sealing if a hard stop prevented this wrapper's EXIT trap from running.
record_dir="$(mktemp -d "${container_records}/shell-XXXXXXXX")"
container_name="${container_prefix}$(basename -- "${record_dir}")"
printf '%s\n' "${container_name}" > "${record_dir}/container.name"
cleanup_container() {
  command_status="$?"
  trap - EXIT TERM INT
  if ! timeout --signal=TERM --kill-after=5s 15s \
      "${runtime}" rm --force --ignore "${container_name}"; then
    echo "container cleanup failed; controller cleanup is required before sealing" >&2
    if [ "${command_status}" -eq 0 ]; then
      command_status=125
    fi
  fi
  exit "${command_status}"
}
trap cleanup_container EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
timeout --signal=TERM --kill-after=5s "${timeout_seconds}s" \
  "${runtime}" run --rm --pull=never \
  --name "${container_name}" --cidfile "${record_dir}/container.cid" \
  --network none --read-only --cap-drop all \
  --security-opt no-new-privileges --pids-limit 4096 \
  --cpus "${RESEARCH_EXAM_CPU_CORES:?missing CPU allocation}" \
  --tmpfs /tmp:rw,nosuid,nodev,size=8g \
  --volume "${workspace_real}:/workspace:rw" \
  --volume "${workspace_real}/task:/workspace/task:ro" \
  --volume "${clock_real}:/exam_runtime/exam_clock.json:ro" \
  --workdir /workspace --env HOME=/tmp --env MPLBACKEND=Agg \
  --env PYTHONNOUSERSITE=1 \
  --env "OMP_NUM_THREADS=${OMP_NUM_THREADS:-1}" \
  --env "OPENBLAS_NUM_THREADS=${OPENBLAS_NUM_THREADS:-1}" \
  --env "MKL_NUM_THREADS=${MKL_NUM_THREADS:-1}" \
  --env "NUMEXPR_NUM_THREADS=${NUMEXPR_NUM_THREADS:-1}" \
  "${image}" /bin/bash -lc "${candidate_command}"
