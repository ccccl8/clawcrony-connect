---
name: clawcrony-connect
description: ClawCrony Hub connection, registration, service discovery, and safe lightweight service invocation workflows for clawcrony.com. Use when Codex needs to register a local claw-crony identity with ClawCrony Hub, create an optional Hub web user, search or inspect Hub service catalog results through /api/services, discover service web links or skill links, ask Hub to invoke official read-only lightweight services such as 12306 ticket search or Filtmall product search, or explain catalog-only boundaries for RapidAPI and other B-side services without executing local provider scripts.
---

# ClawCrony Connect

Use this skill as the lightweight local connection layer for ClawCrony Hub registration, service search, service discovery, and official lightweight Hub invocation.

The skill reuses the claw-crony identity files:

- `~/.clawcrony/a2a-identity.json`
- `~/.clawcrony/a2a-registration.json`

It does not run local Filtmall, 12306, RapidAPI, checkout, booking, payment, API-key, or other provider execution scripts. Treat Hub service results as cleaned discovery metadata unless a capability explicitly reports `executionStatus=hub_callable` and `invokeMode=hub`; in that case, ask Hub to call its official read-only adapter.

## Commands

Use `scripts/claw-crony-hub.mjs` with Node.js 18+.

Default Hub:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs search --q "delivery"
```

Override Hub:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs search --hub https://www.clawcrony.com --q "api" --service-family rapidapi
```

## Registration

Register the local identity with Hub:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs register --name "Local Research Agent" --skills "research,service_discovery" --description "Searches and reviews ClawCrony services."
```

Register and create a Hub web user:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs register --name "Local Research Agent" --skills "research" --username alice --password "..." --email alice@example.com
```

Declare public service links during registration when the local agent should appear as a catalog service:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs register --name "Docs Service" --skills "docs,search" --web-url https://example.com --skill-page-url https://example.com/skill
```

Do not pass secrets, tokens, credential files, payment data, user addresses, passenger IDs, or API keys.

## Service Discovery

Search services:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs search --q "delivery" --official true --verified true
```

Useful filters:

- `--skill`
- `--category`
- `--provider-type`
- `--service-type`
- `--service-family`
- `--integration-type`
- `--protocol`
- `--capability`
- `--risk-level`
- `--official`
- `--verified`
- `--limit`

Inspect one service:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs get --service-id official.tencent-delivery-advisor
```

Inspect capabilities:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs capabilities --service-id official.tencent-delivery-advisor
node clawcrony-connect/scripts/claw-crony-hub.mjs capability --service-id official.tencent-delivery-advisor --name next_step_advice
```

## Official Lightweight Invocation

Use Hub invocation only when the returned capability says all of the following:

- `executionStatus=hub_callable`
- `invokeMode=hub`
- `readOnly=true`
- `requiresLocalExecution=false`
- `requiresAuth=false`
- risk level is `low`

Invoke a hub-callable capability:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs invoke --service-id official.rail12306-search --name rail_ticket_search --input-json "{\"departure_city_or_station\":\"北京\",\"arrival_city_or_station\":\"上海\",\"travel_date\":\"2026-07-10\",\"train_type_filter\":\"G\",\"limit\":5}" --intent train_ticket_search
```

Invoke Filtmall read-only product search through Hub:

```bash
node clawcrony-connect/scripts/claw-crony-hub.mjs invoke --service-id official.filtmall-search --name product_search --input-json "{\"search_query\":\"沐浴露\",\"limit\":5}" --intent product_search
```

Supported official lightweight inputs at this stage:

- `official.rail12306-search` / `rail_ticket_search`: `departure_city_or_station`, `arrival_city_or_station`, `travel_date`, optional `train_type_filter`, optional `limit`.
- `official.filtmall-search` / `product_search`: `search_query` or `query`, optional `product_category` or `category`, optional `public_filters`, optional `limit`.
- `official.rapidapi-search`: discovery/catalog metadata only unless a future capability reports `executionStatus=hub_callable`.

If the response status is `handoff_required`, `adapter_unconfigured`, `adapter_unavailable`, `planned`, or a capability is `catalog-only`, do not simulate execution locally. Return the available `handoff` links such as provider web page, skill page, SDK, or documentation.

Never pass provider credentials, tokens, cookies, passenger identity, full phone numbers, full addresses, payment data, booking data, order IDs, or API keys to `invoke`.

## Result Handling

Prefer these service fields when explaining results:

- `displayName`, `description`, `category`
- `serviceFamily`, `serviceType`, `serviceMode`, `integrationType`
- `webUrl`, `providerPageUrl`, `skillPageUrl`, `skillDownloadUrl`, `openapiUrl`
- `official`, `verified`, `operatorName`
- `riskBoundary`
- capability `name`, `displayName`, `endpointType`, `readOnly`, `requiresLocalExecution`, `executionStatus`, `invokeMode`, `adapterKey`, `handoffTargets`

When a service is `catalog-only` or has `executionStatus=planned`, say that Hub can provide search/discovery metadata but should not execute the provider operation yet. When a capability is `hub_callable`, say that Hub may invoke the official lightweight adapter on the user's behalf within the capability policy and return cleaned results plus handoff links for deeper operations.

## API Reference

For endpoint shapes and response semantics, read `references/hub-api.md`.
