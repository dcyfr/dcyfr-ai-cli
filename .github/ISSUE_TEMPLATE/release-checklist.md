name: Release Checklist
about: Internal checklist for maintainers publishing releases
title: 'Release v[VERSION]'
labels: release
assignees: ''

---

## Pre-Release Checklist

- [ ] All CI checks passing on main
- [ ] Release PR created by changesets bot
- [ ] CHANGELOG.md reviewed and accurate
- [ ] Version number appropriate (patch/minor/major)
- [ ] No unintended changes in package.json
- [ ] Tests pass locally: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Documentation updated if needed

## Release Steps

- [ ] Review and approve Release PR
- [ ] Merge Release PR to trigger publish
- [ ] Verify publish succeeded in GitHub Actions
- [ ] Verify package on npm: https://www.npmjs.com/package/@dcyfr/ai-cli
- [ ] Test installation: `npm install @dcyfr/ai-cli@latest`
- [ ] Verify git tag created
- [ ] Verify GitHub release created

## Post-Release

- [ ] Update dependent projects if needed
- [ ] Announce in discussions (if major/minor)
- [ ] Update documentation site (if applicable)
- [ ] Close this issue

## Notes

Add any special notes or breaking changes here:

---

**Automated publish workflow:** Merge Release PR → GitHub Action → npm publish
**Manual publish (emergency only):** See [RELEASE_MANAGEMENT.md](../docs/RELEASE_MANAGEMENT.md#manual-version-bumps)