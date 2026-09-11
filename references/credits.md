# Credits

Formulas live on `https://mira-api.metix.ai/docs/credits.md`, not in this
package.

Successful work is charged; validation failures are not. Empty Query Spec
searches and detail misses are free. Natural-language people search keeps a
5-Credit base even when it returns no IDs.

Charges scale in result bands (`ceil(results / 25)` for search,
`ceil(found / 5)` for detail). One ID per request is the expensive way to walk
a set; batch.
