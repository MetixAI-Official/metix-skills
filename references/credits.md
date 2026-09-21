# Credits

Formulas live on `https://mira-api.metix.ai/docs/credits.md`, not in this
package.

Successful work is charged; validation failures are not. Empty Query Spec
searches and detail misses are free. Natural-language people search keeps a
5-Credit base even when it returns no IDs.

Charges scale in result bands (`ceil(results / 25)` for search,
`ceil(found / 5)` for detail). One ID per request is the expensive way to walk
a set; batch.

A search that leaves out `size` returns up to 100 results, which is up to 4
Credits where 25 results would have cost 1. Pass the number you need.

Contact unlock is the exception: it is charged per value returned, at a flat
rate per kind that is the same on every plan, so batching changes nothing about
what it costs. A kind that comes back anything other than `found` is free, and
the same person and kind is charged once per account per 30 days however often
it is asked for. Read the live rates from `GET /contract`; they are the largest
per-call numbers on the API. `POST /v1/contact/probe` reports who has a value
before you buy, and is priced like a search.
