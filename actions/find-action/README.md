# SpecStream Find

A GitHub Action that runs a [SpecStream](https://specstream.ai) request and uploads the results as a CSV. It reads the request, gets the price, checks the price against the maximum you set, runs it, and writes `specstream-results.csv`.

```yaml
name: Weekly tenders
on:
  schedule:
    - cron: "0 6 * * 1"
jobs:
  find:
    runs-on: ubuntu-latest
    steps:
      - uses: Specstreamai/specstream-tools/actions/find-action@v1
        with:
          request: >
            Open tenders on SAM.gov for translation services with a deadline after
            November 1. Include the buyer and the estimated value.
          api_key: ${{ secrets.SPECSTREAM_API_KEY }}
          confirm_max_usd: "10"
```

## Inputs

| Input | Required | |
| --- | --- | --- |
| `request` | yes | What you need, in your own words |
| `api_key` | yes | A SpecStream API key. Keep it in a repository secret |
| `confirm_max_usd` | yes | The most this step may spend, in US dollars. The step stops with exit code 2 if the price is higher. It is never filled in for you |
| `idempotency_key` | no | Stable identity for the run. Defaults to the workflow run ID and job, so re-running a job picks up the same work and never pays twice |
| `base_url` | no | Defaults to `https://api.specstream.ai` |
| `locale` | no | Defaults to `en-US` |

## Outputs

`find_id` is the run ID, for the workspace and the API. `csv_path` is the path to the CSV, which the action also uploads as the artifact `specstream-results`.

## Notes

- The step stops without spending if the quote is in euros, because `confirm_max_usd` is in dollars.
- The API key needs the execute permission and a spending limit at least as high as `confirm_max_usd`.
- A run that is still going after 30 minutes stops the step. The work is kept, and a re-run recovers it.

Support: support@specstream.ai. MIT license.
