# UNIVERS

Simulateur web photoréaliste pour explorer l’Univers, de quelques mètres autour de l’ISS jusqu’aux galaxies voisines. Rendu temps réel (WebGL 2), interface en français, inspiré de SpaceEngine et de NASA Eyes.

## Lancer

```bash
npm install
npm run dev
```

Le site est prévu pour GitHub Pages avec la base `/univers-3d/`.

Build de production :

```bash
npm run build
npm run preview
```

## Déploiement

Le workflow `.github/workflows/pages.yml` construit le projet et le publie sur GitHub Pages à chaque push sur `main`.

URL attendue : <https://blood63.github.io/univers-3d/>

Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**. Le premier déploiement part tout seul une fois cette source sélectionnée.

## Vues directes

Ajouter `?vue=` à l’URL :

| Paramètre | Cadrage |
| --- | --- |
| `iss` | Station spatiale, à quelques mètres |
| `earth` | Terre |
| `saturn` | Saturne et ses anneaux |
| `jwst` | James Webb, côté miroir |
| `m31` | Andromède |
| `bh` | Sagittarius A* |
| `hud` | Même arrivée que l’ISS, HUD visible |

## Pile

Vite, React, TypeScript strict, Three.js / React Three Fiber, shaders GLSL, Zustand pour l’interface, Tailwind. Les positions astronomiques sont en `Float64Array` ; la caméra reste à l’origine du GPU (origine flottante) avec un depth buffer logarithmique. Les ceintures et les trajectoires historiques sont calculées dans un Web Worker.

## Contrôles

- ZQSD (AZERTY) ou WASD, roulis A/E ou Q/E, Espace / C, molette
- Clic sur un astre : warp. Maj+clic : règle cosmique
- `Ctrl+K` recherche, `H` photo, `O` échelle réelle / orrery, `P` pause, `M` silence

Le détail des phases et des cycles de polish est dans `DEVLOG.md`. Les licences des textures sont dans `CREDITS.md`.
