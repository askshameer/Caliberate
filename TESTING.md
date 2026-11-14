# Test report — 14 November 2026

## Verified

| Check | Result |
| --- | --- |
| Production client build | Pass |
| Client lint | Pass, no warnings |
| API and business-rule feature suite | 126 assertions passed |
| Availability regression suite | 4 tests passed |
| Admin regression suite | Pass |
| Server production dependency audit | 0 known vulnerabilities |
| Client production dependency audit | 0 known vulnerabilities |

Feature checks cover all seven demo roles, authentication and cookie sessions,
logout/revocation, forced password rotation, role permissions and financial masking,
workforce creation/editing/deactivation, partial allocations, self-service profile
updates, marketplace jobs and applications, staffing deployment/release/rejection,
bench policies, calculation helpers, audit records, account provisioning/deactivation,
CSV import/export, external hiring approvals and candidates, panel availability,
interview skill matching/conflicts/cancellation/completion, notifications and read
counts, request validation, and health/readiness/security headers.

Admin regressions cover reset and setup persistence across restart, clean/demo setup,
imported-user login, mandatory-password form rendering, panel profile recovery,
login-history access and filters, backup/restore including uploaded resumes,
invalid-backup rollback, and session revocation. These include server-rendered
component checks; they are not interactive browser tests.

## Run again

Install root, client, and server dependencies, then run:

```sh
npm run lint
npm test
npm audit --prefix server --omit=dev
npm audit --prefix client --omit=dev
```

In PowerShell environments that block `npm.ps1`, use `npm.cmd` instead.
`npm test` builds the client, runs the main suite on a temporary database with an
OS-assigned port, then runs availability and admin regressions. It does not need
the development servers and does not touch the normal application's database or
uploads. The admin suite uses port 43117. The isolated runner prints server logs
on assertion failures and removes its temporary data afterward.

The calculation checks now import the application's actual helpers instead of
testing duplicated implementations. CI runs all three suites through `npm test`.

## Cleanup and fix

Removed unused Vite starter files after checking source references:

- `client/README.md`
- `client/src/App.css`
- `client/src/assets/hero.png`
- `client/src/assets/react.svg`
- `client/src/assets/vite.svg`
- `client/public/icons.svg`

Temporary UI test data was removed and the test server stopped. Requirements,
standalone prototypes, runtime data, dependencies, and pre-existing working changes
were preserved. The auth configuration retry now resets its loading/error state
in the retry callback, eliminating the synchronous effect update lint warning.

## Remaining verification

Interactive browser testing could not be completed: the browser access host was
unavailable and the native Chrome access request timed out. Visual layouts,
responsive behavior, keyboard accessibility, browser downloads, and every UI
button/modal therefore remain unverified. No claim of complete UI coverage is made.

Production deployment, load/concurrency, exhaustive security testing, and external
notification delivery were not tested. Email/Slack/Teams delivery is documented as
requiring a provider integration. Dependency audits report known advisories only.
