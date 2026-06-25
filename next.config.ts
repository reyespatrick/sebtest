import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Des lockfiles parasites existent dans les dossiers parents : on fixe
  // explicitement la racine du projet, sinon Turbopack infère /Users/patrick
  // comme racine et casse la résolution des modules internes de Next.
  turbopack: { root: "/Users/patrick/VMSharedFolder/Projects/sebtest" },
  // Module natif : ne pas le bundler côté serveur.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
