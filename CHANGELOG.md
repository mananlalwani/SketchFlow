# Changelog

All notable public releases of SketchFlow are documented in this file.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning for public releases.

## [Unreleased]

### Security

- Added public-release hygiene checks for tracked generated artifacts and environment files.
- Documented release-owner requirements for credential rotation, GitHub repository protections, and provider validation.

### Changed

- Public release documentation now states privacy and verification boundaries explicitly.
- Collaboration now uses durable object operations, atomic batches, same-device cursor identities, and replayable IndexedDB operations.
- Retained strokes preserve point widths for pressure-sensitive rendering and export; unsupported OffscreenCanvas browsers use a main-thread fallback.
- CI and the production container use Node.js 24. Version tags validate, publish GHCR images, and create GitHub Releases; VPS deployment remains manual.
