---
name: release
description: Cut a new AlgoreaServerless release - changelog entry from merged PRs, version bump, commit, tag, push and GitHub release. Use when the user wants to release, bump the version, tag, or write a changelog entry. Supports auto mode (no human interaction).
---

# Release

Steps run in order. Two modes:

- **Interactive** (default): pause where a step says so.
- **Auto mode**: the caller asked for it (`/release auto`, "release without asking", ...). Never pause: accept the proposed version and entries, run the release command, create the GitHub release, and report everything in the final summary.

A **stop** below applies in both modes: report the reason and end the run, with nothing more committed, pushed or published.

## 1. Verify state

```bash
git branch --show-current
git status --porcelain
git fetch origin
git rev-list --left-right --count master...origin/master
```

Stop unless: on `master`, empty porcelain output, and the count is `0	0` (local `master` neither ahead of nor behind `origin/master`).

## 2. Read current version

The latest section heading at the top of `CHANGELOG.md`:

```
## [vX.Y.Z](https://github.com/France-ioi/AlgoreaServerless/compare/vA.B.C...vX.Y.Z) - YYYY-MM-DD
```

Stop if this version differs from `git describe --tags --abbrev=0` (the changelog is out of sync with the tags). `package.json`'s `version` is unused: leave it.

## 3. Collect changes

```bash
git log --oneline --merges $(git describe --tags --abbrev=0)..HEAD
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

Stop if there is no commit since the last tag. For each merged PR, `gh pr view <number> --json title,body` gives the context the merge commit lacks.

Write one entry per meaningful change:

- the **API-facing impact** (REST endpoints, WebSocket messages, EventBridge events, notifications, required env/IAM/config), not the implementation;
- concise plain English, starting with a lowercase verb or noun phrase (`- add ...`, `- fix ...`, `- publish ...`);
- no PR or commit links.

Skip internal-only changes (refactors, CI, tests) unless they visibly affect reliability or performance. If only internal changes remain, the release is a patch with the single entry `- internal maintenance`.

## 4. Decide the version bump

| Changes | Bump |
|---|---|
| Only fixes, corrections, internal improvements, no API change | patch (x.y.**Z+1**) |
| Any API change: new endpoints, messages, events, fields, options, new required env/IAM/config, anything a consumer or deployer may notice | minor (x.**Y+1**.0) |
| Clearly breaking (removed endpoints, renamed fields, changed behaviour) | minor too, but **flag it** so the user can choose a major bump |

When in doubt between patch and minor, pick minor. In auto mode, a flagged breaking change stays minor and the flag goes in the final summary.

## 5. Proposal

Show the proposed version (`vX.Y.Z`, was `vA.B.C`) and the CHANGELOG section of step 6, dated today.

**Interactive: stop here** until the user approves, edits the entries, or changes the version. Auto mode: continue.

## 6. Update CHANGELOG.md

Insert the new section right after the `# Changelog` header and its subtitle line, before the previous latest section. Exact layout (blank line after the heading and after the bullets):

```
## [vX.Y.Z](https://github.com/France-ioi/AlgoreaServerless/compare/vA.B.C...vX.Y.Z) - YYYY-MM-DD

- entry one
- entry two

```

Leave the rest of the file untouched.

## 7. Commit, tag and push

The release command, with the real version:

```bash
VERSION=X.Y.Z; git add CHANGELOG.md && git commit -m "Release $VERSION" && git tag -a -m "Release v$VERSION" v$VERSION && git push origin v$VERSION && git push origin master
```

- **Interactive**: show it, explain it commits the changelog, creates the annotated tag and pushes both, and tell the user they can either run it or reply **"do it"**. On "do it", run exactly this command, nothing else. If the user runs it themselves, wait for them to say it is done.
- **Auto mode**: run it.

If any part fails, stop and report the output; leave recovery (retries, tag deletion, force pushes) to the user.

## 8. GitHub release

CI does not create GitHub releases for this repo (it only notifies ops on tags); this step does. Check the tag reached `origin` (`git ls-remote --tags origin vX.Y.Z`), then build the notes from the new section's bullets and create the release:

```bash
VERSION=X.Y.Z; awk '/^## /{n++; next} n==1 && NF' CHANGELOG.md > /tmp/release-notes-v$VERSION.md && gh release create v$VERSION --verify-tag --title "Release $VERSION" --notes-file /tmp/release-notes-v$VERSION.md
```

- **Interactive**: show the command and the notes, and wait for **"do it"** (or the user doing it themselves).
- **Auto mode**: run it.

No assets are attached; `gh` marks it as the latest release. End with a summary: version, entries, release URL, anything flagged.
