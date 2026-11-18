# Agent ownership map (parallel build)
- Shared contracts (edit only by lead): src/server/schema.ts, src/server/db.ts, src/lib/plans.ts, src/app/globals.css, src/app/layout.tsx
- Core/security agent: src/server/auth/**, src/server/security/**, src/server/loyalty/**, src/server/tenancy.ts, src/server/limits.ts, src/server/audit.ts, tests/unit|integration for those
- App UI agent: src/app/(app)/**, src/app/api/app/**, src/components/app/**
- Payments agent: src/server/payments/**, src/app/api/payments/**, tests for payments, docs/payments.md
- Site/SEO agent: src/app/(site)/**, src/app/robots.ts, src/app/sitemap.ts, src/app/not-found.tsx, src/components/site/**, src/content/**, src/app/api/indexnow/**, public/**
- Research agent: docs/legal/**, docs/research/**
