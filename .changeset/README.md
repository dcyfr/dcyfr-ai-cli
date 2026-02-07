# Changesets

This directory stores changeset configuration and changelog entries for the @dcyfr/ai-cli package.

## Usage

To create a new changeset:

```bash
npm run changeset
```

To version packages based on changesets:

```bash
npm run changeset:version
```

To publish packages:

```bash
npm run changeset:publish
```

## Automated Release Process

Releases are automated through GitHub Actions:

1. Create changesets for your changes using `npm run changeset`
2. Push to the main branch
3. The release workflow will create/update a PR with version bump
4. Merge the PR to trigger the actual release to npm