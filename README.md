# Metix skills

Agent skills for the [Metix](https://metix.ai) data API: professional profiles,
companies, and active job postings.

These skills exist so an agent stops guessing endpoint names. The release checks
pin the documented pricing formulas, the Boolean Query Spec vocabulary for all
three entities, and every installed reference copy to Mira's committed public
API contract.

## Install

```bash
npx skills add MetixAI-Official/metix-skills
```

GitHub is the single distribution point.

Then set your key:

```bash
export METIX_KEY="mira_xxxxxxxxxxxx"
```

Create one at [platform.metix.ai/api-keys](https://platform.metix.ai/api-keys).
The free plan starts with 100 Credits and needs no card.

The variable is `METIX_KEY`, which is what every skill here reads. The Metix
docs write the same key as `MIRA_KEY` in their curl examples, so if you have
followed those, export it under this name as well:

```bash
export METIX_KEY="$MIRA_KEY"
```

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

Search will not return employer, education, or contact fields however you phrase
the request. That is the endpoint's shape, not a limit on your query. Take the
ids and make a detail call.

Ids are encrypted and **permanently stable**. Store them and reuse them later; a
request that worked on day 1 works on day 100. There is no server-side session
and nothing expires. The Query Spec endpoints hand back a `next` cursor when
more pages exist, which you send as `after` to resume.

## The public surface

| Endpoint | Returns |
|---|---|
| `POST /v1/people-search` | `profile_ids` from natural language |
| `POST /v1/people/query` | `profile_ids` from a Query Spec tree |
| `POST /entity/v1/profiles/detail-by-id` | profile records |
| `POST /v1/jobs/query` | `job_ids` |
| `POST /entity/v1/jobs/detail-by-id` | job records |
| `POST /v1/companies/query` | `company_ids` |
| `POST /entity/v1/companies/detail-by-id` | company records |
| `GET /version` | deployed version |
| `GET /auth/key/status` | scopes, rate limit, remaining quota |

That is the whole list. A route you remember that is missing from it was
withdrawn and will 404.

## Credits

Successful work is charged; failures are not. Empty searches and detail misses
are free; AI people search retains its 5-Credit base charge even when it returns
no ids.

| Call | Cost |
|---|---|
| Query Spec search over people, companies, or jobs | `ceil(results / 25)` per page; empty results are free |
| AI people search | `5 + ceil(results / 25)`; successful empty results cost `5` |
| People, company, or job detail | `ceil(found / 5)`; not-found records are free |
| `/version`, `/auth/key/status` | free |

Charges scale in result bands, not as a flat per-call fee. Batching matters:
five found detail records cost `1` Credit in one request, while five
single-record requests cost `5`. Full rules: `references/credits.md`.

## Reference

- `references/api-reference.md`: endpoints, Query Spec fields, limits, errors
- `references/credits.md`: the charging rules in full

## MCP is configured separately

Installing these Skills does not install or register an MCP server. Skills are
local agent instructions; MCP is an independent client connection to the same
Metix API and uses the same key and Credit rules.

Streamable HTTP endpoint: `https://mira-api.metix.ai/mcp`; legacy SSE endpoint:
`https://mira-api.metix.ai/sse`. A client negotiates the protocol version with
the server and must send `Authorization: Bearer <Metix API key>`.

For example, a project-scoped Claude Code `.mcp.json` can keep the key as an
environment reference instead of writing its value into configuration:

```json
{
  "mcpServers": {
    "mira-api": {
      "type": "http",
      "url": "https://mira-api.metix.ai/mcp",
      "headers": { "Authorization": "Bearer ${METIX_KEY}" }
    }
  }
}
```

Client formats differ, so translate the same URL and header facts rather than
copying this JSON into another client. Read the running MCP schema before
calling a tool; tool names are not inferred from REST route names.

## Contributing

Run all three release checks before opening a pull request:

```bash
scripts/check-public-boundary.sh
node scripts/check-contracts.mjs ../mira-api/app/contracts/current/api-blueprint.json
scripts/check-install.sh
```

The boundary check rejects internal identifiers and withdrawn capabilities. The
contract check pins the endpoint prices, the Query Spec vocabulary for people,
jobs, and companies, which fields are text-matched rather than compared whole,
and all installed reference copies to Mira's committed contract. It fails when
that contract is not reachable, because a cross-repo check that quietly skips
proves only that the docs agree with themselves; pass `--no-blueprint` if you
genuinely mean to skip it. The install smoke proves a clean `npx skills add`
produces five self-contained Skills.
