import Dashboard from "./Dashboard";
import { getData } from "./lib/data";

// Données récupérées côté serveur (depuis le cache SQLite) et injectées dans la
// page : le graphique a ses données dès le premier rendu, sans aller-retour réseau.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  const { daily, hashrateHs, fx } = await getData();
  return <Dashboard initialDaily={daily} hashrateHs={hashrateHs} fx={fx} />;
}
