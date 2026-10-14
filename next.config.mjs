/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export: the whole dashboard is pre-rendered from data/report.json.
  output: "export",
  // GitHub Pages serves the site under /<repo>/; set by the Pages workflow, empty elsewhere.
  basePath: process.env.NEXT_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
