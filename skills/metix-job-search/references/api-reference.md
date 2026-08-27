# Metix AI API reference

Base URL: `https://mira-api.metix.ai`
Auth: `Authorization: Bearer $METIX_KEY` on every call except `GET /version`.
`METIX_KEY` is the only variable to read; if it is unset, stop and say so
rather than reaching for another one. Keys issued today begin with `metix_`,
and older ones begin with `mira_` and remain valid.

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
| `/v1/jobs/query` | `job_ids`, `total`, optional `next` | Boolean Query Spec over active postings. |
| `/v1/companies/query` | `company_ids`, `total`, optional `next` | Boolean Query Spec over organizations. |

Every Query Spec search returns `total`. It is an integer below 100,000 and the
string `"100000+"` at or above that band, so a caller that assumes an integer
breaks on large result sets. The natural-language route returns ids only.

`total` counts what matched, not what came back. A search with `size: 25` over
four thousand matches answers `"total": 4000` and hands you 25 ids: page with
`after` to reach the rest, and read `total` to decide whether the filter is
narrow enough to be worth paging at all.

Omitting `size` returns 100. The maximum is 10,000, and every result costs
Credits at the published rate, so a wide `size` is a wide bill: ask for the
page you intend to read.

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

#### Choosing which fields come back

Every detail route takes an optional `_source`: an array of field names. Omit it
and you get the default record. Name fields and you get exactly those, which is
how you make a response smaller, and it is also the only way to reach the fields
that are publishable but not in the default set.

```json
{"profile_ids": ["..."], "_source": ["profile_id", "full_name", "summary", "github_url"]}
```

`languages` is worth naming explicitly the first time you filter on it, because
the values are stored as each profile writes them:

```json
{"profile_ids": ["..."], "_source": ["profile_id", "full_name", "languages"]}
```

```json
{"languages": [{"language": "English", "order_in_profile": 1},
               {"language": "Spanish", "order_in_profile": 2}]}
```

The same language appears as `English` on one record and `Inglés` on another,
and `Mandarin`, `Cantonese` and `Chinese` are three values rather than one. Read
a few records before building a `has_language` filter, then pass the spellings
you saw with `in`. A filter on one spelling returns a real but partial set, and
nothing in the response says so.

A profile record carries more than the default response shows. The rest is
reached by naming it, and the larger groups are:

- the subject's own links: `github_url`, `twitter_url`, `facebook_url`,
  `crunchbase_url`, `website`
- their own prose: `summary`, `headline`, `experience.description`,
  `education.description`
- their employer as a company: `experience.company_id`,
  `experience.company_website`, `experience.company_linkedin_url`,
  `experience.company_employees_count`, `experience.company_is_b2b`,
  `experience.company_categories_and_keywords`
- their institution: `education.institution_url`, `education.institution_rank`,
  `education.institution_country_iso2`
- counts and totals: `connections_count`, `followers_count`,
  `total_experience_duration_months`, `last_graduation_date`,
  `education_degrees`
- the current job, denormalised: `active_experience_department`,
  `active_experience_management_level`

`experience.company_id` is a **company** identifier. Send it to
`/entity/v1/companies/detail-by-id`, not to the profile route, and do not expect
it to look like a `profile_id`. It is a token of the same shape as every other
id here, so the only thing telling you which route it belongs to is its name.

The field list below is the field list. A name that is not on it is refused with
a 400, so a typo is visible rather than silently returning a record without it.

Prose fields carry no email addresses or phone numbers. Contact data is a
separate surface with its own pricing; it is not part of a summary.

A job document carries `company_id`, and a profile carries one on each
`experience` entry. Both are company tokens: send them to
`/entity/v1/companies/detail-by-id` and you reach the employer without searching
for it by name.

**Name them in `_source`.** Neither is in the default record, so a detail call
that does not ask for the field comes back without it — which reads as "this job
has no company" rather than as "you did not ask":

```json
{"job_ids": ["..."], "_source": ["id", "title", "company_name", "company_id"]}
```

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

Composers: `all`, `any`, `not`. `all` and `any` take a non-empty array of
conditions; `not` takes one condition, or an array, and negates all of it.
Operators: `eq`, `exists`, `gte`, `in`, `lte`, `match`.

`eq`, `in`, and `match` all compare a value, but **the operator does not decide
how the comparison is made. The field does.** A text field is always matched as
text, where every word in your value must appear. An exact field always compares
the whole stored value. Writing `eq` on a text field does not make it exact, and
writing `match` on an exact field does not make it fuzzy; each field is listed
below under the behaviour it actually has. `in` applies that same comparison
across a list and succeeds on any member. `exists` takes a boolean. Numeric and
date fields take `gte`, `lte`, or `exists` instead, and reject the other three.

**Exact fields are case-sensitive.** The comparison is against the whole stored
value, character for character, so `"director"` matches nothing where
`"Director"` matches. This is the one mistake in the whole grammar that does not
raise an error: the query is valid, it simply matches no records, and a result of
zero reads as "nobody like that exists" rather than "wrong case". Copy the
casing from the controlled values below.

`language_proficiency` is the exception, and the only one: capitalisation is not
part of its comparison, so `native or bilingual proficiency` and
`Native or bilingual proficiency` reach the same records. Its five values are
listed under the scopes below.

Text fields are not case-sensitive, so `active_department` accepts
`"human resources"`. The value still has to be one of the listed ones.

#### Controlled values

Eight fields draw from a fixed list. Anything outside the list matches nothing,
and matching is exact including case, so copy these rather than retyping them.
Several values contain commas — `Oil, Gas, and Mining` is one value, not three —
which is why they are listed one per line rather than run together.

Every set below was read off the index the search actually uses, and every value
returns records.

**People — `management_level`, and `level` inside `has_experience`**

- `Specialist`
- `Senior`
- `Manager`
- `Head`
- `Director`
- `Vice President`
- `President/Vice President`
- `C-Level`
- `Partner`
- `Founder`
- `Owner`
- `Intern`

**People — `active_department`**

- `Administrative`
- `C-Suite`
- `Consulting`
- `Customer Service`
- `Design`
- `Education`
- `Engineering and Technical`
- `Finance & Accounting`
- `General Management`
- `Human Resources`
- `Legal`
- `Marketing`
- `Medical`
- `Operations`
- `Other`
- `Product`
- `Project Management`
- `Real Estate`
- `Research`
- `Sales`
- `Trades`

**People — `industry` inside `has_experience`.** A company's own `industry` is a
different and much longer vocabulary; this twenty-value set is the one attached
to a person's jobs.

- `Accommodation Services`
- `Administrative and Support Services`
- `Construction`
- `Consumer Services`
- `Education`
- `Entertainment Providers`
- `Farming, Ranching, Forestry`
- `Financial Services`
- `Government Administration`
- `Holding Companies`
- `Hospitals and Health Care`
- `Manufacturing`
- `Oil, Gas, and Mining`
- `Professional Services`
- `Real Estate and Equipment Rental Services`
- `Retail`
- `Technology, Information and Media`
- `Transportation, Logistics, Supply Chain and Storage`
- `Utilities`
- `Wholesale`

**Jobs — `seniority`**

- `Associate`
- `Director`
- `Entry level`
- `Executive`
- `Internship`
- `Mid-Senior level`
- `Not Applicable`

**Jobs — `employment_type`**

- `Contract`
- `Full-time`
- `Internship`
- `Other`
- `Part-time`
- `Temporary`
- `Volunteer`

**Companies — `size_range`**

- `Myself Only`
- `1-10 employees`
- `11-50 employees`
- `51-200 employees`
- `201-500 employees`
- `501-1000 employees`
- `1001-5000 employees`
- `5001-10,000 employees`
- `10,001+ employees`

**Companies — `type`**

- `Privately Held`
- `Public Company`
- `Partnership`
- `Nonprofit`
- `Educational`
- `Government Agency`
- `Self-Employed`
- `Self-Owned`

Not every category field is a fixed set. A company's `industry` runs to over
three hundred values, and a job's `functions` and `industries` to several
hundred each. Ask those with `match` and expect a long tail.

Yes/no fields take `true` or `false`: `is_working`, `is_decision_maker`,
`is_current`, `is_studying`, `is_b2b`, and `application_active`. `1` and `0`
are accepted for all of them too, because two of the six are stored that way
and which two is not something a caller should have to know.

**Asking one of them for `false` is not the same question on all six.** A field
that is only written when it is true has no `false` to match; it is absent
instead, and absent is not something `eq` can ask for. Read off the indexes the
search actually uses:

| Field | How to ask for no |
|---|---|
| `is_working`, `is_decision_maker`, `is_current` | `false`. Both answers are stored. |
| `is_studying`, `is_b2b` | `{"not": {"field": "...", "eq": true}}`. `eq false` matches nothing. |
| `application_active` | Nothing to ask. Every posting in the index is active, so the condition removes no results. |

Like the wrong case, the first form is a valid query that costs nothing and
returns zero, which reads as an answer about the data rather than about the
query. `{"where": {"not": {"field": "is_b2b", "eq": true}}}` is how you ask for
the companies that are not B2B.

Date fields take `YYYY-MM-DD` or a relative form: `now`, `now-30d`, `now-6m`,
`now-2y`. The maximum offsets are `7300d`, `240m`, and `20y`. Relative values
resolve server-side to an absolute date before the query is built.

A field name that is not in the list below, an operator that is not one of the
six, and a malformed node all return the same 400. Check the name against the
list for the entity you are querying: the three do not share one.

### People query fields

`POST /v1/people/query`

Text fields: `active_department`, `active_title`, `awards`, `certifications`,
`company_name`, `courses`, `headline`, `institution_name`, `languages`, `major`,
`patents`, `publications`, `skills`, `title`.

Exact fields: `city`, `company_type`, `country`, `country_iso2`,
`country_iso3`, `first_name`, `full_name`, `industry`, `is_current`,
`is_decision_maker`, `is_studying`, `is_working`, `language_proficiency`,
`last_name`, `level`, `linkedin_url`, `management_level`, `regions`, `role`,
`state`, `workplace_city`, `workplace_country`, `workplace_state`.

Numeric fields: `company_employees_count`, `company_size_range`,
`degree_level`, `duration_months`, `experience_months`, `graduation_year`,
`institution_ranking`, `study_start_year`.

Date fields: `ended_at`, `started_at`.

People are the only entity with same-record scopes. A profile holds many jobs
and many degrees, and every condition inside one scope must match the *same*
record: "one job that is both Google and Director" rather than "some job at
Google, and some job as Director". Scopes: `has_education`, `has_experience`,
`has_language`.

- `has_education` fields: `degree_level`, `graduation_year`,
  `institution_name`, `institution_ranking`, `is_studying`, `major`,
  `study_start_year`.
- `has_experience` fields: `company_employees_count`, `company_name`,
  `company_size_range`, `company_type`, `duration_months`, `ended_at`,
  `industry`, `is_current`, `level`, `role`, `started_at`, `title`,
  `workplace_city`, `workplace_country`, `workplace_state`.
- `has_language` fields: `language_proficiency`, `languages`.

The field goes inside the scope:
`{"has_language": {"all": [{"field": "languages", "eq": "Chinese"}]}}`.
`{"field": "languages", "has_language": "Chinese"}` is not a leaf and is
rejected.

Write the language in English. Profiles fill this in their own language, so one
language is stored under many spellings and the server matches all of them;
`Chinese` also reaches Mandarin and Cantonese speakers, and `Mandarin` or
`Cantonese` narrow it when that is the point. A language the vocabulary has not
met is searched for as written.

`language_proficiency` has exactly five values, lowest to highest, and nothing
else is accepted:

- `Elementary proficiency`
- `Limited working proficiency`
- `Professional working proficiency`
- `Full professional proficiency`
- `Native or bilingual proficiency`

Records carry the same five strings, so a level you read is a level you can
filter on. Numbers and words like `fluent` or `advanced` are refused, because
they mean a different level to different readers. Put it in the same
`has_language` as the language it qualifies, or the level will be satisfied by
any language on the profile.

```json
{
  "where": {
    "all": [
      {"field": "country", "eq": "United States"},
      {"has_experience": {"all": [
        {"field": "company_name", "match": "Google"},
        {"field": "level", "eq": "Director"},
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
not tell a user that Metix AI will return an email address today.

Personal contact fields are not part of a detail response either, and cannot be
selected into one.

## System: free

| Endpoint | Notes |
|---|---|
| `GET /version` | No auth. Returns `version` and `contract_hash`. |
| `GET /auth/key/status` | Your key's scopes, rate limit, and remaining quota. |
| `GET /contract` | The contract this deployment serves, as JSON. Free. |

## Checking you are current

These files describe one version of the contract. The service reports which one
it is serving, so the two can be compared rather than assumed.

```bash
curl -s https://mira-api.metix.ai/version
# {"code":200,"msg":"ok","data":{"version":"2.1.2","contract_hash":"..."}}
```

**This document was written against `contract_hash` `3e2908cf7f526e62`.**

`contract_hash` fingerprints the published contract. It changes when a route, a
parameter, a limit or a documented response shape changes, and not otherwise, so
a value that matches means these files still describe what is being served.

`GET /contract` returns that contract as JSON: every route, its parameters and
limits, and the query vocabulary for each dataset. It takes your key and costs
nothing. It is generated from the running service, so it describes what is being
served rather than what a document said when it was written.

Read it when these files and the service disagree, and when you need a field list
you can parse rather than one you have to read. The `contract_hash` it carries is
over its own body without `contract_hash` itself, so it can be recomputed and
checked rather than taken on trust. Every key gets the same contract and the same
hash, and `GET /version` reports that same value.

If it does not match, reinstall before debugging further:

```bash
npx skills add MetixAI-Official/metix-skills
```

A mismatch is worth checking first whenever a request that these files say
should work does not: an endpoint that answers 404, a field name refused with a
400, or a response missing something documented here. Quote the `trace_id` from the failing response when reporting it.

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
