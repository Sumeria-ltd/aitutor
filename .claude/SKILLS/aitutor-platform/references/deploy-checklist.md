# Deployment checklist

## Reproducibility
- [ ] Clean clone builds using documented commands only
- [ ] All configuration comes from environment variables
- [ ] `.env.example` lists every variable name, with no real values
- [ ] The deploy command is written on the `Deployment` page, and the script it names is in the repository

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
- [ ] Results recorded on the `Deployment` page with the date and the commit
- [ ] Failures written down rather than retried until green
