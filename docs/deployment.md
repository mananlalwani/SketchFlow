# Deployment

## Cloudflare Pages (Frontend)

1. Go to [Cloudflare Pages](https://pages.cloudflare.com)
2. Connect your GitHub repository
3. Configure build settings:
   - **Build command**: `pnpm build:client`
   - **Build output**: `dist`
4. Add environment variable:
   - `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key
5. Deploy

Your app will be live at `https://your-project.pages.dev`

## Optional: Backend

For the full real-time sync features, you'll need a backend server. For portfolio demos, you can:

- Run locally: `pnpm dev` and demo on localhost
- Deploy to any Node hosting (Railway, Render, Fly.io)

The frontend works standalone for drawing - real-time sync just won't work without the backend.
