# Configuring an App

Every App repository works the same way: agents push branches, a pull request to main opens by itself, and it merges when the `ci` check passes. Nobody pushes to main. These steps set that up for a new App, once.

## Checklist

- [ ] Create the repository with a README, so main exists.
- [ ] Clone it over SSH and set the repository's own git identity.
- [ ] Install the guardrails skill and run `guardrails.py ci`.
- [ ] Turn on the pull request settings.
- [ ] Turn on the Actions permissions.
- [ ] Import the ruleset for main.
- [ ] Push a test branch and watch it merge.

## 1. Create the repository

On GitHub, create the repository and tick **Add a README file**. That gives the repository a main branch, so every later change can arrive as a pull request. A repository created empty has no main to open a pull request against; see [An empty repository](#an-empty-repository).

## 2. Clone it

Clone over SSH, with the host alias for the account that owns the repository, and set the identity in the repository itself (`git config` without `--global`):

```bash
git clone git@<host-alias>:<owner>/<app>.git
cd <app>
git config user.name "<owner>"
git config user.email "<owner's noreply address>"
```

Check it before the first commit: `git config --show-origin --get user.email` must point at `.git/config`.

## 3. Install the guardrails skill

```bash
npx skills add jaetask/skills --skill guardrails
uv run .claude/skills/guardrails/guardrails.py ci .
```

`guardrails.py ci` writes three things:

| File | What it does |
| --- | --- |
| `.github/workflows/ci.yml` | Runs the App's checks on every branch push, as the job `ci`. |
| `.github/workflows/auto-pr.yml` | For each pushed branch, opens a pull request to main, turns on auto-merge, and deletes the branch once it merges. |
| `.agents/guardrails/hooks/pre-push` | Refuses a push to main. |

Point git at the hooks with `git config core.hooksPath .agents/guardrails/hooks` (the install script can do this), add the line it prints to AGENTS.md, and commit on a branch.

## 4. Turn on the pull request settings

**Settings → General → Pull Requests:**

- Tick **Allow auto-merge**.
- Keep **Allow rebase merging** on. auto-pr merges by rebase, so each commit keeps its author.
- Tick **Automatically delete head branches**. GitHub does not delete a branch that its own Actions token merged, so auto-pr deletes it; the setting covers pull requests merged by hand.

Press **Save** at the bottom of each section.

## 5. Turn on the Actions permissions

**Settings → Actions → General → Workflow permissions:**

- Choose **Read and write permissions**.
- Tick **Allow GitHub Actions to create and approve pull requests**.

Without these, auto-pr fails when it opens the pull request.

## 6. Import the ruleset for main

**Settings → Rules → Rulesets → New ruleset → Import a ruleset**, and pick `ruleset-main.json` from the installed skill:

```
.claude/skills/guardrails/ci/ruleset-main.json
```

It applies to the default branch and:

- requires a pull request, merged by rebase;
- requires the `ci` check to pass;
- blocks force pushes and deleting main.

It has no bypass list, so it holds for every account, agents included.

## 7. Test it

Push a small change on a branch:

```bash
git checkout -b check-setup
echo "" >> README.md
git commit -am "Check the setup"
git push -u origin check-setup
```

Then, on the repository's **Actions** and **Pull requests** tabs:

1. `ci` and `auto-pr` start.
2. A pull request named after the commit opens.
3. When `ci` passes, the pull request merges by itself.
4. The branch is deleted. `git ls-remote --heads origin` lists only main.

## An empty repository

A repository created without a README has no main. With the ruleset imported, the first push to main is refused, and the pre-push hook refuses it too. Do the first push before importing the ruleset:

1. Leave out step 6 until main exists.
2. Commit the App's first content, with the workflows from step 3, on main.
3. As the repository owner, push main once: `git push --no-verify -u origin main`.
4. Import the ruleset (step 6), then test (step 7).

If the ruleset is already imported, set its **Enforcement status** to **Disabled**, push main as above, then set it back to **Active**.

## What to expect

- **Authors and committers.** A rebase merge keeps each commit's author. GitHub's Actions bot becomes the committer of the commits on main.
- **A red `ci`.** The pull request stays open. Push a fix to the same branch; auto-pr reuses the pull request and the newer push replaces the waiting job.
- **Waiting.** auto-pr waits up to 30 minutes for the merge before it stops watching. The pull request still merges when `ci` passes; only the branch delete is skipped.
- **Version branches.** A branch that needs a package that is not published yet stays red until it is, then merges like any other.
