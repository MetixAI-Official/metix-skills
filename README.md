# Metix AI skills

Agent skills for the [Metix AI](https://metix.ai) data API: professional profiles,
companies, and active job postings.

These files are a resource catalog and a few local rules (the key name, the
two-step flow, never print the key). They are not a second API manual. Field
names, operators, limits, and prices live on `GET /contract`. Worked examples,
salary rules, and the error catalog live on `GET /docs` and its pages; add `.md`
to any page for Markdown, for example `/docs/api/jobs.md`. Every API path here
is on `https://mira-api.metix.ai`. If a local copy and the live contract
disagree, the contract wins.

## Install

```bash
npx skills add MetixAI-Official/metix-skills
```

GitHub is the single distribution point.

### Coming from the OpenJobs skills

The earlier package, `OpenJobsAI/openjobs-openclaw-skills`, is retired. Its
skills stay loaded in any agent that installed them and describe an API surface
that has moved on, so an agent holding both will sometimes follow the older one.
Remove them first:

```bash
npx skills list                     # what this project has
npx skills list -g                  # what is installed globally

npx skills remove openjobs-people-search openjobs-company-search \
  openjobs-jobs-search openjobs-people-match \
  openjobs-ai-talent-search openjobs-platform-assistant
```

Add `-g` to work on the global scope. `npx skills remove` with no names opens an
interactive picker, which is easier if you are not sure what is present. Or hand
the agent this:

> List every skill you have installed. Remove the ones whose names start with
> `openjobs-`, check both the project and the global scope, then list what is
> left so I can confirm.

Your key does not change.

Then set it:

```bash
export METIX_KEY="metix_xxxxxxxxxxxx"
```

Create one at [platform.metix.ai/api-keys](https://platform.metix.ai/api-keys).
The free plan starts with 100 Credits and needs no card.

`METIX_KEY` is the only variable involved. The skills read it, the MCP server
reads it, and every example in the Metix AI docs reads it. If you followed an
older page that said `MIRA_KEY`, rename the variable and change nothing else.

A key issued before the rename begins with `mira_` rather than `metix_` and is
still valid: keys are matched on the whole value, not on the prefix, so there is
nothing to rotate.

Keep it out of source control and out of anything browser-visible.

## Skills

| Skill | Use it for |
|---|---|
| `metix-platform-assistant` | Choosing a capability and sequencing calls across areas. Start here. |
| `metix-people-search` | Finding profiles, and turning the ids into full records. |
| `metix-company-search` | Organization lists and company records. |
| `metix-job-search` | Active postings as a hiring-demand signal. |

Contact email lookup is coming soon. It has no callable route today, so nothing
here documents one.

## The shape to know

**Search returns ids. Detail returns records, and is a separate charged call.**

Call `GET /contract` first (or MCP `metix_get_contract`) and build `where` from
`querySpecByEntity`. The same docs pages are rendered for people at
`https://platform.metix.ai/docs`.

On a 4xx, switch on `error_code`; `msg` says what to change. `docs_url` points at
the page that explains the failure, and the same URL with `.md` added to the
path is its Markdown form.

An id never changes, so you can store it and read the record later with the
same detail call. A record can leave the index (a job posting closes, for
example), and its id then comes back in `not_found`. The Query Spec endpoints
hand back a `next` cursor when more pages exist; send it unchanged as `after`
to resume. A job record reaches its employer through `company_id`, which you
ask for in `_source` on the detail call.

Exact fields such as a person's `role` or `country` take `eq` or `in` with the
whole stored value, and refuse `match`; free-text fields take `match`. The
contract lists the operators for every field under `fieldOperators`.

## Credits

Successful work is charged; failures are not. Empty Query Spec searches and
detail misses are free; AI people search retains its 5-Credit base charge even
when it returns no ids. Charges scale in result bands, so batch. Full rules:
`https://mira-api.metix.ai/docs/credits.md`. A pointer copy sits in
`references/credits.md`.

## MCP is configured separately

Installing these Skills does not install or register an MCP server. Skills are
local agent instructions; MCP is an independent client connection to the same
Metix AI API and uses the same key and Credit rules.

Streamable HTTP endpoint: `https://mira-api.metix.ai/mcp`; legacy SSE endpoint:
`https://mira-api.metix.ai/sse`. A client negotiates the protocol version with
the server and must send `Authorization: Bearer <Metix AI API key>`.

For example, a project-scoped Claude Code `.mcp.json` can keep the key as an
environment reference instead of writing its value into configuration:

```json
{
  "mcpServers": {
    "metix": {
      "type": "http",
      "url": "https://mira-api.metix.ai/mcp",
      "headers": { "Authorization": "Bearer ${METIX_KEY}" }
    }
  }
}
```

Client formats differ, so translate the same URL and header facts rather than
copying this JSON into another client. The ten tools are listed at
`https://platform.metix.ai/docs/mcp#tools`, and `tools/list` returns them with
their input schemas. Call `metix_get_contract` first.

## Contributing

Run both release checks before opening a pull request:

```bash
node scripts/check-contracts.mjs ../mira-api/app/contracts/current/api-blueprint.json
scripts/check-install.sh
```

The contract check confirms each skill points at the production API and its docs
pages, that no published file names a host outside `metix.ai`, and that endpoint
prices in `contract-facts.json` still match the API's committed blueprint. It does
not pin a `contract_hash` and it does not require field tables in `SKILL.md`.
Pass `--no-blueprint` only if you genuinely mean to skip the price check. The
install smoke proves a clean `npx skills add` produces four pointer skills.
