import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "COVE — Your AI Sales Assistant",
    short_name: "COVE",
    description: "Live car-sales board, pipeline, and AI outreach.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e16",
    theme_color: "#0b0e16",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
