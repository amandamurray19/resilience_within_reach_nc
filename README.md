# Resilience Within Reach NC

A static, browser-based planner for comparing proposed networks of resilience hubs in Asheville, Greenville, Lumberton, and Rocky Mount, North Carolina.

The site calculates network-level walking and scheduled-transit coverage from prepared census-block routing tables. Cities choose their score factors, access rules, mode-specific weights, and number of hubs. A browser-based branch-and-bound solver maximizes the normalized weighted coverage score, with a 15-second time limit for difficult scenarios.

## Publish with GitHub Pages

The site has no build step. Publish the `main` branch from the repository root in **Settings → Pages**.

## Refresh the data

The source CSVs live one directory above this repository in the Box project folder. After those files change, run:

```bash
python3 -m pip install -r requirements.txt
python3 build_data.py
```

This creates compact routing JSON and simplified census-block geometry in `data/` for the browser application.

## Method notes

- A block is covered when at least one selected hub satisfies the chosen access rule.
- Each selected factor and travel mode becomes a separate 0–1 coverage component. The final score is their normalized weighted average.
- The optimizer runs in a Web Worker so the interface remains responsive. It reports an exact optimum when proof finishes within 15 seconds; otherwise it returns and labels the best network found before the cutoff.
- Transit requires both the maximum scheduled transit time and maximum total access-plus-egress walking distance.
- ACS tract estimates are allocated to blocks using their shares of 2020 population or housing units.
- Heat risk is the population in the hottest quartile of blocks with valid summer p90 surface-temperature samples in each city.
- Flood risk is the population in blocks whose Census representative point intersects a mapped flood area.
- Results are screening estimates for scenario comparison and should be validated with local partners.
