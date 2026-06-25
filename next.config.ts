import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plusieurs lockfiles existent plus haut dans l'arborescence : on fixe
  // explicitement la racine du projet pour éviter un mauvais workspace root.
  turbopack: { root: __dirname },
};

export default nextConfig;
