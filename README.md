# Flinx Realty CRM

A sales CRM for **Flinx Realty Ltd** — residential property sales in Lagos. Contacts, activity
tracking, pipeline, collections and reporting, with role-based access across salespeople, sales
managers and company directors.

This repository runs as a **self-contained demo**: the whole application, including its data, runs
in the browser. There is no server to set up and nothing to configure.

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm test` | Unit tests over the core rules |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm build` | Production build into `dist/` |
| `pnpm deploy` | Builds the single-file bundle into `docs/` for GitHub Pages |

## What's in it

| Area | |
|---|---|
| **Contacts** | Multiple phone numbers and addresses per person, owner, source and campaign. Bulk import from CSV and vCard with de-duplication, batch history and undo. Export in both formats. |
| **Activity** | Inspections, meetings and conversations logged against a named client with discussion notes, recording both when the work happened and when it was entered. |
| **Pipeline** | A configurable stage board with sub-statuses, stage history, and deals in naira or dollars. |
| **Properties** | The developments deals and inspections are attached to, with availability and pricing. |
| **Payments** | Collections, outstanding balances, ageing and expected monthly inflow against agreed payment plans. |
| **Website enquiries** | Leads from the site's availability and booking forms, routed on arrival with response time measured from submission. |
| **Reports** | Sales per person, team rollups, activity volume, conversion and record-keeping, all scoped to the viewer. |

Access is role-based throughout: a salesperson sees what they own, a sales manager sees their team,
and a director sees the company. Switch accounts from the header to see the difference.

## How it's built

React 19, TypeScript, Vite and Tailwind. The data layer is shaped like the production schema it is
designed for, so replacing it with a real API is a change to `src/data/store.ts` and
`src/data/selectors.ts` rather than a rewrite of the screens.

```
src/
  data/
    schema.ts      the data model
    seed.ts        the demo dataset (deterministic; dates anchored to today)
    store.ts       every mutation a backend would own
    scope.ts       the access-control predicate — applied to every read
    derive.ts      computed values: contact status, outstanding balance, logging delay
    money.ts       integer minor units; exchange rates fixed at close
    phone.ts       E.164 normalisation, the de-duplication key
    import/        CSV and vCard parsers, de-duplication, export, sample files
    selectors.ts   the scoped read layer every screen goes through
  components/      shell, primitives, charts, badges, product tour
  screens/         one per route
```

Four rules underpin the rest, and each lives in exactly one place:

| Rule | Where |
|---|---|
| Who can see whose records | `data/scope.ts` |
| A contact's status follows its most advanced open deal | `data/derive.ts` |
| Money is integer minor units, converted at a rate fixed on the record | `data/money.ts` |
| The entry timestamp is set by the system, never supplied by the client | `data/store.ts` |

## Demo data

Development names, locations, price points and payment plans are Flinx Realty's own. **All staff,
buyers, deal values and activity are fictional**, generated for demonstration — no figure here is a
real sales record.

The dataset is deterministic, so every run is identical, but its dates are anchored to the current
day so the pipeline never looks stale. **Reset workspace** in the sidebar restores it.

Changes you make are stored in your own browser only and are not shared with anyone else.

## Tests

```bash
pnpm test
```

Covers the logic worth being sure about: phone normalisation and de-duplication matching, the access
predicate across all three roles, derived contact status, minor-unit money and fixed-rate
conversion, outstanding balances and overdue detection, logging delay, and the shape of the dataset.

## Deployment

`pnpm deploy` writes a single self-contained `docs/index.html` — all CSS and JavaScript inlined,
hash routing, Google Fonts the only external request. Commit and push it; GitHub Pages serves
`/docs` on the default branch.
