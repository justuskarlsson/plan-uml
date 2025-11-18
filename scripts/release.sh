#!/usr/bin/env bash
set -euo pipefail

# Config — adjust if needed
EXT_NAME="plan-uml"              # base name of your extension (prefix of the .vsix)
NOTES_FILE="${NOTES_FILE:-}"     # optionally: path to a markdown changelog for release notes

# 1. Build the VSIX
echo "Packaging extension with vsce..."
vsce package

# 2. Grab the newest .vsix (by mtime)
vsix_file=$(ls -t "${EXT_NAME}-"*.vsix 2>/dev/null | head -n1 || true)
if [[ -z "${vsix_file}" ]]; then
  echo "No ${EXT_NAME}-.vsix file found after packaging." >&2
  exit 1
fi
echo "Using VSIX: ${vsix_file}"

# 3. Infer version from filename: <name>-X.Y.Z.vsix
if ! version=$(sed -n 's/.*-\([0-9]\+\.[0-9]\+\.[0-9]\+\)\.vsix$/\1/p' <<< "${vsix_file}"); then
  echo "Failed to parse version from ${vsix_file}" >&2
  exit 1
fi

if [[ -z "${version}" ]]; then
  echo "Could not extract semantic version (X.Y.Z) from ${vsix_file}" >&2
  exit 1
fi

tag="v${version}"
echo "Version: ${version} (tag: ${tag})"

# 4. Prepare release notes
if [[ -n "${NOTES_FILE}" && -f "${NOTES_FILE}" ]]; then
  notes_arg=(--notes-file "${NOTES_FILE}")
else
  notes_arg=(--notes "Release ${version}")
fi

# 5. Create or update GitHub release
if gh release view "${tag}" >/dev/null 2>&1; then
  echo "Release ${tag} exists, uploading asset (with --clobber)..."
  gh release upload "${tag}" "${vsix_file}" --clobber
else
  echo "Creating release ${tag}..."
  gh release create "${tag}" "${vsix_file}" \
    --title "${EXT_NAME} ${version}" \
    "${notes_arg[@]}"
fi

echo "Done. Uploaded ${vsix_file} to GitHub release ${tag}."
