# Development

Adapted to this project from the personal-project bootstrap template.

1. Inspect `git status --short --branch`, branch, remotes and HANDOFF. Preserve unrelated changes.
2. If a remote is configured, confirm it is the intended repository before fetching or fast-forward synchronization.
3. Implement the smallest change consistent with SPEC. No dependency installation or build is needed.
4. Run `npm test` and `npm run check`. An optional real-image check is `npm run inspect -- <path-to-image.png> --summary`; do not commit its output.
5. Obtain the independent review required by the active shared policy, resolve findings, then commit explicit task files.
6. Push only under the shared authorization rules and verify the remote SHA. Publishing releases, deployment and marketplace submission are separate actions.

Eagle runtime acceptance is manual unless computer-use is explicitly authorized. Test the plugin by importing the project directory as a development plugin, selecting a PNG, copying each field, switching images, expanding long prompts, and folding the host inspector section. Keep real images outside the repository. CI is not configured; local checks are the current validation path.
