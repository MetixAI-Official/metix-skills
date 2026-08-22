# Credits

Credits are consumed by successful work only. Validation failures and rate
limits are not charged. Empty searches and detail misses are free; a successful
empty AI people search still costs its base 5.

## Rules

These rules are aligned to the committed Mira API blueprint and usage-pricing
contract, price version `usage-pricing-v2026-08-04`. When a response includes
`charged_credits`, that value is authoritative for the individual call.

| Call | Cost |
|---|---|
| `POST /v1/people/query` | **`ceil(profile_ids.length / 25)`**; zero results free |
| `POST /v1/people-search` (AI/natural language) | **`5 + ceil(profile_ids.length / 25)`**; successful zero results cost 5 |
| `POST /v1/companies/query` | **`ceil(company_ids.length / 25)`**; zero results free |
| `POST /v1/jobs/query` | **`ceil(job_ids.length / 25)`**; zero results free |
| `POST /entity/v1/profiles/detail-by-id` | **`ceil(found / 5)`** |
| `POST /entity/v1/companies/detail-by-id` | **`ceil(found / 5)`** |
| `POST /entity/v1/jobs/detail-by-id` | **`ceil(found / 5)`** |
| `GET /version`, `GET /auth/key/status` | free |

That table is the whole priced surface. Contact email lookup is coming soon and
has no published price; nothing else is billable because nothing else is open.

## Charging uses result bands

This is the part that changes how you should write code against this API.

A Query Spec search costs one Credit for each started band of 25 returned ids.
AI people search adds a 5-Credit base charge. Detail costs one Credit for each
started band of five found records.

Examples from the formulas:

```
people/query, 1 id           ->  1 Credit
people/query, 30 ids         ->  2 Credits
people/query, no match       ->  0 ids     ->  0 Credits

people-search, no match      ->  0 ids     ->  5 Credits
people-search, 30 ids        ->  30 ids    ->  7 Credits

profiles/detail-by-id, 1 found  ->  1 Credit
profiles/detail-by-id, 6 found  ->  2 Credits
```

So:

**Batch aggressively.** Five found records cost 1 Credit in one detail request.
Five single-record calls cost 5 Credits because each starts a new band.

**Choose `size` deliberately.** The maximum possible charge is reserved from the
resolved request size before work starts, and the final charge settles against
actual returned results. A wider window can therefore require more available
quota and can cost more when it returns more ids.

**Paging is not free.** Each page of a cursored search is its own search and is
charged on the ids it returns, so `ceil(results / 25)` applies per page rather
than once for the whole walk.

**Empty searches and detail misses are free.** A successful empty AI people
search is the exception and still costs its 5-Credit base charge.

## Checking quota

`GET /auth/key/status` is free and returns `user_quota` with `quota_total`,
`quota_used`, and `quota_remaining`. Check it before a large run.
