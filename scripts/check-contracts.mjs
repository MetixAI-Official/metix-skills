#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultBlueprintPath = path.join(repoRoot, "../mira-api/app/contracts/current/api-blueprint.json");
const args = process.argv.slice(2);
const blueprintOptional = args.includes("--no-blueprint");
const blueprintPath = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? defaultBlueprintPath);
const blueprintRequired = !blueprintOptional;
const facts = JSON.parse(fs.readFileSync(path.join(scriptDir, "contract-facts.json"), "utf8"));
const errors = [];

const EXPECTED_SKILL_COUNT = Object.keys(facts.skills).length;

function fail(message) {
  errors.push(message);
}

let checkedBlueprint = false;
if (fs.existsSync(blueprintPath)) {
  checkedBlueprint = true;
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf8"));
  const byPath = new Map(blueprint.endpoints.map((endpoint) => [endpoint.path, endpoint]));
  for (const [endpointPath, expected] of Object.entries(facts.endpoints)) {
    const endpoint = byPath.get(endpointPath);
    if (!endpoint) {
      fail(`${endpointPath}: missing from blueprint`);
      continue;
    }
    if (expected.formula && endpoint.quota?.dynamicCost?.formula !== expected.formula) {
      fail(`${endpointPath}: formula is ${JSON.stringify(endpoint.quota?.dynamicCost?.formula)}, expected ${JSON.stringify(expected.formula)}`);
    }
    for (const key of ["chargeOn", "resultPath"]) {
      if (expected[key] !== undefined && endpoint.quota?.[key] !== expected[key]) {
        fail(`${endpointPath}: ${key} is ${JSON.stringify(endpoint.quota?.[key])}, expected ${JSON.stringify(expected[key])}`);
      }
    }
    if (expected.priceVersion !== false && endpoint.quota?.priceVersion !== facts.priceVersion) {
      fail(`${endpointPath}: priceVersion is ${JSON.stringify(endpoint.quota?.priceVersion)}, expected ${JSON.stringify(facts.priceVersion)}`);
    }
  }
} else if (blueprintRequired) {
  fail(`explicit blueprint not found: ${blueprintPath}`);
}

const skillDirs = fs.readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(repoRoot, "skills", entry.name));

if (skillDirs.length !== EXPECTED_SKILL_COUNT) {
  fail(`expected ${EXPECTED_SKILL_COUNT} skills, found ${skillDirs.length}`);
}

const POINTER_NEEDLES = [
  "https://mira-api.metix.ai",
  "/version",
  "/contract",
  "GET /docs",
  "/mcp",
  "/docs/api/jobs.md",
  "/docs/api/people.md",
  "/docs/api/companies.md",
  "/docs/api/query-spec.md",
  "/docs/reference/errors.md",
  "/docs/credits.md",
  "https://platform.metix.ai/llms.txt",
  "error_code",
  "docs_url",
  "the contract wins",
  "Never print the key",
  "Do not invent a contact-email route",
];

for (const skillDir of skillDirs) {
  const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  const skillName = path.basename(skillDir);
  const requiredFacts = facts.skills[skillName];
  if (!requiredFacts) {
    fail(`${skillName}: missing direct Skill contract facts`);
  } else {
    for (const fact of requiredFacts) {
      if (!skill.includes(fact)) fail(`${skillName}: direct Skill fact missing: ${fact}`);
    }
  }
  for (const needle of POINTER_NEEDLES) {
    if (!skill.includes(needle)) fail(`${skillName}: pointer fact missing: ${needle}`);
  }
  if (/\bcreated_at\b/.test(skill) && skillName === "metix-job-search") {
    fail(`${skillName}: still names job created_at; recency lives on posted in the live contract`);
  }
  if (skillName === "metix-job-search" && !skill.includes("_source")) {
    fail(`${skillName}: must say company_id is requested through _source; the default detail record does not carry it`);
  }
}

// A public package names only public production hosts. A staging host or a
// machine-local address in any published file is a leak, so this fails on every
// host outside the allowlist instead of on a list of known bad ones.
const ALLOWED_HOSTS = new Set(["metix.ai", "mira-api.metix.ai", "platform.metix.ai"]);
const publishedFiles = [
  path.join(repoRoot, "README.md"),
  ...fs.readdirSync(path.join(repoRoot, "references")).map((name) => path.join(repoRoot, "references", name)),
  ...skillDirs.map((skillDir) => path.join(skillDir, "SKILL.md")),
];
for (const file of publishedFiles) {
  const text = fs.readFileSync(file, "utf8");
  const relative = path.relative(repoRoot, file);
  for (const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:ai|com|dev|io|net|org|app|cloud)\b/gi)) {
    const host = match[0].toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) fail(`${relative}: names ${host}, which is not a public production host`);
  }
  if (/\blocalhost\b|\b127\.0\.0\.1\b/.test(text)) fail(`${relative}: names a machine-local address`);
}

if (errors.length) {
  console.error("Contract check failed:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
const crossRepo = checkedBlueprint
  ? `; endpoint prices match ${path.basename(blueprintPath)}`
  : "; blueprint SKIPPED by --no-blueprint, so prices were not checked against the running API";
console.log(`OK — ${skillDirs.length} pointer skills match ${facts.priceVersion}${crossRepo}.`);
