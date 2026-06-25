# sebtest — Bitcoin : cours sur 10 ans & coût de minage

Tableau de bord de trading Bitcoin (Next.js + TypeScript).

## Fonctionnalités

- **Cours du BTC sur 10 ans** (échelle logarithmique).
- Périodes **daily / weekly / yearly** et style **bougies / ligne**.
- **Coût de création (minage) d'un BTC en Chine** : ligne de référence sur le graphique, calculée à partir d'hypothèses ajustables (prix de l'électricité, efficacité du parc en J/TH, hashrate réseau, subvention de bloc).
- Devise **USD ⇄ CHF** convertie au taux du jour.

## Sources de données (gratuites, sans clé, côté navigateur)

| Donnée | API |
|---|---|
| Historique OHLC BTC/USD (depuis 2015) | Coinbase Exchange (`api.exchange.coinbase.com`) |
| Hashrate réseau | mempool.space |
| Taux USD→CHF du jour | frankfurter.dev (BCE) |

## Démarrer

> ⚠️ Nécessite **Node ≥ 18.18** (le projet est validé sous Node 22). Si `node -v` affiche une version trop ancienne : `nvm use 22`.

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3000.

## Méthode de calcul du coût de minage

```
coût / BTC = (hashrate × efficacité × 24 h × prix_électricité) / (144 blocs × subvention)
```

Le calcul utilise par défaut : électricité 0,06 $/kWh, efficacité 25 J/TH, subvention 3,125 BTC (halving d'avril 2024). Toutes ces valeurs sont modifiables dans l'interface.
