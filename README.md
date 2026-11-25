# Vairas Frontend

Vairas is an Angular single-page application for driving-school staff and students. It uses Angular 21, strict TypeScript, Signals, PrimeNG, Tailwind CSS, Vitest and Playwright. Runtime business data comes from the Vairas API Gateway; the application has no demo or mock runtime.

## Local development

Prerequisites: Node.js 22.12+ (or 24), npm 11.21.3, Docker Desktop and .NET 10 SDK. For reproducible installation use `npx --yes npm@11.21.3 ci`.


Start the local backend stack and synthetic integration scenarios:

```powershell
cd D:\Projects\Vairas\Backend
./local/Start.ps1
./local/Run-Scenarios.ps1
```

Install and start the frontend:

```powershell
cd D:\Projects\Vairas\Frontend
npm ci
npm start
```

Open `https://localhost:4200`. The development server proxies `/api` to the local Gateway at `https://localhost:7000` and verifies its certificate with the local CA. Start the backend first; unavailable services produce an error in the application and never trigger mock data. The local stack creates test credentials and mail capture details under `Backend/local/.state`; keep that directory private.

`public/config.json` contains `apiBaseUrl`. Leave it empty for the same-origin local proxy, or set it to the HTTPS API Gateway origin for a hosted local setup. The app rejects insecure non-loopback API origins.

## Checks

```powershell
npm test
npm run test:e2e
npm run test:coverage
npm run lint
npm run format:check
npm run build
```

The e2e command targets the actual local backend and expects `Backend/local/Run-Scenarios.ps1` to have produced `.state/scenario-state.json`. Unit tests use isolated API doubles and synthetic fixtures. Architecture, user flows, API boundaries and verification notes live in `../Documentation/Frontend`.

The UI uses the default PrimeNG Aura preset and Tailwind for layout. Light/dark selection is persisted as the non-sensitive `vairas.theme` preference. No custom theme or token layer is maintained.

## Coverage

The existing Angular/Vitest builder requires `@vitest/coverage-v8` matching Vitest 4.1.10. In an environment with npm registry access, permanently record it in the manifest and lock file:

```powershell
npm install --save-dev --save-exact @vitest/coverage-v8@4.1.10
npm run test:coverage
```

Until the lock file can be updated, `npm run setup:coverage` installs the exact provider without modifying the lock file; CI invokes this temporary bootstrap before the coverage gate. Reports include text, HTML, LCOV and JSON summary, with a 70% line threshold. No coverage percentage is claimed until the command succeeds.

## Automated verification

The GitHub Actions workflow runs lint, formatting, coverage and build on pushes and pull requests. The live E2E job requires a dedicated isolated Windows runner labelled `vairas-local-backend`, with a compatible Backend checkout beside Frontend, .NET SDK, Docker, Python and Edge installed. It starts the local stack and synthetic scenarios, starts the HTTPS frontend and runs the theme and live browser checks. Fork pull requests are excluded from self-hosted execution for security; an authorized maintainer must verify them on an isolated environment. The runner must not use production or personal development databases.

## Known integration dependencies

The backend must expose the new scheduling request list and saved proposal GET routes through Gateway. Assessment historical review requires the exact invalidation timestamp from Learning Tracking; ordinary recorded result corrections and history use existing API contracts. The enrollment page can recover a missing Learning Tracking programme pin from authoritative progress, but durable cross-service configuration status still belongs to the backend.
