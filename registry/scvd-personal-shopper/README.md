# Personal shopper distribution — 2026-10-12

`catalog.json` is the intended ClawHub metadata for this skill only. Categories
come from the official skill taxonomy, read October 12. Topics describe the
workflow; none imply platform endorsement. The skill instructions are free;
the store charges only for separately approved purchases.

Publish after the matching source and public URLs are live. Include the exact
source commit and `sourcePath`. Use the catalog's category/topic values with
`clawhub skill publish`, not `sync` (which omits this metadata). A dry run
validates packaging but does not validate category slugs at the registry.
Check public inspect/search and a clean temporary install after publication;
scan-held releases may be invisible even when upload succeeded.

Skills CLI: `npx skills add seancrecord/scvd-general-store-repo --skill scvd-personal-shopper`.
Website installation: `npx skills add https://scvd.store --skill scvd-personal-shopper`.
Hermes: `hermes skills inspect well-known:https://scvd.store/.well-known/skills/scvd-personal-shopper`.

Keep controlled verification installs separate from organic installs. No
leaderboard or native payment-support claim follows from these commands.
