# Project rules (user-specific, overrides nothing in AGENTS.md but adds to it)

- **Never run `npm install` / install or modify dependencies in this workspace.**
  Assume `node_modules` may be absent locally — do not try to fix that by
  installing. If a check genuinely requires installed deps (typecheck, build,
  dev server), skip it and say so instead of installing anything.
- **No local verification.** Do not start the dev server, run the build, or
  otherwise try to "see it working" locally. The user verifies every change
  themselves on the live site (qwill-yt.mooo.com) after it's pushed and
  deployed via the CI workflow in `.github/`.
- **Claude in Chrome (`mcp__claude-in-chrome__*` tools) is forbidden.** Never
  load or call these tools in this project, for any reason.
- **Push after every completed piece of work.** Once a task is done, commit
  and push it to `master` (unless the user says otherwise for that task) so
  CI deploys it — don't leave finished work uncommitted/unpushed.
- **After pushing, tell the user what to check by hand.** End with a short,
  concrete list of what to click/look at on the live site to verify the
  change actually works — not just "let me know if it works."
