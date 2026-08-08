# UniNet Phase 5G — Microservice runtime architecture

## Runtime services

| Service | Local port | Responsibility |
|---|---:|---|
| API Gateway | `4000` | Browser CORS, preflight, route forwarding, upstream error envelope, aggregate readiness |
| Identity Service | `4101` | Password/Google authentication, sessions, privacy policies, notifications |
| Core Service | `4102` | Universities, memberships, content/workflows, surveys, Student APIs, settings and files |
| PostgreSQL | `5432` | Current transactional datastore |
| Redis | `6379` | Rate limiting, cache/realtime support |
| Frontend | `5173` or `5174` | React/Vite client; communicates only with the gateway |

The browser never needs to call ports `4101` or `4102`. Its stable API address remains:

```env
VITE_API_URL=http://localhost:4000/api
```

## Route ownership

The gateway forwards these prefixes to Identity Service:

```text
/api/auth
/api/privacy
/api/notifications
```

All other `/api/*` routes go to Core Service, including:

```text
/api/public
/api/student
/api/surveys
/api/operations
/api/memberships
/api/universities
/api/settings
/api/files
/api/openapi.json
```

## Local startup — three terminals

### Terminal 1 — infrastructure

```powershell
docker compose up -d postgres redis mailpit minio minio-init clamav
```

### Terminal 2 — all backend services

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
npm run services:dev
```

Expected ports:

```text
Identity Service  http://127.0.0.1:4101
Core Service      http://127.0.0.1:4102
API Gateway       http://127.0.0.1:4000
```

### Terminal 3 — frontend

```powershell
npm run dev
```

Open the exact URL printed by Vite.

## Readiness checks

```text
http://localhost:4000/api/health
http://localhost:4000/api/ready
http://localhost:4101/api/health
http://localhost:4102/api/health
```

`/api/ready` on the gateway returns the current status of both downstream services.

## Docker Compose

The Compose stack now contains separate deployable processes:

```text
db-migrate
identity-service
core-service
api-gateway
frontend
```

The gateway is the only backend service exposed on host port `4000`.

## Current migration boundary

Phase 5G provides real independently running service processes, route ownership and an API gateway. To avoid destabilizing the diploma MVP immediately before review, Identity and Core currently share the existing PostgreSQL schema. A later production migration should add:

- database/schema ownership per service;
- service-to-service authentication;
- event/outbox messaging instead of cross-domain database access;
- distributed tracing and centralized metrics;
- independent deployment pipelines and rollback policies.

The current architecture is therefore a functional **microservice runtime transition**, not yet a fully autonomous database-per-service production topology.
