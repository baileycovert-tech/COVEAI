/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets scripts/deploy.sh build into a temp dir (.next.new) while the live server keeps serving
  // the current .next — so the Cloudflare-fronted site stays up through the slow build and only
  // blips for the ~3s restart. `npm run start` uses the default .next (no env set).
  distDir: process.env.COVE_DIST_DIR || ".next",
  // Data files live in /data and are read at request time so edits/sync show up live.
  // better-sqlite3 is a native module — don't bundle it (used for the contacts index).
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};

export default nextConfig;
