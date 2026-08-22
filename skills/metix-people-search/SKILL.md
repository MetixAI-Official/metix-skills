---
name: metix-people-search
description: Use when finding professional profiles on Metix by role, skills, employer, education, location, or seniority, when a profile search needs natural language, and when retrieving the full profile records behind the ids.
---

# Metix people search

Two routes to the same result: `profile_ids`. Prefer the structured Query Spec
route; reach for natural language only when the constraints resist being written
as fields.

Endpoints, limits, and costs: `references/api-reference.md`,
`references/credits.md`.

## Structured search, the default

`POST /v1/people/query` takes a required `where` tree plus optional `size` and
`after`.

```bash
curl -X POST "https://mira-api.metix.ai/v1/people/query" \
  -H "Authorization: Bearer $METIX_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {"all": [
      {"field": "active_title", "match": "machine learning engineer"},
      {"field": "city", "eq": "San Francisco"}
    ]},
    "size": 25
  }'
```

It costs `ceil(profile_ids.length / 25)` and its successful empty result is
free. The server reserves against the resolved size before searching, then
settles against actual returned ids, so choose a window your available quota can
cover. `size` defaults to 1000 and cannot exceed 1000 for a public key.

## Natural language, when structure is awkward

`POST /v1/people-search` takes a single `text` field instead of a `where` tree.
The field is `text`, **not** `query`:

```bash
-d '{"text": "senior backend engineers who moved from fintech to healthcare in the last two years", "size": 1000}'
```

AI search costs `5 + ceil(profile_ids.length / 25)`; a successful empty result
still costs its 5-Credit base. Structured search shows you exactly what you
filtered on, which is why it is the default.

## Boolean Query Spec

The tree is built from composers and leaves. A leaf is
`{"field": "<name>", "<operator>": <value>}` and carries **exactly one
operator**, so a bounded range is an `all` of two leaves:

```json
{
  "where": {
    "all": [
      {"field": "country", "eq": "United States"},
      {"all": [
        {"field": "experience_months", "gte": 60},
        {"field": "experience_months", "lte": 180}
      ]},
      {"has_experience": {"all": [
        {"field": "company_name", "match": "Google"},
        {"field": "level", "eq": "director"},
        {"field": "is_current", "eq": true}
      ]}},
      {"not": [{"field": "skills", "eq": "php"}]}
    ]
  },
  "size": 100
}
```

Composers are `all`, `any`, `not`; each composer takes a non-empty array.
Operators are `eq`, `exists`, `gte`, `in`, `lte`, `match`.

The trap here is that **the operator does not decide how a value is compared.
The field does.** A text field is always matched as text, where every word in
your value must appear; an exact field always compares the whole stored value.
`{"field": "active_title", "eq": "machine learning engineer"}` is not an exact
title match, because `active_title` is a text field, and
`{"field": "country", "match": "United States"}` is not fuzzy, because `country`
is exact. Use the lists below to know which you are getting. `in` applies the
same comparison across a list and succeeds on any member, `exists` takes a
boolean, and numeric and date fields take `gte`, `lte`, or `exists` instead.

Date fields take `YYYY-MM-DD` or a relative form such as `now-30d`, `now-6m`, or
`now-2y`, capped at `7300d`, `240m`, and `20y`. "Left a job in the past year" is
`{"has_experience": {"all": [{"field": "ended_at", "gte": "now-1y"}]}}`.

The exact Query fields are:

- Text fields: `active_department`, `active_title`, `awards`, `certifications`,
  `company_name`, `courses`, `headline`, `institution_name`, `languages`,
  `major`, `patents`, `publications`, `skills`, `title`.
- Exact fields: `city`, `company_type`, `country`, `country_iso2`,
  `country_iso3`, `first_name`, `full_name`, `industry`, `is_current`,
  `is_decision_maker`, `is_studying`, `is_working`, `last_name`, `level`,
  `linkedin_url`, `management_level`, `regions`, `role`, `state`,
  `workplace_city`, `workplace_country`, `workplace_state`.
- Numeric fields: `company_employees_count`, `company_size_range`,
  `degree_level`, `duration_months`, `experience_months`, `graduation_year`,
  `institution_ranking`, `study_start_year`.
- Date fields: `ended_at`, `started_at`.

Scopes are `has_education`, `has_experience`, `has_language`, and they are the
reason to use this endpoint. A scope makes every nested condition match the same
education, experience, or language record, which is the difference between "one
job that is both Google and director" and "some job at Google, and some job as
director".

- `has_education` fields: `degree_level`, `graduation_year`,
  `institution_name`, `institution_ranking`, `is_studying`, `major`,
  `study_start_year`.
- `has_experience` fields: `company_employees_count`, `company_name`,
  `company_size_range`, `company_type`, `duration_months`, `ended_at`,
  `industry`, `is_current`, `level`, `role`, `started_at`, `title`,
  `workplace_city`, `workplace_country`, `workplace_state`.
- `has_language` fields: `languages`.

A scoped field used on its own outside a scope means "any record on this
profile". Suffixed names `experience_months_min`, `experience_months_max`,
`degree_level_min`, and `institution_ranking_max` are not Query field names; use
the unsuffixed numeric field with `gte` or `lte`. Unknown or unpublished fields
are rejected through one generic validation outlet, so a rejection does not tell
you whether the field exists. The self-contained `references/api-reference.md`
carries the same complete vocabulary and scope rules.

## What comes back

```json
{ "code": 200, "msg": "ok",
  "data": { "profile_ids": ["enc_9f2c...", "enc_41ab..."], "total": 4821 } }
```

Ids only. No names, no employers, no contact fields. That is not a limitation
of your query, it is the shape of the endpoint. Pass these ids to the detail
route below.

`total` is an integer below 10,000 and the string `"10000+"` at or above that
band, so do not do arithmetic on it without checking the type first.

A `next` value appears when more pages exist and is omitted on the last one.
Send it back as `after` to resume. Each page is charged as its own search.

Store the ids if the work continues later. They are encrypted, permanently
stable, and carry no expiry.

## Reading an empty result

Zero Query results means zero matches and costs nothing. Zero AI results still
cost the 5-Credit base. Widen one condition at a time rather than dropping them
all, so you learn which constraint was doing the excluding.

Before concluding a search is genuinely empty, check your field names against
the lists above, and check which list a field is in. An exact field given a
value that does not match the stored one whole returns nothing and reports no
error, which looks exactly like a genuine zero.

## Detail: turning ids into records

`POST /entity/v1/profiles/detail-by-id`

```bash
curl -X POST "https://mira-api.metix.ai/entity/v1/profiles/detail-by-id" \
  -H "Authorization: Bearer $METIX_KEY" \
  -H "Content-Type: application/json" \
  -d '{"profile_ids": ["enc_9f2c...", "enc_41ab..."]}'
```

1 to 100 ids per request. Ids come from the search above.

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
