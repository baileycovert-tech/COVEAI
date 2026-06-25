/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Data files live in /data and are read at request time so edits/sync show up live.
  // better-sqlite3 is a native module — don't bundle it (used for the contacts index).
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};

export default nextConfig;
