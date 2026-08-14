# X Pulse

X-only market sentiment dashboard for Vercel.

## Deploy
1. Upload the contents of this folder to the `xsentiment` GitHub repository.
2. In Vercel, set `X_BEARER_TOKEN` for Production (and Preview if desired).
3. Deploy/redeploy.

No `vercel.json` is required. Vercel automatically deploys files under `/api` as Functions.

The app uses X recent post search and paginates up to 1,000 returned posts, subject to the X API access level and available results.
