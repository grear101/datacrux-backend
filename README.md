# Datacrux Smart Sales Platform — Backend (Phase 1)

Phase 1 goal: prove the riskiest part of the platform — the Negotiation
Engine's server-side price guardrails — works, before building the rest.

## What's built

- **Prisma schema** (`prisma/schema.prisma`) — every table carries `clientId`
  from day one, even though Phase 1 runs single-tenant. Turning on real
  multi-tenancy in Phase 2 is a config/auth change, not a schema rewrite.
- **Negotiation Engine** (`src/negotiation/`) — the core rule:
  - Product pricing is always fetched fresh from the DB, never trusted from
    the request or the AI conversation layer.
  - A negotiated price can **never** go below `Product.minPrice`. If the AI
    or customer pushes for less, the engine counters at the floor instead.
  - An offer above list price is capped at list price, not accepted verbatim.
  - Every decision (approved or rejected) is written to `AuditLog`.
  - Tenant isolation is enforced in the query itself (`WHERE id = ? AND
    clientId = ?`), so a request can't act on another client's product.
- Unit tests (`negotiation.service.spec.ts`) proving the floor holds.

## Setup

```bash
cp .env.example .env
# edit .env with your real DATABASE_URL

npm install
npx prisma generate     # requires network access to Prisma's binary CDN
npx prisma migrate dev --name init
npm run start:dev
```

> Note: `prisma generate` / `migrate` need to reach `binaries.prisma.sh`.
> That was blocked in the sandbox this was built in, so the generated client
> hasn't been run here yet — it will work in a normal dev environment or CI.

## Try it

Once running, seed at least one `Client` and one `Product` (with `price` and
`minPrice` set), put that client's id in `ACTIVE_CLIENT_ID`, then:

```bash
curl -X POST http://localhost:3000/negotiation/evaluate \
  -H "Content-Type: application/json" \
  -d '{"productId": "your_product_id", "requestedPrice": 50, "quantity": 1}'
```

Try a `requestedPrice` below the product's `minPrice` — the response should
come back `approved: false` with `finalPrice` sitting exactly at the floor.

## What's next (Phase 2)

- Auth Service: real JWT/API-key based `clientId` extraction, replacing the
  `ACTIVE_CLIENT_ID` env-var placeholder in `negotiation.controller.ts`.
- Client Configuration Service (branding, products, pricing per tenant).
- Conversation Service to wire the AI layer into `NegotiationService.evaluate()`.
