---
name: metix-job-search
description: Use when analysing active job postings on Metix AI (hiring demand by role, function, company, location, salary, or seniority) and when retrieving full posting records.
---

# Metix AI job search and detail

Search returns `job_ids`; detail returns the postings.

Endpoints, limits, and costs: `references/api-reference.md`,
`references/credits.md`.

## Search

`POST /v1/jobs/query` takes a required `where` tree plus optional `size` and
`after`.

```bash
curl -X POST "https://mira-api.metix.ai/v1/jobs/query" \
  -H "Authorization: Bearer $METIX_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {"all": [
      {"field": "title", "match": "platform engineer"},
      {"field": "city", "eq": "Berlin"},
      {"field": "posted", "gte": "now-30d"}
    ]},
    "size": 100
  }'
```

A leaf carries exactly one operator, so a salary band is an `all` of two leaves
rather than `gte` and `lte` in one node. Composers are `all`, `any`, `not`;
operators are `eq`, `exists`, `gte`, `in`, `lte`, `match`. The operator does not
decide how a value is compared, the field does: a text field is matched as text
and an exact field compares the whole stored value, whichever of `eq` and
`match` you write.

## Job query fields

Job text fields: `city`, `company_name`, `country`, `description`,
`employment_type`, `functions`, `industries`, `location`, `regions`,
`salary_currency`, `seniority`, `state`, `title`.

Job exact fields: `application_active`, `country_iso_2`.

Job numeric fields: `applicants_count`, `required_months_of_experience`,
`salary_max`, `salary_min`.

Job date fields: `created_at`, `posted`, `updated_at`.

Almost everything on a job is a text field, which is why `{"field": "city",
"eq": "Berlin"}` still behaves as a text match here while the same leaf on a
profile is exact.

Date fields take `YYYY-MM-DD` or a relative form such as `now-30d`, which is how
you ask for recent postings. `country_iso_2` is the two-letter ISO 3166-1 code
such as `US`. Note the underscore before the `2`, because the people index
spells the same idea `country_iso2`. There are no same-record scopes on jobs;
those exist only for people.

## Detail

`POST /entity/v1/jobs/detail-by-id` with `job_ids`, 1 to 100 per request.

Search costs `ceil(job_ids.length / 25)` and empty results are free. Detail
costs `ceil(found / 5)`; unmatched ids are free.

A posting record carries `company_id`. That is a company token, so it goes
straight to `/entity/v1/companies/detail-by-id`, so you do not need to search
for the employer by name, and you should not, because name matching drifts.

## What this data is, and is not

Postings are a **current demand signal**: what is open now. They are not a
history of hiring, and the absence of a posting is not evidence that a company
is not hiring. It may be recruiting through channels this index does not cover.

Say that when a user reads a count as an absolute. "Fourteen open ML roles" is a
floor, not a total.

## Counting demand honestly

To size demand across a market, choose a result window you can afford, count the
ids, and pull detail only on the sample you will actually quote. Search charges
in started bands of 25 returned ids, and a cursored walk charges every page, so
a larger result set costs more.
