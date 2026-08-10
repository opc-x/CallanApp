import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CallanApp",
    short_name: "Callan",
    description: "Callan Method 词组与例句，按课时刷",
    start_url: "/zh",
    display: "standalone",
    background_color: "#fcfbf8",
    theme_color: "#634bdd",
    icons: [
      { src: "/manifest-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/manifest-icon/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/manifest-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/manifest-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
