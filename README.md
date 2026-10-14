# iroom market

Node.js 24 + Express + Turso. Includes the storefront, Telegram Mini App support, admin panel, and Digital Goods categories.

## Render
- Build command: `npm install`
- Start command: `npm start`
- Required environment variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BOT_TOKEN`, `MINIAPP_URL`.

## Digital Goods
Categories are created on startup if missing: PlayStation / PS Plus, Подписки, Другое, Apple / iTunes, Telegram Stars. Products can be configured for manual or automatic fulfillment in the admin panel.

## Product images
No sample product images are included in this ZIP to make GitHub upload easier. Add images later from the admin panel. Uploaded product images are stored in the database as data URLs, so they do not depend on Render's temporary local filesystem.

## Upload to GitHub from iPhone
Extract the ZIP in Files, open the repository on GitHub, choose Add file → Upload files, select the contents of `iroom-market-project`, then commit. Deploy latest commit in Render.

Important: configure environment variables in Render and test the live database and Telegram bot before taking real orders.
