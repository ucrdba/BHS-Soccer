# The legacy tactical board — a test fixture, not shipped code

`diagrammer.legacy.js` is the canvas engine the app used before the Vue
rebuild. It is not loaded by the application, not part of the module graph,
and not copied into `dist/`. It is here because four tests in `src/diagram/`
build a diagram on it and compare the result with the rebuilt modules.

**That comparison is the only thing standing between a subtle reader change
and every diagram a coach has drawn.** `diagram_data` is stored on drills and
practice-plan rows as an unversioned blob. There is no migration path and no
validation, so a reader that expects a slightly different shape does not fail
loudly — the board simply opens empty, with nothing on screen saying why.

So this file is a golden master for a format that is still in the database.
Do not edit it to match a change in `src/diagram/`; if the two disagree, the
stored blobs agree with this one.

It survived the Phase 7 deletion of `public/js/` for exactly this reason.
