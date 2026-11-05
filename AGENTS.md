# Project instructions

This is a personal Eagle inspector plugin. Apply the active shared policy separately; keep shared policy and credentials out of this repository.

- Read README.md and docs/HANDOFF.md before changes; docs/SPEC.md defines scope.
- Keep runtime dependency-free, using Eagle APIs and Node built-ins.
- Treat image metadata as untrusted text. Do not execute it, inject it as HTML, or send it over the network.
- Never commit library images, real prompts, metadata exports, private paths or logs. Tests use synthetic data.
- Do not edit installed plugins or Eagle library files as a side effect of development.
- Run `npm test` and `npm run check`; update HANDOFF when the restart state changes.
- Follow the shared independent-review, commit and push policy. Do not add CI while personal CI is suspended.
