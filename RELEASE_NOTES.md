# Caliberate v2.5.0

This release adds first-run setup and administrator recovery tools, improves
interview availability handling, and expands automated regression coverage.

- Choose demo data or a clean administrator account in the setup wizard.
- Reset the application back to setup, with session revocation and restart persistence.
- Back up and restore business data, accounts, settings, history, and uploaded resumes.
- View and filter login history; import and export user accounts using CSV.
- Enforce first-login password changes and improve imported panel account recovery.
- Keep panel availability within the current and next workweek, including rollover handling.
- Improve interview scheduling validation and panel cancellation notifications.
- Remove unused starter assets and improve deployment/setup documentation.
- Run all feature and regression suites against disposable test data through `npm test` and CI.

Validation: production build and lint pass; 126 feature assertions, four availability
tests, and the admin regression suite pass. Production dependency audits reported
zero known vulnerabilities. Interactive browser testing remains outstanding because
browser automation access was unavailable. See `TESTING.md` for coverage and limitations.

Package versions, runtime health version, deployment defaults, and the UI version
label are aligned to 2.5.0.
