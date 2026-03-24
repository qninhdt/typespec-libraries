# Changesets In This Repository

This directory is used by `@changesets/cli` to track release-facing changes for the packages in this monorepo.

Changesets are part versioning metadata, part release-note source. They make sure package version bumps and published changelog entries stay tied to the actual code changes that caused them.

## What Lives In This Folder

When you run:

```sh
pnpm run changeset
```

the tool creates a markdown file in this directory that records:

- which published packages changed
- whether each package should be released as patch, minor, or major
- the human-written summary that later feeds release notes

The generated files are intentionally committed to git. They are not temporary build artifacts.

## When To Create A Changeset

Create one when your branch changes published package behavior in a way that should show up in versioning or release notes, for example:

- new decorators or emitter options
- behavior changes in generated output
- new diagnostics
- bug fixes that users will notice
- documentation changes that materially affect package usage

You usually do not need a changeset for:

- purely internal refactors with no user-facing effect
- test-only changes
- local experiment commits that will not be merged as release-facing work

If your team uses a stricter policy, follow the repository convention for that release cycle.

## Typical Workflow

1. Make the code and documentation changes.
2. Run `pnpm run changeset`.
3. Select the affected packages.
4. Choose the bump level for each package.
5. Write a summary that explains the user-visible change.
6. Commit the generated changeset file with the implementation.

## What A Changeset File Looks Like

A typical file looks like this:

```md
---
"@qninhdt/typespec-orm": minor
"@qninhdt/typespec-gorm": patch
---

Add @manyToMany shorthand validation to the shared ORM core and emit GORM many2many tags.
```

Guidance for writing the summary:

- lead with the user-visible behavior change
- mention the package names only when that adds clarity
- keep it short enough to read well in release notes
- avoid internal-only implementation detail unless it affects migration

## Repository Scripts

- `pnpm run changeset`
  Create a new changeset entry.
- `pnpm run version-packages`
  Apply pending version bumps locally.
- `pnpm run release`
  Build and publish through the configured release workflow.

## Release Flow

At a high level, the workflow is:

1. contributors add changesets with their branches
2. the default branch accumulates pending changesets
3. `pnpm run version-packages` consumes them and updates package versions and changelogs
4. the release workflow publishes the packages

This keeps versioning decisions close to the original change instead of forcing someone to reconstruct intent at release time.

## Notes

- this folder is tool-managed, but the markdown files inside it are part of normal repository history
- do not rewrite old committed changesets unless the release process explicitly requires it
- for upstream Changesets docs, see https://github.com/changesets/changesets

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
