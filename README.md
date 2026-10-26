# Plexys Homework Task

A Corteza 2026.9 back-end paired with a Vue 3 single-page app for
managing **Support Tickets** and their **Customers**. Corteza serves the app
itself, at `http://localhost:18080/tickets/`, and the app signs in as the
Corteza user, so records carry that user's identity and permissions.

The full write-up (architecture, decisions, user and admin guide,
limitations) is in [`docs/documentation.pdf`](docs/documentation.pdf).

## Requirements

- Docker with Docker Compose v2
- Node.js 20+ (only for rebuilding from the host with `npm run deploy` or
  running the dev server; `docker compose up` builds the app in a container).

## 1. Start Corteza and the app

```bash
cp .env.example .env
```

Set `AUTH_JWT_SECRET` in `.env` to a random value, for example the output of:

```bash
openssl rand -hex 32
```

Then:

```bash
docker compose up -d
```

This runs three services:

| Service | What it does |
|---|---|
| `spa-build` | One-shot: `npm ci && vite build` in a Node container, writes `spa/dist`, then exits. |
| `server` | Corteza 2026.9 on `http://localhost:18080`. Starts after the build, and serves `spa/dist` at `/tickets/`. |
| `db` | PostgreSQL 15. Data lives in `./data/` (git-ignored). |

The first start takes a minute or two (image pulls, `npm ci`).
`docker compose ps` shows `server` as `healthy` when it is ready.

## 2. First-run setup in Corteza (once, in the browser)

1. Open http://localhost:18080 and sign up. The first account becomes the
   super-admin. There are no shipped credentials: use the account you create.
2. In **Low Code**, create a namespace named `Plexys Homework` with the slug
   **`plexys-hw`**.
3. In that namespace, create these modules in this order (a Record field
   needs its target module to exist). `*` = required.

   **Customer** (handle `customer`)

   | Field | Type | Notes |
   |---|---|---|
   | `name`* | String | |
   | `contact_name` | String | label "Contact person" |
   | `contact_email`* | Email | |
   | `phone` | String | |
   | `website` | Url | |
   | `tier`* | Select | `standard`, `premium`, `enterprise`; default `standard` |
   | `active` | Bool | default checked |
   | `notes` | String | multi-line |

   **Support Ticket** (handle `ticket`)

   | Field | Type | Notes |
   |---|---|---|
   | `subject`* | String | |
   | `description` | String | **multi-line** |
   | `status`* | Select | `new`, `in_progress`, `resolved`, `closed` |
   | `priority`* | Select | `low`, `medium`, `high`, `urgent` |
   | `due_date` | Date/Time | |
   | `customer`* | Record | module **Customer**, label field `name` |

4. Open **http://localhost:18080/tickets/** and choose **Sign in with Corteza**.

No auth client needs to be created: the app uses Corteza's built-in default
client, exactly like Corteza's own web apps.

## Configuration

Docker Compose reads the root `.env` (template: `.env.example`). Builds run
on the host (`npm run deploy`, `npm run dev`) read `spa/.env` instead (see
[Changing the app](#changing-the-app)).

| Variable | Default | Purpose |
|---|---|---|
| `VERSION` | `2026.9` | Corteza image tag. |
| `DOMAIN` | `localhost:18080` | Host and port Corteza is reached at; it builds its own URLs from it (e.g. the auth URL in `config.js`). |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `corteza` | Postgres credentials (local defaults). |
| `HTTP_WEBAPP_ENABLED` | `true` | Lets Corteza serve web apps, this one included. |
| `AUTH_JWT_SECRET` | — | Required. Signs Corteza's tokens and prevents invalidation of session when rebuilding the application. |
| `ACTIONLOG_ENABLED` | `true` | Corteza's audit trail; set explicitly in case of changes to default behavior. |
| `HTTP_WEBAPP_LIST` | `admin,compose,workflow,reporter,privacy,tickets` | Corteza's web apps. `tickets` is this app; the name is also its URL path. |
| `AUTH_DEFAULT_REDIRECT_URIS` | `http://localhost:5173` | Only for the dev server (below). Not needed when Corteza serves the app. |
| `VITE_NAMESPACE` | `plexys-hw` | Namespace slug the app opens. Baked in at build time. |

Changing `VITE_*` needs a rebuild: `docker compose up -d --force-recreate spa-build server`.
Changing a server setting needs a new container, not just a restart
(`docker compose restart` keeps the old values): `docker compose up -d --no-deps --force-recreate server`.

## Changing the app

After editing files in `spa/`, rebuild and restart Corteza in one step:

```bash
cd spa
cp .env.example .env
npm install
npm run deploy
```

`cp` is needed once: the build runs on the host and reads `VITE_NAMESPACE`
from `spa/.env`, not from the root `.env`. Without it the app is built with
an empty namespace slug and does not open `plexys-hw`.

`deploy` runs `vite build` and then `docker compose restart server`. The
restart is required: Corteza reads each web app's `index.html` once at
start-up, and keeps serving the old one (pointing at deleted assets) until
it restarts.

### Dev server (optional)

```bash
cd spa
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. The Vite server proxies `/api` and `/auth` to
Corteza and serves a stand-in `config.js`, so the code path matches
production. Corteza must allow the dev origin, which the root
`.env.example` does with `AUTH_DEFAULT_REDIRECT_URIS`. The dev sign-in was
checked only up to the redirect (see `docs/observations.md`).

## Layout

```
docker-compose.yaml        Corteza + Postgres + one-shot SPA build
.env.example               All settings (copy to .env)
docs/documentation.pdf     The documentation (source: documentation.html)
spa/
  index.html               <base href> placeholder + Corteza's config.js
  vite.config.js           Relative base; dev proxy and dev config.js
  src/
    main.js, App.vue       Session restore, top bar, section nav
    router.js              Routes (/, /<module handle>, sign-in, callback), auth guard
    config.js              Runtime settings from window.CortezaAPI / CortezaAuth
    auth/oauth.js          Default-client sign-in (Vue 3 port of corteza-vue's flow)
    api/client.js          corteza-js API clients, error normalising, 401 retry
    api/records.js         Record CRUD, counts, validation, label and user lookups
    api/query.js           Corteza filter builders with value escaping
    composables/           useSchema (namespace + modules), useRecordList
                           (search, sort, paging from the URL), useMediaQuery
    components/            RecordTable, RecordCards, RecordValue, RecordActions,
                           RecordFormDialog, DeleteRecordDialog, ConfirmDialog,
                           BaseDialog, FieldInput, RecordPicker
    utils/format.js        Select options, badge colours (contrast-checked)
    views/                 RecordList (table or cards, dialogs), SignIn,
                           AuthCallback
```
