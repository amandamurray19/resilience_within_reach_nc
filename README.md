# Resilience Within Reach NC

A static, browser-based planner for comparing proposed networks of resilience hubs in Asheville, Greenville, Lumberton, and Rocky Mount, North Carolina.

The site calculates network-level walking and scheduled-transit coverage from prepared census-block routing tables. It includes adjustable access thresholds, population-group coverage, flood and heat risk population coverage, and walking-time summaries.

## Publish with GitHub Pages

The site has no build step. Publish the `main` branch from the repository root in **Settings → Pages**.

## Refresh the data

The source CSVs live one directory above this repository in the Box project folder. After those files change, run:

```bash
python3 build_data.py
```

This creates compact JSON files in `data/` for the browser application.

## Method notes

- A block is covered when at least one selected hub satisfies the chosen access rule.
- Transit requires both the maximum scheduled transit time and maximum total access-plus-egress walking distance.
- ACS tract estimates are allocated to blocks using their shares of 2020 population or housing units.
- Heat risk is the population in the hottest quartile of blocks with valid summer p90 surface-temperature samples in each city.
- Flood risk is the population in blocks whose Census representative point intersects a mapped flood area.
- Results are screening estimates for scenario comparison and should be validated with local partners.
