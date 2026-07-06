#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "clawcrony-connect/0.2.1";
const DEFAULT_HUB = "https://www.clawcrony.com";
const CONFIG_DIR = path.join(os.homedir(), ".clawcrony");
const IDENTITY_FILE = path.join(CONFIG_DIR, "a2a-identity.json");
const REGISTRATION_FILE = path.join(CONFIG_DIR, "a2a-registration.json");

function usage() {
  console.log(`ClawCrony Connect Hub CLI ${VERSION}

Commands:
  identity [--client-id ID]
  register --name NAME --skills a,b [--description TEXT] [--hub URL]
           [--username NAME --password PASSWORD] [--email EMAIL]
           [--web-url URL] [--skill-page-url URL] [--skill-download-url URL]
           [--openapi-url URL] [--mcp-url URL] [--custom-http-url URL] [--a2a-url URL]
  search [--hub URL] [--q TEXT] [--skill TAG] [--category C]
         [--provider-type T] [--service-type T] [--service-family F]
         [--integration-type T] [--protocol P] [--capability C]
         [--risk-level R] [--official true|false] [--verified true|false] [--limit N]
  get --service-id ID [--hub URL]
  capabilities --service-id ID [--hub URL]
  capability --service-id ID --name CAPABILITY [--hub URL]
  invoke --service-id ID --name CAPABILITY --input-json JSON [--intent TEXT] [--confirm true|false] [--hub URL]

This CLI registers identities, reads Hub service metadata, and can ask Hub to invoke official lightweight read-only services when a capability is explicitly hub-callable. It does not execute local provider scripts.

Examples:
  invoke --service-id official.rail12306-search --name rail_ticket_search --intent train_ticket_search --input-json '{"departure_city_or_station":"北京","arrival_city_or_station":"上海","travel_date":"2026-07-10","train_type_filter":"G","limit":5}'
  invoke --service-id official.filtmall-search --name product_search --intent product_search --input-json '{"search_query":"沐浴露","limit":5}'
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function hubUrl(args) {
  return String(args.hub || process.env.CLAWCRONY_HUB_URL || DEFAULT_HUB).replace(/\/+$/, "");
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureConfigDir();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
  return data;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function boolArg(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (/^(true|1|yes)$/i.test(String(value))) return true;
  if (/^(false|0|no)$/i.test(String(value))) return false;
  return String(value);
}

function jsonArg(value, message) {
  if (!value || !String(value).trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON value must be an object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`${message}: ${error.message}`);
  }
}

function requireText(value, message) {
  if (!value || !String(value).trim()) {
    throw new Error(message);
  }
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function createSigningKeyFields() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    signingPublicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64url"),
    signingPrivateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    signingKeyVersion: 1,
    signingAlgorithm: "ed25519",
  };
}

function loadOrCreateIdentity(clientId) {
  ensureConfigDir();
  const existing = readJson(IDENTITY_FILE);
  if (existing) {
    let changed = false;
    if (clientId && existing.clientId !== clientId) {
      existing.clientId = clientId;
      changed = true;
    }
    if (!existing.signingPublicKey || !existing.signingPrivateKey) {
      Object.assign(existing, createSigningKeyFields());
      changed = true;
    }
    if (!existing.signingKeyVersion) {
      existing.signingKeyVersion = 1;
      changed = true;
    }
    if (!existing.signingAlgorithm) {
      existing.signingAlgorithm = "ed25519";
      changed = true;
    }
    if (changed) writeJson(IDENTITY_FILE, existing);
    return existing;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
  const identity = {
    version: 1,
    clientId: clientId?.trim() || crypto.randomUUID(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    keyVersion: 1,
    ...createSigningKeyFields(),
    createdAt: nowIso(),
  };
  return writeJson(IDENTITY_FILE, identity);
}

function publicIdentity(identity) {
  return {
    version: identity.version,
    clientId: identity.clientId,
    publicKey: identity.publicKey,
    keyVersion: identity.keyVersion || 1,
    signingPublicKey: identity.signingPublicKey,
    signingKeyVersion: identity.signingKeyVersion || 1,
    signingAlgorithm: identity.signingAlgorithm || "ed25519",
    createdAt: identity.createdAt,
  };
}

function endpoint(protocol, url, metadata = {}) {
  if (!url) return null;
  const text = String(url).trim();
  if (!text) return null;
  return {
    protocol,
    transport: text.startsWith("https://") ? "https" : "http",
    url: text,
    auth: "none",
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
}

function dedupeEndpoints(values) {
  const seen = new Set();
  const result = [];
  for (const value of values.filter(Boolean)) {
    const key = `${value.protocol}:${value.transport}:${value.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildDescriptor(identity, args, skills) {
  const endpoints = dedupeEndpoints([
    endpoint("web", args["web-url"], { catalogOnly: true }),
    endpoint("skill-page", args["skill-page-url"], { catalogOnly: true }),
    endpoint("skill-download", args["skill-download-url"], { catalogOnly: true }),
    endpoint("openapi", args["openapi-url"]),
    endpoint("mcp", args["mcp-url"]),
    endpoint("custom-http", args["custom-http-url"]),
    endpoint("a2a", args["a2a-url"], { agentCardUrl: args["agent-card-url"] }),
  ]);
  const protocols = dedupeStrings([
    ...splitList(args.protocols),
    ...endpoints.map((item) => item.protocol),
  ]);

  return {
    version: "clawcrony-connect/1",
    clientId: identity.clientId,
    displayName: requireText(args.name, "name is required"),
    publicKeys: {
      encryption: {
        type: "X25519",
        publicKey: identity.publicKey,
        keyVersion: identity.keyVersion || 1,
      },
      signing: {
        type: "Ed25519",
        publicKey: identity.signingPublicKey,
        keyVersion: identity.signingKeyVersion || 1,
        algorithm: "ed25519",
        status: "active",
      },
    },
    endpoints,
    capabilities: {
      skills,
      protocols,
      inputModes: splitList(args["input-modes"] || "text,application/json"),
      outputModes: splitList(args["output-modes"] || "text,application/json"),
      metadata: {
        client: VERSION,
        catalogOnly: endpoints.every((item) => ["web", "skill-page", "skill-download"].includes(item.protocol)),
      },
    },
    metadata: {
      implementation: "clawcrony-connect",
      description: args.description || "",
    },
  };
}

async function requestJson(hub, method, pathName, payload) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") headers["Content-Type"] = "application/json";
  const response = await fetch(`${hub}${pathName}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(payload || {}),
  });
  const text = await response.text();
  let body = text;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } else {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`Hub ${method} ${pathName} failed ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

function appendQuery(pathName, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${pathName}?${text}` : pathName;
}

async function register(args) {
  const hub = hubUrl(args);
  const identity = loadOrCreateIdentity(args["client-id"]);
  const skills = splitList(requireText(args.skills, "skills is required"));
  const descriptor = buildDescriptor(identity, args, skills);
  const payload = {
    name: requireText(args.name, "name is required"),
    description: args.description || "",
    skills,
    clientId: identity.clientId,
    publicKey: identity.publicKey,
    keyVersion: identity.keyVersion || 1,
    signingPublicKey: identity.signingPublicKey,
    signingKeyVersion: identity.signingKeyVersion || 1,
    signingAlgorithm: "ed25519",
    clientVersion: VERSION,
    username: args.username,
    email: args.email,
    connectionDescriptor: descriptor,
  };

  const agent = await requestJson(hub, "POST", "/api/agents", payload);
  const registration = {
    version: 4,
    hubUrl: hub,
    agentId: agent.id,
    clientId: identity.clientId,
    publicKey: identity.publicKey,
    keyVersion: identity.keyVersion || 1,
    signingPublicKey: identity.signingPublicKey,
    signingKeyVersion: identity.signingKeyVersion || 1,
    signingAlgorithm: "ed25519",
    registeredAt: nowIso(),
    name: payload.name,
    description: payload.description,
    skills,
    connectionDescriptor: descriptor,
  };
  writeJson(REGISTRATION_FILE, registration);

  let hubUser = null;
  if (args.username && args.password) {
    try {
      hubUser = await requestJson(hub, "POST", "/api/hub-users/register", {
        agentId: agent.id,
        username: args.username,
        password: args.password,
      });
    } catch (error) {
      if (!String(error.message).includes(" 409:")) throw error;
      hubUser = { status: "already_exists" };
    }
  }

  return { ok: true, hubUrl: hub, agent, registration, hubUser };
}

async function searchServices(args) {
  const hub = hubUrl(args);
  const pathName = appendQuery("/api/services/search", {
    q: args.q,
    skill: args.skill,
    category: args.category,
    providerType: args["provider-type"],
    serviceType: args["service-type"],
    serviceFamily: args["service-family"],
    integrationType: args["integration-type"],
    protocol: args.protocol,
    capability: args.capability,
    riskLevel: args["risk-level"],
    official: boolArg(args.official),
    verified: boolArg(args.verified),
    limit: args.limit,
  });
  const services = await requestJson(hub, "GET", pathName);
  return {
    ok: true,
    source: "clawcrony-hub-services",
    hubUrl: hub,
    count: Array.isArray(services) ? services.length : 0,
    services,
  };
}

async function getService(args) {
  const serviceId = encodeURIComponent(requireText(args["service-id"], "service-id is required"));
  const service = await requestJson(hubUrl(args), "GET", `/api/services/${serviceId}`);
  return { ok: true, service };
}

async function getCapabilities(args) {
  const serviceId = encodeURIComponent(requireText(args["service-id"], "service-id is required"));
  const capabilities = await requestJson(hubUrl(args), "GET", `/api/services/${serviceId}/capabilities`);
  return { ok: true, capabilities };
}

async function getCapability(args) {
  const serviceId = encodeURIComponent(requireText(args["service-id"], "service-id is required"));
  const name = encodeURIComponent(requireText(args.name, "name is required"));
  const capability = await requestJson(hubUrl(args), "GET", `/api/services/${serviceId}/capabilities/${name}`);
  return { ok: true, capability };
}

async function invokeCapability(args) {
  const serviceIdRaw = requireText(args["service-id"], "service-id is required");
  const capabilityNameRaw = requireText(args.name, "name is required");
  const serviceId = encodeURIComponent(serviceIdRaw);
  const name = encodeURIComponent(capabilityNameRaw);
  const input = jsonArg(args["input-json"] || args.input, "input-json is invalid");
  const payload = {
    intent: args.intent,
    userConfirmation: boolArg(args.confirm),
    requestId: args["request-id"],
    input,
    metadata: jsonArg(args.metadata, "metadata is invalid"),
  };
  const result = await requestJson(
    hubUrl(args),
    "POST",
    `/api/services/${serviceId}/capabilities/${name}/invoke`,
    payload,
  );
  return {
    ok: true,
    serviceId: serviceIdRaw,
    capability: capabilityNameRaw,
    invocation: result,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const command = args._[0];
  if (!command || command === "help" || args.help) {
    usage();
    return;
  }

  let result;
  if (command === "identity") {
    result = { ok: true, identity: publicIdentity(loadOrCreateIdentity(args["client-id"])) };
  } else if (command === "register") {
    result = await register(args);
  } else if (command === "search") {
    result = await searchServices(args);
  } else if (command === "get") {
    result = await getService(args);
  } else if (command === "capabilities") {
    result = await getCapabilities(args);
  } else if (command === "capability") {
    result = await getCapability(args);
  } else if (command === "invoke") {
    result = await invokeCapability(args);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
