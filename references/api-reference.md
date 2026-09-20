# API reference

This package is a resource catalog. It does not keep a second copy of the query
vocabulary.

Every path here is on `https://mira-api.metix.ai`.

Machine facts (routes, field names, operators, limits, billing) live on
`GET /contract`. Teaching copy (worked examples, salary rules, error catalog,
credit formulas) lives on `GET /docs`, which returns the catalog. Add `.md` to
any page for the Markdown form, for example:

- `/docs/api/jobs.md`
- `/docs/api/people.md`
- `/docs/api/contact.md`
- `/docs/api/companies.md`
- `/docs/api/query-spec.md`
- `/docs/reference/errors.md`
- `/docs/credits.md`

A 4xx carries `error_code` and `docs_url`. Switch on `error_code`; `msg` says
what to change. `docs_url` is the page that explains the failure, and the same
URL with `.md` added to the path is its Markdown form. If this file and the live
contract disagree, the contract wins.
