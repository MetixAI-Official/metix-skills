---
name: metix-people-detail
description: Use when retrieving full public profile records from Metix for profile ids already obtained from a search. This is the charged, result-banded half of the two-step shape.
---

# Metix people detail

Turns ids into records. Charged per record returned.

Endpoints, limits, and costs: `references/api-reference.md`,
`references/credits.md`.

## The only route in

`POST /entity/v1/profiles/detail-by-id`

```bash
curl -X POST "https://mira-api.metix.ai/entity/v1/profiles/detail-by-id" \
  -H "Authorization: Bearer $METIX_KEY" \
  -H "Content-Type: application/json" \
  -d '{"profile_ids": ["enc_9f2c...", "enc_41ab..."]}'
```

1 to 100 ids per request. Ids come from `metix-people-search`.

There is no lookup by LinkedIn URL. When a user hands you a profile URL, run
`/v1/people/query` with `{"field": "linkedin_url", "eq": "<url>"}` to get the
id, then call detail with it. That is two charged calls rather than one, so say
so before doing it in bulk.

## What comes back

```json
{ "code": 200, "msg": "ok",
  "data": { "total": 2, "found": 2, "not_found": [], "results": [ { } ] } }
```

`found` is a **count**, not a list. The records are in `results`. Reading
`data.found` as an array is the most common mistake against this endpoint.
`total` is the requested id count after de-duplication, so sending the same id
twice does not get you two records or two charges.

Ids that matched nothing come back in `not_found`. A miss is not an error, so do
not retry it; retrying returns the same miss and wastes a round trip.

## Cost, and the mistake to avoid

**`ceil(found / 5)` Credits.** One through five found records cost 1; six
through ten cost 2. Ids in `not_found` cost nothing.

So batch. Sending five separate single-id requests costs 5 Credits for work that
costs 1 in one request. Collect the ids you need, then send them together, up to
100 per request.

## Batching a large set

Ids are permanently stable, so a large job does not have to complete in one
pass. Search once, keep the ids, then walk them in batches of 100 across as many
sessions as you need. Each batch settles against records actually found in
started bands of five. Nothing expires.

## Fields

Records carry public professional information: `full_name`,
`active_experience_title`, `address`, `experience`, `education`, `skills`,
`certifications`, `languages`, `patents`, `publications`, and similar. The
complete list of what a response may contain is in the public field reference
for the profile entity.

Personal contact fields are not part of a detail response and cannot be selected
into one. Email lookup is a separate capability and is not open yet.
