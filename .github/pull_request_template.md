## What this changes

## What would catch it going stale
The house rule: every public claim ships with the check that fails
when it stops being true. If this PR adds or changes a claim, name
the test that guards it.

## Checks
- [ ] `npm test` green (the suite is the store's public promises)
- [ ] `npm run typecheck`
- [ ] No counter edited, no correction overwritten, no `⚑ keeper's pen` copy reworded
