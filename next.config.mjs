/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export: the whole dashboard is pre-rendered from data/report.json.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
