#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultBlueprintPath = path.join(repoRoot, "../mira-api/app/contracts/current/api-blueprint.json");
const args = process.argv.slice(2);
// A skipped cross-repo check used to print OK, so the argument-less form a
// contributor naturally types proved only that the docs agree with
// contract-facts.json, not that either agrees with the running API. The skip is
// now something you ask for.
const blueprintOptional = args.includes("--no-blueprint");
const blueprintPath = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? defaultBlueprintPath);
const blueprintRequired = !blueprintOptional;
const facts = JSON.parse(fs.readFileSync(path.join(scriptDir, "contract-facts.json"), "utf8"));
const errors = [];

const EXPECTED_SKILL_COUNT = Object.keys(facts.skills).length;

function fail(message) {
  errors.push(message);
}

// `match` and `eq` are not what decides how a value is compared: a field is
// either text-matched or compared whole, whatever operator you write. That fact
// is per field and appears only in the generated field reference, not in the
// blueprint JSON, so it is parsed from the table there.
function parseFieldBehaviour(referencePath) {
  const text = fs.readFileSync(referencePath, "utf8");
  const heading = { People: "profile", Jobs: "job", Companies: "company" };
  const result = {};
  let current = null;
  for (const line of text.split("\n")) {
    const headingMatch = /^## (People|Jobs|Companies)$/.exec(line);
    if (headingMatch) {
      current = heading[headingMatch[1]];
      result[current] = { textFields: [], exactFields: [] };
      continue;
    }
    if (!current || !line.startsWith("| `")) continue;
    const row = /^\| `([^`]+)` \| (.+?)(?: — .*)? \|$/.exec(line);
    if (!row) continue;
    const operators = [...row[2].matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
    if (operators.includes("gte")) continue; // numeric and date fields
    result[current][operators.includes("match") ? "textFields" : "exactFields"].push(row[1]);
  }
  for (const entity of Object.values(result)) {
    entity.textFields.sort();
    entity.exactFields.sort();
  }
  return result;
}

let checkedBlueprint = false;
if (fs.existsSync(blueprintPath)) {
  checkedBlueprint = true;
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf8"));
  if (blueprint.apiVersion !== facts.apiVersion) {
    fail(`apiVersion is ${JSON.stringify(blueprint.apiVersion)}, expected ${JSON.stringify(facts.apiVersion)}`);
  }
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
      if (endpoint.quota?.[key] !== expected[key]) {
        fail(`${endpointPath}: ${key} is ${JSON.stringify(endpoint.quota?.[key])}, expected ${JSON.stringify(expected[key])}`);
      }
    }
    if (expected.priceVersion !== false && endpoint.quota?.priceVersion !== facts.priceVersion) {
      fail(`${endpointPath}: priceVersion is ${JSON.stringify(endpoint.quota?.priceVersion)}, expected ${JSON.stringify(facts.priceVersion)}`);
    }
  }

  // The public surface is closed. An endpoint the blueprint still carries but
  // this repository does not document is either withdrawn or not yet open, and
  // in both cases a Skill must not name it, so the boundary check owns that.
  // What is checked here is the other direction: everything documented exists.
  for (const key of ["fields", "numericFields", "dateFields", "fieldOperators", "scopeFields", "scopes", "operators", "composers"]) {
    if (JSON.stringify(blueprint.querySpec?.[key]) !== JSON.stringify(facts.queryVocabulary[key])) {
      fail(`people query contract ${key} does not match contract facts`);
    }
  }
  for (const [entity, expected] of Object.entries(facts.entityVocabulary)) {
    for (const key of ["fields", "numericFields", "dateFields"]) {
      if (JSON.stringify(blueprint.querySpecByEntity?.[entity]?.[key]) !== JSON.stringify(expected[key])) {
        fail(`${entity} query contract ${key} does not match contract facts`);
      }
    }
  }

  const fieldReferencePath = path.join(path.dirname(blueprintPath), "public-field-reference.md");
  if (fs.existsSync(fieldReferencePath)) {
    const behaviour = parseFieldBehaviour(fieldReferencePath);
    const pinned = { profile: facts.queryVocabulary, ...facts.entityVocabulary };
    for (const [entity, expected] of Object.entries(pinned)) {
      for (const key of ["textFields", "exactFields"]) {
        if (JSON.stringify(behaviour[entity]?.[key]) !== JSON.stringify(expected[key])) {
          fail(`${entity} ${key} do not match the published field reference`);
        }
      }
    }
  } else {
    fail(`field reference not found next to the blueprint: ${fieldReferencePath}`);
  }
} else if (blueprintRequired) {
  fail(`explicit blueprint not found: ${blueprintPath}`);
}

const inlineList = (values) => values.map((value) => `\`${value}\``).join(", ");
// A missing anchor must fail loudly. Dropping the opening one yields an empty
// slice, which every later check catches; dropping the closing one would widen
// the slice to the end of the file and let a field found in some *other*
// section satisfy this one, which nothing catches. So both are asserted here.
function section(label, document, from, to) {
  let ok = true;
  for (const anchor of [from, to]) {
    if (!document.includes(anchor)) {
      fail(`${label}: section anchor not found: ${anchor}`);
      ok = false;
    }
  }
  return ok ? document.split(from)[1].split(to)[0] : "";
}

function fieldGroups(vocabulary, label) {
  const prefix = label ? `${label} ` : "";
  const name = (word) => (label ? word : word[0].toUpperCase() + word.slice(1));
  return [
    ["text", vocabulary.textFields],
    ["exact", vocabulary.exactFields],
    ["numeric", vocabulary.numericFields],
    ["date", vocabulary.dateFields],
  ].map(([word, fields]) => `${prefix}${name(word)} fields: ${inlineList(fields)}.`);
}

function requireGroups(label, document, groups) {
  const normalized = document.replace(/\s+/g, " ");
  for (const group of groups) {
    if (!normalized.includes(group)) fail(`${label}: query group mismatch: ${group}`);
  }
}

const apiReference = fs.readFileSync(path.join(repoRoot, "references/api-reference.md"), "utf8");
const peopleSearchSkill = fs.readFileSync(path.join(repoRoot, "skills/metix-people-search/SKILL.md"), "utf8");
const jobSearchSkill = fs.readFileSync(path.join(repoRoot, "skills/metix-job-search/SKILL.md"), "utf8");
const companySearchSkill = fs.readFileSync(path.join(repoRoot, "skills/metix-company-search/SKILL.md"), "utf8");

const peopleGroups = [
  ...fieldGroups(facts.queryVocabulary, ""),
  ...Object.entries(facts.queryVocabulary.scopeFields).map(
    ([scope, fields]) => `\`${scope}\` fields: ${inlineList(fields)}.`,
  ),
];

const peopleDocuments = [
  ["canonical people Query reference", section("canonical people Query reference", apiReference, "## Query Spec", "### Job query fields")],
  ["people-search Query section", section("people-search Query section", peopleSearchSkill, "## Boolean Query Spec", "## What comes back")],
];
for (const [label, document] of peopleDocuments) {
  for (const value of [
    ...facts.queryVocabulary.fields,
    ...facts.queryVocabulary.scopes,
    ...facts.queryVocabulary.operators,
    ...facts.queryVocabulary.composers,
    ...Object.values(facts.queryVocabulary.scopeFields).flat(),
    ...facts.queryVocabulary.invalidFlatNames,
  ]) {
    if (!document.includes(value)) fail(`${label}: query vocabulary fact missing: ${value}`);
  }
  requireGroups(label, document, peopleGroups);
}

const entityDocuments = {
  job: [
    ["canonical job Query reference", section("canonical job Query reference", apiReference, "### Job query fields", "### Company query fields")],
    ["job-search Query section", section("job-search Query section", jobSearchSkill, "## Job query fields", "## Detail")],
  ],
  company: [
    ["canonical company Query reference", section("canonical company Query reference", apiReference, "### Company query fields", "## Contact")],
    ["company-search Query section", section("company-search Query section", companySearchSkill, "## Company query fields", "## Detail")],
  ],
};
for (const [entity, documents] of Object.entries(entityDocuments)) {
  const vocabulary = facts.entityVocabulary[entity];
  const groups = fieldGroups(vocabulary, vocabulary.label);
  for (const [label, document] of documents) {
    for (const field of vocabulary.fields) {
      if (!document.includes(field)) fail(`${label}: query vocabulary fact missing: ${field}`);
    }
    requireGroups(label, document, groups);
  }
}

// The single most expensive misreading of this grammar is that `eq` means exact
// and `match` means fuzzy. Both are wrong, and a doc that teaches the operators
// without saying so teaches the misreading.
for (const [label, document] of [
  ["canonical reference", apiReference],
  ["metix-people-search", peopleSearchSkill],
  ["metix-job-search", jobSearchSkill],
  ["metix-company-search", companySearchSkill],
]) {
  if (!document.replace(/\s+/g, " ").includes("does not decide how")) {
    fail(`${label}: missing the warning that the field, not the operator, decides how a value is compared`);
  }
}

const skillDirs = fs.readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(repoRoot, "skills", entry.name));

if (skillDirs.length !== EXPECTED_SKILL_COUNT) {
  fail(`expected ${EXPECTED_SKILL_COUNT} skills, found ${skillDirs.length}`);
}
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
  for (const reference of ["api-reference.md", "credits.md"]) {
    const relative = `references/${reference}`;
    if (!skill.includes(relative)) fail(`${skillName}: SKILL.md does not reference ${relative}`);
    const installedReference = path.join(skillDir, relative);
    const canonicalReference = path.join(repoRoot, "references", reference);
    if (!fs.existsSync(installedReference)) {
      fail(`${skillName}: missing ${relative}`);
    } else if (!fs.readFileSync(installedReference).equals(fs.readFileSync(canonicalReference))) {
      fail(`${skillName}: ${relative} differs from canonical references/${reference}`);
    }
  }
}

const docs = [
  fs.readFileSync(path.join(repoRoot, "README.md"), "utf8"),
  fs.readFileSync(path.join(repoRoot, "references/credits.md"), "utf8"),
  ...skillDirs.flatMap((dir) => [
    fs.readFileSync(path.join(dir, "references/credits.md"), "utf8"),
  ]),
].join("\n");
for (const needle of [
  "ceil(results / 25)",
  "5 + ceil",
  "ceil(found / 5)",
  "coming soon",
]) {
  if (!docs.toLowerCase().includes(needle.toLowerCase())) fail(`documentation fact missing: ${needle}`);
}

if (errors.length) {
  console.error("Contract check failed:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
const crossRepo = checkedBlueprint
  ? `; cross-repo contract matches ${path.basename(blueprintPath)}`
  : "; cross-repo contract SKIPPED by --no-blueprint, so nothing here was checked against the running API";
console.log(`OK — ${skillDirs.length} self-contained skills match ${facts.priceVersion}${crossRepo}.`);
