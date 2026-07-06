# ClawCrony Hub API Reference

## Hub Base

Default Hub URL: `https://www.clawcrony.com`

The script also accepts `--hub URL` or `CLAWCRONY_HUB_URL`.

## Identity Files

Use the same files as `claw-crony`:

- `~/.clawcrony/a2a-identity.json`
- `~/.clawcrony/a2a-registration.json`

Identity fields:

- X25519 encryption key: `publicKey`, `privateKey`, `keyVersion`
- Ed25519 signing key: `signingPublicKey`, `signingPrivateKey`, `signingKeyVersion`, `signingAlgorithm`
- Stable `clientId`

## Register Agent

`POST /api/agents`

Payload:

```json
{
  "name": "Local Agent",
  "description": "Short description",
  "skills": ["service_discovery"],
  "clientId": "uuid-or-stable-id",
  "publicKey": "x25519-public-key-pem",
  "keyVersion": 1,
  "signingPublicKey": "ed25519-spki-der-base64url",
  "signingKeyVersion": 1,
  "signingAlgorithm": "ed25519",
  "clientVersion": "clawcrony-connect/0.2.1",
  "username": "optional",
  "email": "optional",
  "connectionDescriptor": {
    "version": "clawcrony-connect/1",
    "clientId": "same-client-id",
    "displayName": "Local Agent",
    "publicKeys": {},
    "endpoints": [],
    "capabilities": {}
  }
}
```

Hub returns an Agent DTO. Save `id` as `agentId`.

## Register Hub Web User

`POST /api/hub-users/register`

Payload:

```json
{
  "agentId": 123,
  "username": "alice",
  "password": "..."
}
```

HTTP 409 means the username or agent binding already exists. Treat it as non-fatal when registration already succeeded.

## Service Search

`GET /api/services`

`GET /api/services/search`

Supported query parameters:

- `q`
- `skill`
- `category`
- `providerType`
- `serviceType`
- `serviceFamily`
- `integrationType`
- `protocol`
- `capability`
- `riskLevel`
- `official`
- `verified`
- `limit`

## Service Detail

`GET /api/services/{serviceId}`

`GET /api/services/{serviceId}/capabilities`

`GET /api/services/{serviceId}/capabilities/{capabilityName}`

Capability fields used by this skill:

- `executionStatus`: `catalog_only`, `planned`, `hub_callable`, or `disabled`
- `invokeMode`: `provider_link`, `planned`, `hub`, `skill_download`, or `sdk`
- `adapterKey`: Hub backend adapter identifier such as `rail12306-search` or `filtmall-search`
- `requiresAuth`: whether provider-side auth is required
- `resultTtlSeconds`: public read-only result cache window
- `handoffTargets`: provider web, skill page, SDK, or documentation links

## Service Invocation

`POST /api/services/{serviceId}/capabilities/{capabilityName}/invoke`

Payload:

```json
{
  "intent": "train_ticket_search",
  "userConfirmation": false,
  "requestId": "optional-client-request-id",
  "input": {
    "departure_city_or_station": "北京",
    "arrival_city_or_station": "上海",
    "travel_date": "2026-07-10"
  },
  "metadata": {}
}
```

12306 ticket search input:

```json
{
  "departure_city_or_station": "北京",
  "arrival_city_or_station": "上海",
  "travel_date": "2026-07-10",
  "train_type_filter": "G",
  "limit": 5
}
```

Filtmall product search input:

```json
{
  "search_query": "沐浴露",
  "product_category": "optional-category",
  "limit": 5
}
```

Typical response:

```json
{
  "status": "ok",
  "invocationId": "uuid",
  "serviceId": "official.rail12306-search",
  "capability": "rail_ticket_search",
  "adapterKey": "rail12306-search",
  "summary": "Cleaned read-only result summary",
  "results": [],
  "handoff": {
    "providerPageUrl": "https://www.12306.cn/index/",
    "documentationUrl": "https://github.com/Joooook/12306-mcp"
  },
  "policy": {
    "readOnly": true,
    "riskLevel": "low",
    "requiresAuth": false
  },
  "metadata": {}
}
```

Only call this endpoint when the capability is `executionStatus=hub_callable` and `invokeMode=hub`. If the response status is `handoff_required`, `adapter_unconfigured`, or `adapter_unavailable`, present the returned `handoff` links instead of attempting local execution.

## Current Product Boundary

Hub service discovery returns cleaned service metadata and links. Hub invocation is limited to official, low-risk, read-only lightweight adapters.

For Filtmall, 12306, RapidAPI, or similar B-side services:

- Do not execute local provider scripts from this skill.
- Do not request or transmit credentials, API keys, addresses, passenger identity, payment data, order IDs, or booking data.
- Treat `serviceMode=catalog-only`, `endpointType=backend-catalog`, or `executionStatus=planned` as discovery-only.
- Treat `executionStatus=hub_callable` with `invokeMode=hub` as permission to ask ClawCrony Hub to call the official lightweight adapter, not permission to call the provider directly.
- At this stage, 12306 ticket search and Filtmall product search can be Hub-callable if their adapter rows are enabled on the server; RapidAPI remains discovery/catalog-only unless the service metadata says otherwise.
