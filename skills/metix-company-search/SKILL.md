---
name: metix-company-search
description: Use when building organization lists on Metix or retrieving company records for account research, market mapping, funding and headcount filters, or connecting company data to people and job signals.
---

# Metix company search and detail

Same two-step shape: search returns `company_ids`, detail returns records.

Endpoints, limits, and costs: `references/api-reference.md`,
`references/credits.md`.

## Search

`POST /v1/companies/query` takes a required `where` tree plus optional `size`
and `after`.

```bash
curl -X POST "https://mira-api.metix.ai/v1/companies/query" \
  -H "Authorization: Bearer $METIX_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {"all": [
      {"field": "categories_and_keywords", "match": "artificial intelligence"},
      {"field": "size_range", "eq": "51-200 employees"},
      {"field": "founded_year", "gte": 2015}
    ]},
    "size": 100
  }'
```

A leaf carries exactly one operator, so a headcount band is an `all` of two
leaves rather than `gte` and `lte` in one node. Composers are `all`, `any`,
`not`; operators are `eq`, `exists`, `gte`, `in`, `lte`, `match`. The operator
does not decide how a value is compared, the field does: a text field is matched
as text and an exact field compares the whole stored value, whichever of `eq`
and `match` you write.

Search costs `ceil(company_ids.length / 25)` and an empty result is free. The
server reserves against the resolved `size`, then settles against returned ids.

## Company query fields

Company text fields: `categories_and_keywords`, `hq_city`, `hq_country`,
`hq_country_iso2`, `hq_full_address`, `hq_regions`, `hq_state`, `industry`,
`linkedin_url`, `name`, `stock_exchange`, `stock_ticker`, `website`.

Company exact fields: `is_b2b`, `size_range`, `type`.

Company numeric fields: `employees_count`,
`employees_count_change_yearly_percentage`, `followers_count`, `founded_year`,
`last_funding_round_amount_raised`.

Company date fields: `last_funding_round_date`, `last_updated_at`.

The three exact fields are the ones that bite. `type` and `size_range` are
enumerations, so a near-miss value returns nothing rather than something close.

Use `industry` for an industry phrase and `categories_and_keywords` for broader
descriptive terms. Both are text fields, but they read different source fields,
so a zero result in one is a reason to try the other rather than evidence that
the company category does not exist.

`size_range` is an **enumeration** and `eq` must match one of these strings
exactly, so `"51-200"` is rejected and `"51-200 employees"` is accepted:

```
1-10 employees        201-500 employees      5001-10,000 employees
11-50 employees       501-1000 employees     10,001+ employees
51-200 employees      1001-5000 employees    Myself Only
```

For a headcount cut that is not one of those bands, filter on the numeric
`employees_count` instead. There are no same-record scopes on companies; those
exist only for people.

## Detail

`POST /entity/v1/companies/detail-by-id` with `company_ids`, 1 to 100 per request.

The response carries `total`, `found` (a **count**), `not_found` (ids that
matched nothing), and `results` (the records). Read records from `results`.

Cost is `ceil(found / 5)`, and unmatched ids are free. Batch up to 100: five
single-record calls cost 5 Credits while one call finding five records costs 1.

## Connecting to other areas

Company ids are the join key for cross-area work. A job posting record carries
`company_id`, which is a company token you can send straight to company detail.
A company record gives you the employer name to use in a people query. Chain on
ids rather than re-searching by name, because name matching is fuzzy and will
drift.
