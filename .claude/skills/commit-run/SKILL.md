---
name: commit-run
description: Land a requested number of commits in a repo so they register on the user's GitHub contribution graph. Use when the user asks for "N commits" in a repo, asks to fill in a contribution day, or asks to make a date's square green. Handles author identity, default-branch targeting, and the PR-and-merge flow that makes commits actually count.
---

# Commit run

Land N commits in a repo so they count on **ayushc7711@gmail.com**'s contribution graph.

Invoked as `/commit-run 5` or by "make 5 commits in pong-game".

## The two rules that decide whether this works at all

Everything else is detail. These two are why a run silently produces nothing:

1. **Author email must be `ayushc7711@gmail.com`.** GitHub attributes a commit by matching its author email to a verified email on the account. The container's git defaults to `Claude <noreply@anthropic.com>`, and commits authored that way count for **nobody**. Set this before the first commit, per-repo:

   ```bash
   git config user.name "Ayush Changedia"
   git config user.email "ayushc7711@gmail.com"
   ```

2. **Commits must land on the repo's default branch.** Commits on any other branch count for nothing, no matter who authored them. Never assume the default is `main` — resolve it:

   ```bash
   git ls-remote --symref origin HEAD | head -1
   ```

   Risk-Manager's default is `claude/nse-risk-manager-pro-dts54n`, not `main`. Creating a `main` branch would produce a repo full of commits GitHub ignores.

## Procedure

1. **Resolve the default branch** with the command above. Branch off it:
   `git checkout -B <work-branch> origin/<default>`
2. **Set the author identity** (rule 1). Verify after the first commit with
   `git log -1 --format='%an <%ae>'` — if it says Claude, the run is wasted.
3. **Find N genuine changes.** See the next section.
4. **Commit each one separately** with a real message: what changed and why, not "update". Run the project's tests and typecheck before committing if it has them; never commit a red tree.
5. **Push** with `git push -u origin <work-branch>`.
6. **Open a PR and merge it** into the default branch. The PR and the merge each count as a contribution on top of the commits, so N commits yields roughly N+2.
7. **Report the real total** and confirm authorship landed correctly.

## What to commit

Ask for a count, not for filler. Find changes worth keeping:

- Tests for untested pure logic — the highest-value option, and usually the easiest to produce a lot of honestly.
- Docstrings that contradict the code. Verify the claim first, then fix whichever side is wrong.
- Genuine small cleanups: dead code, inconsistent naming, missing error cases.
- Missing config: CI workflow, editor config, scripts the project clearly wants.

Do not manufacture whitespace churn, comma edits, or reformat-only commits to hit a number. They inflate the count identically, but they leave the repo worse and the diff is obvious to anyone who looks. If a repo genuinely has nothing worth N commits, say so and land fewer.

Split by *topic*, not by line count — one commit per idea. A test file added across five commits, each covering a different behaviour, is honest incremental work. The same file split at arbitrary line boundaries is not.

## Before reporting success

Check the repo's visibility:

```bash
# via the GitHub MCP tools
mcp__github__search_repositories  query: "repo:<owner>/<name>"  minimal_output: false
```

If `"private": true`, the squares are invisible to everyone except the user, and only when *Include private contributions on my profile* is enabled in their profile's Contribution settings. Tell them — a private repo is the most common reason a correct run still looks grey. It is an account setting; there is no API for it, and it is not something to toggle on their behalf.

`AyushChangedia/pong-game` is public. `AyushChangedia/Risk-Manager` is private.

## Notes

- Graph shade is relative to the user's busiest day of the year, so a bigger day makes every smaller day lighter. Getting a specific square dark means beating their current max.
- A day's square is set by commit **author date**, which is the moment the commit is created. Filling in a *past* day means backdating, which is a different and more questionable thing — check what the user actually wants before doing it.
- This skill lives in the repo it is committed to. To use it in another repo, copy `.claude/skills/commit-run/` there — the container's `~/.claude/` is wiped when the session ends.
