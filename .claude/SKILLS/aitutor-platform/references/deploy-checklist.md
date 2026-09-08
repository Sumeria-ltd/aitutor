# Deployment checklist

## Reproducibility
- [ ] Clean clone builds using documented commands only
- [ ] All configuration comes from environment variables
- [ ] `.env.example` lists every variable name, with no real values
- [ ] The deploy command is written in `deployment.md`

## Observability
- [ ] Application errors reach a place a human actually checks
- [ ] Request logs carry a timestamp and an identifier
- [ ] Model calls log token usage
- [ ] A health endpoint or equivalent exists

## Cost
- [ ] Monthly ceiling set on the model account
- [ ] Alert configured at 50% of the ceiling
- [ ] A named person receives that alert

## Verification
- [ ] Every spec ACCEPT line re-run against the deployed URL
- [ ] Results recorded in `deployment.md` with the date
- [ ] Failures written down rather than retried until green
