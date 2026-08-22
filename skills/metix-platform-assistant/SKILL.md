---
name: metix-platform-assistant
description: Use when a task needs Metix AI data across more than one area (people, companies, or jobs) and you must decide which capability to call, in what order, and what it costs. Start here when the request is a goal rather than a single lookup.
---

# Metix AI platform assistant

Coordinates the other Metix AI skills. Use it to choose a route and sequence calls;
use the focused skills for the exact request shape of each capability.

Endpoints, limits, and Credit rules: `references/api-reference.md` and
`references/credits.md`. Those files are the source of truth. If this skill and
they disagree, they win.

## Three entities, one shape

Metix AI serves people, companies, and jobs. Each has a search that returns
encrypted ids and a detail endpoint that turns ids into records.

| The user is asking | Call |
|---|---|
| who are the people matching X | `/v1/people/query`, then profile detail |
| who are the people, but the constraints are tangled | `/v1/people-search`, then profile detail |
| which companies match X | `/v1/companies/query`, then company detail |
| what is being hired for right now | `/v1/jobs/query`, then job detail |
| tell me about this specific LinkedIn URL | `/v1/people/query` on `linkedin_url`, then profile detail |

`/v1/people/query`, `/v1/jobs/query`, and `/v1/companies/query` share one
grammar: a `where` tree of `all`, `any`, and `not`, with leaves carrying exactly
one of `eq`, `in`, `match`, `gte`, `lte`, or `exists`. Learn it once. Only
people have same-record scopes.

Contact email lookup is **coming soon** and has no callable route today. If a
user asks for an email address, say it is not available yet rather than
suggesting a workaround.

## The shape that governs every one of them

Search returns ids. Detail returns records and is charged separately in result
bands. Search will not return employer, education, or contact fields however you
phrase it.

Ids are encrypted and permanently stable, so search once, keep the ids, and pull
detail in batches as you need them. Nothing expires. The Query Spec endpoints
also return a `next` cursor when more pages exist; send it back as `after`, and
count each page as its own charged search.

## Sequencing across areas

Cross-area work chains on ids, not on names. To find senior engineers at
companies hiring for ML platform roles:

1. `/v1/jobs/query` for the active postings, which gives `job_ids`
2. job detail on a narrowed set, which gives `company_id` on each posting
3. company detail on those tokens directly, no company search needed
4. `/v1/people/query` filtered to those employers, which gives `profile_ids`
5. profile detail only on the shortlist

Step 5 is where the money is. Narrow before you spend.

## Cost model

- people, company, and job Query Spec search: `ceil(returned_ids / 25)`, zero
  results free
- AI people search: `5 + ceil(returned_ids / 25)`, including 5 for zero results
- people, company, and job detail: `ceil(found / 5)`, not-found records free
- `GET /version` and `GET /auth/key/status`: free

`size` is not intrinsically free: it determines the maximum preflight quota
reservation, while actual results determine the settled charge.

## Before a large job

`GET /auth/key/status` is free and reports remaining quota. Check it before a
run that will pull thousands of records, not after.

## What this API does not do

It retrieves data. It does not evaluate it.

There is no endpoint that scores or ranks a person against a role, or compares
candidates. If a task needs a judgement about fit, retrieve the records with the
capabilities above and reason over them yourself. Do not go looking for a
scoring route, and do not guess at a path.

The endpoint list in `references/api-reference.md` is the complete supported
public data surface for these Skills. Routes that used to exist are gone rather
than hidden, so a path you remember and cannot find in that file will 404. Do
not invent paths, do not probe for internal capabilities, and use the documented
public route instead.
