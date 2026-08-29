# Project rules for Claude Code

(also see `AGENTS.md` — that file is a *different* agent's sandbox contract,
for Grok Build, not for Claude Code; it does not apply here)

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
- **Nothing reaches the live site until it's pushed to `master` on GitHub —
  there is no other deploy path.** Since local verification is disabled here,
  an unpushed change is invisible to both the user and to CI: the user can't
  check it, and no build/deploy runs for it. This means every finished piece
  of work MUST end with an actual `git push` to `master` (not just a local
  commit) — do not stop at "committed," that alone changes nothing on the
  live site.
- **Push after every completed piece of work.** Once a task is done, commit
  and push it to `master` (unless the user says otherwise for that task) so
  CI deploys it — don't leave finished work uncommitted/unpushed.
- **After pushing, tell the user what to check by hand.** End with a short,
  concrete list of what to click/look at on the live site to verify the
  change actually works — not just "let me know if it works."
