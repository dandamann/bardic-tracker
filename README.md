# Bardic Inspiration tracker

A list of your party showing who has Bardic Inspiration. Tap a character to add or remove it.
Everyone who opens the app sees the same state, refreshed every 3 seconds.

## Docker

    docker compose up -d --build

Open http://localhost:3000, or http://<host-ip>:3000 from other devices.
State is kept in the `bardic-data` volume. `docker compose down -v` deletes it.

## Without Docker

    npm start     # saves to data/state.json
    npm test

## Vercel

1. Deploy this folder (`npx vercel`, or import the Git repo; set the root directory if needed).
2. In the project's Storage / Marketplace tab, add **Upstash Redis** and connect it to the project.
   This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names also work).
3. Redeploy so the variables take effect (`npx vercel --prod`).

Preview and production deployments share state if they use the same database.
Set `STATE_KEY` to a different value per environment to separate them.

An open, visible tab makes about 1,200 requests (and Redis reads) per hour.
Compare that with your plan limits; raise `POLL_MS` in `public/app.js` to reduce it.

## Passcode (optional)

Without one, anyone with the URL can view and edit. Set `APP_PASSCODE` to require it:

    APP_PASSCODE=owlbear docker compose up -d

On Vercel, add it as an environment variable and redeploy.
