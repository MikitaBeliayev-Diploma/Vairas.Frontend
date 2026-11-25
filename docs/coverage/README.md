# Frontend — code coverage

**Line coverage 71.95 %** (2188/3041), statements 69.66 %, functions 62.25 %, branches 66.17 % — the 70 % line threshold **is met** (`ng test --configuration coverage` fails below it). Generated 2026-11-25.

- Tool: Angular unit-test builder with Vitest 4.1.10 and `@vitest/coverage-v8` 4.1.10 (exact, recorded in `package.json` / `package-lock.json`).
- Scope: `src/app/**/*.ts`, `src/bootstrap.ts`, `src/main.ts` (specs excluded); no business file is excluded.
- Tests: 33 spec files, 154 tests (components, HTTP clients, stores, theme); plus browser tests in `e2e/` (Playwright: `theme.spec.mjs`, live full-stack `live.spec.mjs`).
- Reports here: `coverage-summary.json` (JSON summary), `lcov.info` (LCOV), `html/index.html` (browsable HTML report).
- Coverage measures executed lines only; it is not evidence that the business requirements are complete.

## Reproduce

```powershell
npm ci
npm run test:coverage      # writes coverage/vairas/*, fails below the 70 % line threshold
```

## Least covered files (lines)

| File | Line % | Lines |
|---|---:|---:|| `core/guards.ts` | 0 | 0/12 |
| `features/admin/audit.ts` | 0 | 0/25 |
| `features/training/my-training.ts` | 0 | 0/5 |
| `features/learners/learners.ts` | 0 | 0/6 |
| `features/profile/profile.ts` | 0 | 0/32 |
| `features/dashboard/dashboard.ts` | 0 | 0/20 |
| `domain/api/role-profile-api.ts` | 0 | 0/6 |
| `features/onboarding/invitations.ts` | 0 | 0/24 |
| `app.config.ts` | 0 | 0/1 |
| `D:/Projects/Vairas/Frontend/src/main.ts` | 0 | 0/1 |

