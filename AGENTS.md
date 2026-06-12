# Agent Notes

This repo is part of the Film Objektiv Service Fabric. Keep agent-facing architecture docs current.

When changing runtime boundaries, deploy flow, env/config ownership, database or RLS behavior, external integrations, background jobs, health/readiness/heartbeat behavior, or cross-repo contracts, update both:

- `docs/architecture.md`
- `ops/service-catalog.yml`

Do not include secrets in docs or manifests. Use Service Fabric status language when describing service state: `Up`, `Ready`, `Delayed`, `Degraded`, `Blocked`, `Down`.
