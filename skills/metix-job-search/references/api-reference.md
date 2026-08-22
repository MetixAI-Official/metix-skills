# Metix API reference

Base URL: `https://mira-api.metix.ai`
Auth: `Authorization: Bearer $METIX_KEY` on every call except `GET /version`.

Every response uses the same envelope:

```json
{ "code": 200, "msg": "ok", "data": { } }
```

`code` repeats the HTTP status. Errors carry `trace_id`; quote it when asking for
support.

## The two-step shape

This is the single thing worth learning first, because it is what most callers
get wrong.

**Search returns identifiers, not records. Detail returns records, and is a
separate charged call.**

```
search  ->  ["enc_9f2c...", "enc_41ab...", ...]     charged per 25 results
detail  ->  [{full record}, {full record}]           charged per 5 found
```

Search will never return a person's employer, education, or contact fields no
matter what you ask it for. If you need those, take the ids from the search and
make a detail call with them.

Charging uses result bands: search is `ceil(results / 25)` and detail is
`ceil(found / 5)`. Batch ids rather than looping; see `credits.md`.

## Identifiers are stable, and that is a contract

An id returned by search is encrypted and **permanently stable**. You may store
it and use it days or months later. A request that worked on day 1 works on day
100.

There is no server-side session and nothing expires between your calls. If you
have ids, you have everything you need to fetch those records again.

The Query Spec endpoints accept an optional `after` cursor: pass back the `next`
value from the previous response to resume where it stopped. `next` is omitted
rather than returned empty on the last page. The token carries the sort position
of the last hit and is not server state, so it does not expire either. There is
no point-in-time snapshot behind it, though, so a record indexed between two
pages can appear, move, or be missed.

This means the right pattern for a large job is: search once, keep the ids, then
pull detail in batches as you need them, rather than detailing every id the
moment the search returns.

## Endpoints

All are `POST` unless noted. This list is the complete public surface.

### Search: returns ids

| Endpoint | Returns | Notes |
|---|---|---|
| `/v1/people/query` | `profile_ids`, `total`, optional `next` | Boolean Query Spec. The structured route for people. |
| `/v1/people-search` | `profile_ids` | Natural language. Takes `text`. Use when the constraint set is awkward to express as fields. |
| `/v1/jobs/query` | `job_ids`, optional `next` | Boolean Query Spec over active postings. |
| `/v1/companies/query` | `company_ids`, optional `next` | Boolean Query Spec over organizations. |

`/v1/people/query` is the only search that returns `total`. It is an integer
below 10,000 and the string `"10000+"` at or above that band, so a caller that
assumes an integer breaks on large result sets.

Public keys default to `size: 1000` and cannot exceed 1000.

### Detail: returns records

| Endpoint | Takes | Notes |
|---|---|---|
| `/entity/v1/profiles/detail-by-id` | `profile_ids` | 1 to 100 per request. |
| `/entity/v1/companies/detail-by-id` | `company_ids` | 1 to 100 per request. |
| `/entity/v1/jobs/detail-by-id` | `job_ids` | 1 to 100 per request. |

Detail responses carry `total` (the requested id count after de-duplication),
`found` (a **count**, not a list), `not_found` (the ids that matched nothing),
and `results` (the records). Read the records from `results`:

```json
{ "code": 200, "msg": "ok",
  "data": { "total": 2, "found": 2, "not_found": [], "results": [ { } ] } }
```

Detail calls with `found: 0` are not charged. Empty searches are also free; AI
people search is the exception and retains its 5-Credit base charge.

A job document carries `company_id`. That value is a company token, so it goes
straight to `/entity/v1/companies/detail-by-id`, so you do not have to search
for the employer by name.

## Query Spec

`/v1/people/query`, `/v1/jobs/query`, and `/v1/companies/query` all take the
same body: a required `where` tree, plus optional `size` and `after`.

The grammar is shared. The field vocabulary is not, so each entity has its own
list below and a name that works on people may not exist on the others: people
and jobs have `country`, companies call it `hq_country`. Both examples in this
section are people queries.

```json
{
  "where": {
    "all": [
      {"field": "country", "eq": "United States"},
      {"field": "skills", "match": "kubernetes"}
    ]
  },
  "size": 25
}
```

A leaf is `{"field": "<name>", "<operator>": <value>}` and carries **exactly one
operator**. A bounded range is therefore an `all` of two leaves, not `gte` and
`lte` in one node:

```json
{"all": [
  {"field": "experience_months", "gte": 60},
  {"field": "experience_months", "lte": 180}
]}
```

Composers: `all`, `any`, `not`; each composer takes a non-empty array.
Operators: `eq`, `exists`, `gte`, `in`, `lte`, `match`.

`eq`, `in`, and `match` all compare a value, but **the operator does not decide
how the comparison is made. The field does.** A text field is always matched as
text, where every word in your value must appear. An exact field always compares
the whole stored value. Writing `eq` on a text field does not make it exact, and
writing `match` on an exact field does not make it fuzzy; each field is listed
below under the behaviour it actually has. `in` applies that same comparison
across a list and succeeds on any member. `exists` takes a boolean. Numeric and
date fields take `gte`, `lte`, or `exists` instead, and reject the other three.

Date fields take `YYYY-MM-DD` or a relative form: `now`, `now-30d`, `now-6m`,
`now-2y`. The maximum offsets are `7300d`, `240m`, and `20y`. Relative values
resolve server-side to an absolute date before the query is built.

Unknown or unpublished field names, unknown operators, and malformed nodes all
fail through one generic validation outlet, so a field that does not exist and a
field that exists but is not published are deliberately indistinguishable.

### People query fields

`POST /v1/people/query`

Text fields: `active_department`, `active_title`, `awards`, `certifications`,
`company_name`, `courses`, `headline`, `institution_name`, `languages`, `major`,
`patents`, `publications`, `skills`, `title`.

Exact fields: `city`, `company_type`, `country`, `country_iso2`,
`country_iso3`, `first_name`, `full_name`, `industry`, `is_current`,
`is_decision_maker`, `is_studying`, `is_working`, `last_name`, `level`,
`linkedin_url`, `management_level`, `regions`, `role`, `state`,
`workplace_city`, `workplace_country`, `workplace_state`.

Numeric fields: `company_employees_count`, `company_size_range`,
`degree_level`, `duration_months`, `experience_months`, `graduation_year`,
`institution_ranking`, `study_start_year`.

Date fields: `ended_at`, `started_at`.

People are the only entity with same-record scopes. A profile holds many jobs
and many degrees, and every condition inside one scope must match the *same*
record: "one job that is both Google and director" rather than "some job at
Google, and some job as director". Scopes: `has_education`, `has_experience`,
`has_language`.

- `has_education` fields: `degree_level`, `graduation_year`,
  `institution_name`, `institution_ranking`, `is_studying`, `major`,
  `study_start_year`.
- `has_experience` fields: `company_employees_count`, `company_name`,
  `company_size_range`, `company_type`, `duration_months`, `ended_at`,
  `industry`, `is_current`, `level`, `role`, `started_at`, `title`,
  `workplace_city`, `workplace_country`, `workplace_state`.
- `has_language` fields: `languages`.

```json
{
  "where": {
    "all": [
      {"field": "country", "eq": "United States"},
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

A scoped field may also be used on its own outside a scope, where it means "any
record on this profile". Combined same-record conditions belong inside the
matching scope.

Suffixed names such as `experience_months_min`, `experience_months_max`,
`degree_level_min`, and `institution_ranking_max` are not Query field names. Use
the unsuffixed numeric field with `gte` or `lte`.

### Job query fields

`POST /v1/jobs/query`

Job text fields: `city`, `company_name`, `country`, `description`,
`employment_type`, `functions`, `industries`, `location`, `regions`,
`salary_currency`, `seniority`, `state`, `title`.

Job exact fields: `application_active`, `country_iso_2`.

Job numeric fields: `applicants_count`, `required_months_of_experience`,
`salary_max`, `salary_min`.

Job date fields: `created_at`, `posted`, `updated_at`.

`country` is a text field on jobs and an exact field on people, so the same
value can behave differently across the two. `country_iso_2` is the two-letter
ISO 3166-1 code, such as `US`, and is exact; note the underscore before the `2`,
because people spell it `country_iso2`. There are no scopes on jobs.

### Company query fields

`POST /v1/companies/query`

Company text fields: `categories_and_keywords`, `hq_city`, `hq_country`,
`hq_country_iso2`, `hq_full_address`, `hq_regions`, `hq_state`, `industry`,
`linkedin_url`, `name`, `stock_exchange`, `stock_ticker`, `website`.

Company exact fields: `is_b2b`, `size_range`, `type`.

Company numeric fields: `employees_count`,
`employees_count_change_yearly_percentage`, `followers_count`, `founded_year`,
`last_funding_round_amount_raised`.

Company date fields: `last_funding_round_date`, `last_updated_at`.

`size_range` is an enumeration and takes one of these strings exactly, so
`"51-200"` is rejected and `"51-200 employees"` is accepted:

```
1-10 employees        201-500 employees      5001-10,000 employees
11-50 employees       501-1000 employees     10,001+ employees
51-200 employees      1001-5000 employees    Myself Only
```

There are no scopes on companies.

## Contact: coming soon

Personal and work email lookup is not open. There is no public route to call and
no price to quote for it yet. Do not build a contact step into a workflow and do
not tell a user that Metix will return an email address today.

Personal contact fields are not part of a detail response either, and cannot be
selected into one.

## System: free

| Endpoint | Notes |
|---|---|
| `GET /version` | No auth. Returns `version` and `build_sha`. |
| `GET /auth/key/status` | Your key's scopes, rate limit, and remaining quota. |

## Errors

| Status | Meaning |
|---|---|
| 400 | Invalid request. Commonly "At least one search condition is required". |
| 401 | Missing or invalid `Authorization` header. |
| 402 | Quota exhausted. |
| 403 | Key disabled, expired, or lacking scope. |
| 404 | No such route. |
| 422 | Body failed schema validation; `data.errors` names the field. |
| 429 | Rate limit exceeded. |
| 500 | Internal error. Body is a fixed string; use `trace_id`. |

A 4xx is never charged. Retry 429 and 5xx with backoff; do not retry 4xx without
changing the request.
