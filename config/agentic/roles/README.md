# Brooklyn Role Catalog (Project-Specific)

Project-specific role prompts that supplement the FulmenHQ ecosystem catalog.

**Schema**: Roles follow the [FulmenHQ role-prompt schema](https://schemas.3leaps.dev/agentic/v0/role-prompt.schema.json).

## Lookup Order

Role resolution follows a **local-first, ecosystem-fallback** pattern:

1. **Local (project-specific)**: `config/agentic/roles/<slug>.yaml` - this directory
2. **Installed package (fulmen-wide)**: `node_modules/@fulmenhq/tsfulmen/config/crucible-ts/agentic/roles/<slug>.yaml`
3. **Fallback (dev)**: `../tsfulmen/config/crucible-ts/agentic/roles/<slug>.yaml`

Local roles take precedence. When a role is added to tsfulmen upstream, the local copy can be removed.

## Local Roles

These roles are needed by Brooklyn but not yet available in the `@fulmenhq/tsfulmen` package:

| Role                                            | Slug           | Category   | Source    | Purpose                                |
| ----------------------------------------------- | -------------- | ---------- | --------- | -------------------------------------- |
| [Delivery Lead](deliverylead.yaml)              | `deliverylead` | governance | crucible  | Sprint coordination, timeline tracking |
| [Dispatch Coordinator](dispatch.yaml)           | `dispatch`     | governance | crucible  | Session handoff, task routing          |
| [Release Engineering](releng.yaml)              | `releng`       | automation | crucible  | Versioning, releases, CI/CD validation |
| [CXO Tech](cxotech.yaml)                       | `cxotech`      | governance | crucible  | Strategic product-architecture calls   |
| [Product Strategist](prodstrat.yaml)            | `prodstrat`    | consulting | handbook  | Product strategy, roadmaps             |

## Roles from tsfulmen (no local copy needed)

These roles are available from the installed `@fulmenhq/tsfulmen` package:

| Role                 | Slug       | Category   |
| -------------------- | ---------- | ---------- |
| Development Lead     | `devlead`  | agentic    |
| Development Reviewer | `devrev`   | review     |
| UX Developer         | `uxdev`    | agentic    |
| Quality Assurance    | `qa`       | review     |
| Product Marketing    | `prodmktg` | marketing  |
| Security Review      | `secrev`   | review     |
| CI/CD Automation     | `cicd`     | automation |
| Information Architect| `infoarch` | agentic    |
| Enterprise Architect | `entarch`  | governance |
| Data Engineering     | `dataeng`  | agentic    |

## Lifecycle

- **Adding roles**: Drop a YAML file here when Brooklyn needs a role not in tsfulmen
- **Removing roles**: When tsfulmen publishes a role upstream, delete the local copy
- **Overriding roles**: A local file with the same slug as a tsfulmen role takes precedence (use sparingly)

## Provenance

| Source   | Repository                                                      | Notes                              |
| -------- | --------------------------------------------------------------- | ---------------------------------- |
| crucible | [3leaps/crucible](https://github.com/3leaps/crucible)           | Baseline roles for all 3leaps work |
| handbook | [3leaps/handbook](https://github.com/3leaps/handbook)           | Consulting-specific roles          |
| tsfulmen | [fulmenhq/tsfulmen](https://github.com/fulmenhq/tsfulmen)      | FulmenHQ ecosystem roles           |
| local    | This repo                                                       | Brooklyn-specific roles            |
