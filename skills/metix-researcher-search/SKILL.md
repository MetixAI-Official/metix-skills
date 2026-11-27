---
name: metix-researcher-search
description: Use when finding researchers, scholars or academic authors on Metix AI by what they published (papers on a topic, at a venue, in a year range), by institution, research field or citation metrics; when looking up papers or institutions; and when reading the researcher, paper or institution records behind the ids.
---

# Metix AI researcher search

Three datasets that point at each other: researchers, their papers, and the
institutions on those papers. Each search returns ids; each detail call returns
records. A researcher search can also ask "has at least one paper matching
these conditions" through `has_paper`, which is how you find people by what
they actually work on.

These routes are new and not yet in `GET /contract`, the docs or the MCP tool
list. Until the contract lists `researcher`, `paper` and `institution` under
`querySpecByEntity`, the field list at the end of this file is the reference;
once it does, the contract wins. Call them with HTTPS requests as shown below.
Any API key works. A `503` with `error_code` `service_unavailable` means the
data is not available right now: stop and tell the user, and do not try other
paths.

## Resources

```
API     https://mira-api.metix.ai
        POST /v1/researchers/query                 where, size, after, order_by, paper_match
        POST /v1/papers/query                      where, size, after, order_by
        POST /v1/institutions/query                where, size, after
        POST /entity/v1/researchers/detail-by-id   researcher_ids (1 to 100), _source
        POST /entity/v1/papers/detail-by-id        paper_ids (1 to 100), _source
        POST /entity/v1/institutions/detail-by-id  institution_ids (1 to 100), _source
        GET /version            deployed version and contract hash (free)
        GET /contract           field names, operators, limits (free, no key needed)
        GET /auth/key/status    key state and remaining API Credits (free)
        GET /docs               tutorial catalog; add .md to any page for Markdown
        /mcp                    MCP endpoint, same key

Docs    https://mira-api.metix.ai/docs/api/query-spec.md
        https://mira-api.metix.ai/docs/reference/errors.md
        https://mira-api.metix.ai/docs/credits.md
        https://mira-api.metix.ai/docs/api/people.md
        https://mira-api.metix.ai/docs/api/contact.md
        https://mira-api.metix.ai/docs/api/companies.md
        https://mira-api.metix.ai/docs/api/jobs.md
        https://platform.metix.ai/llms.txt
```

The query grammar (`all`, `any`, `not`, one operator per leaf) is the one on
`/docs/api/query-spec.md`. There is no docs page for these three datasets yet.

## How to call

1. Build `where` from the fields at the end of this file. The list is closed;
   a name outside it is refused with `unsupported_query_field`, and that
   refusal lists the fields that do exist. Free-text fields take `match`;
   exact fields take `eq` or `in` with the whole value; numbers and dates also
   take `gte`, `gt`, `lte` and `lt`.
2. Search. Always send `size`: without it a search returns 100 ids and is
   charged for 100. The response has the ids, `total` (an exact integer below
   100000, otherwise the string `"100000+"`), and `next` while more pages
   remain.
3. `POST` up to 100 of those ids to the matching detail route. Name the fields
   you need in `_source`. A few fields are left out of the default record and
   come back only when named; they are marked below.
4. On a 4xx, switch on `error_code`; `msg` says what to change. For the full
   explanation, fetch `docs_url` with `.md` added to the path:
   `https://platform.metix.ai/docs/reference/errors#query-refusals` becomes
   `https://platform.metix.ai/docs/reference/errors.md`, and `query-refusals`
   names the section to read.
5. If this file and the live contract disagree, the contract wins.

## A first call

Researchers with papers on KV caching and an h-index of at least 20:

```bash
curl -s https://mira-api.metix.ai/v1/researchers/query \
  -H "Authorization: Bearer $METIX_KEY" -H "Content-Type: application/json" \
  -d '{"where": {"all": [
        {"has_paper": {"any": [
          {"field": "title", "match": "kv cache"},
          {"field": "abstract", "match": "kv cache"}]}},
        {"field": "h_index", "gte": 20}]},
       "size": 10}'
# data.researcher_ids, data.matched_papers, data.total, data.paper_match, data.next

curl -s https://mira-api.metix.ai/entity/v1/researchers/detail-by-id \
  -H "Authorization: Bearer $METIX_KEY" -H "Content-Type: application/json" \
  -d '{"researcher_ids": ["<ids from data.researcher_ids>"],
       "_source": ["id", "name", "latest_affiliation", "affiliations",
                   "h_index", "citations", "metrics_source", "topics"]}'
```

For the next page, send `data.next` back as `after`, with every other field of
the request unchanged apart from `size`.

## Finding people by their papers

`{"has_paper": <conditions>}` takes paper fields. A researcher matches when at
least one of their papers meets all of the conditions. The response adds
`matched_papers`: how many matching papers each person has, in the order of
`researcher_ids`. With the default `order_by` the results are ranked by that
count; with another `order_by` (`h_index`, `citations`, ...) they are ranked
by that instead, and `matched_papers` is still returned.

- `has_paper` is either the whole `where` or one direct condition of the
  top-level `all`, at most once. It cannot sit inside `any`, `not` or another
  scope. Person conditions (metrics, field, affiliations) go next to it in the
  same `all`.
- When the matching papers have more than 65,536 authors in total the search
  is refused with `paper_condition_too_broad`. Narrow the papers (a year range,
  a `field`, a `venue`, a more specific phrase), or send `"paper_match":
  "top"` to use the 5,000 papers that match best (the most cited ones when
  the conditions have no text). With `top`, `matched_papers` counts among
  those 5,000, and `data.paper_match` says which mode answered.
- `top` is a sample, not the full set. Use it to find the leading people,
  not to enumerate everyone: `total` and the lower part of the list can
  differ slightly from one call to the next. Pair it with `order_by` (for
  example `h_index`) to rank the sampled people by a metric.
- `paper_match` is accepted only together with `has_paper`.
- `has_paper` selects papers, and every researcher on a selected paper
  counts. A `has_author` condition inside it (say, an author who signed an
  institution) picks the papers but still credits all of their authors. To
  require that the person themselves signed an institution, put
  `has_affiliation` next to `has_paper` instead.
- To show why someone is on the list, query papers with `researcher_ids` set to
  that person and the same paper conditions.

## Chaining by id

Ids are per dataset: a researcher id sent as a paper id is refused with
`invalid_id`. Chain on ids, not on names.

- **Institution first.** One acronym belongs to several institutions (`MIT`
  matches nine), so resolve it: `/v1/institutions/query` on `acronyms`, `name`
  or `aliases` (other languages, Chinese included), with `country` to narrow,
  then read the records and pick the id. Use it as
  `affiliations.institution.id` inside `has_affiliation`, next to
  `affiliations.last_year` or `affiliations.first_year`, so both conditions hold
  for the same institution. One co-authored paper signed there is enough to
  count, so add `affiliations.paper_count` `gte` 3 or so when you mean people
  who actually worked there. `paper_count` is the total signed there over the
  whole stint; it cannot be limited to a year range, and the record shows
  signatures, not employment dates.
- **A researcher's papers.** `/v1/papers/query` with `researcher_ids` `eq` the
  id, and `order_by` `citations` for the most cited first.
- **A paper's authors.** The paper record's `authors[].researcher.id` goes to
  `/entity/v1/researchers/detail-by-id`. An author without one is a byline name
  this dataset could not match to a person.

People at MIT since 2022 who wrote about KV caching:

```json
{"where": {"all": [
  {"has_paper": {"any": [
    {"field": "title", "match": "kv cache"},
    {"field": "abstract", "match": "kv cache"}]}},
  {"has_affiliation": {"all": [
    {"field": "affiliations.institution.id", "eq": "<MIT's id from the institution search>"},
    {"field": "affiliations.last_year", "gte": 2022}]}}
]}, "size": 25}
```

## Getting better results

- **Search papers, not profile text, for topics.** `headline` and `interests`
  come from a Google Scholar page, which a minority of researchers have.
  `has_paper` on `title` and `abstract` covers everyone with papers. Put both
  in one `any`: `abstract` exists only for papers with an arXiv version.
- **Text matching is literal.** Every word of a `match` must appear, so
  "transformer" does not find a paper titled "Attention Is All You Need". Put
  the phrasings a field actually uses in one `any`. Chinese, Japanese and
  Korean text matches as a phrase.
- **Exact values must be exact.** `fields` and `type` match the whole value
  including case, from the lists below. A value that is not on the list is not
  refused; it matches nothing. A `total` of 0 on such a field usually means a
  misspelled value.
- **Venues are written many ways.** `venue` is the source's own text, so one
  conference has many spellings ("NeurIPS", "Neural Information Processing
  Systems", "Advances in Neural Information Processing Systems"). Use `any`.
- **Names.** `name` with `eq` compares the whole name after ignoring case,
  accents, punctuation and any part in parentheses, against every known
  spelling of the person. `match` searches the standard name word by word.
  Two people can share a name; check `affiliations` and `topics` before
  treating them as one.
- **Where someone works.** `latest_affiliation` is the institution signed on
  the person's most recent papers. It is not necessarily the current employer,
  and it can rest on a single paper. Read `affiliations`, with `paper_count`
  and `last_year` per institution, before stating where someone works.
- **Metrics come from two sources.** `metrics_source` is `google_scholar`,
  `openalex` or `none`, and the two count differently. Do not compare an
  h-index across sources or present one as the other. The `_5y` figures
  come from Google Scholar only and count from the year in `recent_since`.
- **Bound the years.** A few records carry implausible years, so when you
  filter or sort on `last_paper_year` or a paper's `year`, add an upper bound of
  the current year. Records show such years as null.
- **Count before pulling records.** `size: 1` returns `total`, and an empty
  search is free. A huge total usually means a requirement is missing.

## Same name, different thing

These are not refused when mixed up; they quietly return 0 or a wrong reading.

- `fields` on a researcher is a list; `field` on a paper is one value. Both use
  the research fields below.
- `type` on a paper and `type` on an institution are different value lists.
- `dblp_key` is a person key (`homepages/...`) on a researcher and a record key
  (`conf/...`, `journals/...`) on a paper. `openalex_id` is an OpenAlex author,
  work or institution id depending on the dataset.
- `citations` on a researcher comes from Google Scholar or OpenAlex (see
  `metrics_source`); on a paper it is the highest any source reports. A
  person's paper citations do not add up to their `citations`.
- `aliases` on an institution are its other names, in other languages too, and
  are good to search. On a researcher they come back only on request, cannot be
  searched, and some are whole bylines with co-authors in them.
- On a paper, `researcher_ids` includes people the byline could not place and,
  occasionally, someone with the same name as an author; `authors[].researcher.id`
  is the byline. List co-authors from `authors`.
- `paper_count` is all of a person's papers, `affiliations[].paper_count` the
  ones signed at one institution, and `matched_papers` the ones matching this
  `has_paper`.

## Local rules

Every call reads `METIX_KEY` from the environment. If it is unset, stop and tell
the user to set it. Do not substitute another variable, and do not search the
machine for a lookalike key.

Never print the key, write it into a file, or include it in a summary.

Researcher records carry no email, phone number or LinkedIn link, and there is
no link from a researcher to a professional profile yet. Contact details are a
people capability: `POST /v1/contact/unlock`, through `metix-people-search`,
for profiles found there. Do not invent a contact route for researchers.

API Credits are charged in the same result bands as company and job search:
a query costs one Credit per 25 ids returned, a detail call one per 5 records
found. `has_paper` costs nothing extra. Refusals, empty searches and ids not
found are free. One id per request is the expensive way to walk a set; batch.

## Fields, until the contract lists them

**Researcher** (`/v1/researchers/query`)

- Free text: `name`, `headline`, `interests`, `topics`,
  `latest_affiliation.institution.name`.
- Exact: `fields` (one of the research fields below),
  `latest_affiliation.country` (English name or two-letter code),
  `latest_affiliation.institution.id` (an institution id), `google_scholar_id`,
  `dblp_key`, `openalex_id`, `orcid`, `homepage`.
- Numbers: `h_index`, `i10_index`, `citations`, `paper_count`,
  `last_paper_year`, `h_index_5y`, `i10_index_5y`, `citations_5y`.
- One institution stint, grouped by `has_affiliation`:
  `affiliations.institution.id`, `affiliations.institution.name`,
  `affiliations.country`, `affiliations.first_year`, `affiliations.last_year`,
  `affiliations.paper_count`.
- Papers, through `has_paper`: any paper field.
- `order_by`: `relevance` (the default), `h_index`, `citations`, `paper_count`,
  `last_paper_year`, `h_index_5y`, `citations_5y`. All sort from high to low,
  with missing values last.
- Left out of the record unless named in `_source`: `aliases` (some are whole
  bylines that include co-authors), `recent_since`, `citations_by_year`.

**Paper** (`/v1/papers/query`)

- Free text: `title` (`eq` compares the whole title, ignoring case and
  punctuation), `abstract`, `keywords`, `topics`, `venue`, `publisher`.
- Exact: `field` (one of the research fields below), `type` (below), `doi` (any
  case), `arxiv_id`, `openalex_id`, `dblp_key`, `researcher_ids` (a researcher
  id).
- Numbers and dates: `year`, `citations`, `published_date` (`YYYY-MM-DD`).
- One byline entry, grouped by `has_author`: `authors.name`,
  `authors.researcher.id`, `authors.institution_ids` (institution ids).
- `order_by`: `relevance`, `citations`, `year`, `published_date`.
- Left out of the record unless named in `_source`: `abstract`,
  `authors.institution_ids`.

**Institution** (`/v1/institutions/query`)

- Free text: `name`, `aliases`, `city`.
- Exact: `acronyms` (case does not matter), `country` (English name or
  two-letter code), `type` (below), `ror` (the bare ROR id such as
  `042nb2s44`, or the full ROR link), `openalex_id`.

**Values**

- Research fields: Agricultural and Biological Sciences; Arts and Humanities;
  Biochemistry, Genetics and Molecular Biology; Business, Management and
  Accounting; Chemical Engineering; Chemistry; Computer Science; Decision
  Sciences; Dentistry; Earth and Planetary Sciences; Economics, Econometrics and
  Finance; Energy; Engineering; Environmental Science; Health Professions;
  Immunology and Microbiology; Materials Science; Mathematics; Medicine;
  Neuroscience; Nursing; Pharmacology, Toxicology and Pharmaceutics; Physics
  and Astronomy; Psychology; Social Sciences; Veterinary.
- Paper `type`: `article`, `conference-paper`, `preprint`, `book-chapter`,
  `dissertation`, `conference-abstract`, `review`, `dataset`, `book`,
  `data-paper`, `letter`, `software-paper`.
- Institution `type`: `education`, `company`, `government`, `nonprofit`,
  `healthcare`, `facility`, `archive`, `funder`, `other`.

Limits: up to 64 conditions and 6 levels of nesting per `where`; `in` takes up
to 100 ids; `size` from 1 to 10000; detail takes 1 to 100 ids per call.
