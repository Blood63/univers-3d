# Crédits et licences

Le code de l’application est sous licence MIT (voir `LICENSE`). Les cartes photographiques restent sous leur licence d’origine et ne sont pas couvertes par le MIT.

L’application affiche ces mentions dans le panneau Crédits. Les textures photographiques sont redistribuées dans `public/textures/` avec leur licence d’origine. Le reste du ciel (bras spiraux, nébuleuses, étoiles de fond, anneaux fins, lunes sans carte libre satisfaisante) est généré procéduralement dans l’application.

Attribution obligatoire :

- Solar System Scope — cartes planétaires, CC BY 4.0 — https://www.solarsystemscope.com/textures/
- ESA / Planck Collaboration — fond diffus cosmologique SMICA, CC BY 4.0

## Domaine public — NASA, via les exemples three.js (r170)

- `earth_day.jpg`, `earth_night.jpg`, `earth_clouds.png`, `earth_normal.jpg` (non câblé au shader final), `earth_spec.jpg`
- Source : <https://github.com/mrdoob/three.js/tree/r170/examples/textures/planets>
- Les cartes terrestres des exemples three.js sont des produits NASA (Blue Marble / lumières nocturnes). Domaine public.

## CC BY 4.0 — Solar System Scope

- `sun.jpg`, `mercury.jpg`, `venus.jpg`, `mars.jpg`, `jupiter.jpg`, `saturn.jpg`, `saturn_ring.png`, `uranus.jpg`, `neptune.jpg`, `moon.jpg`, `ceres.jpg`
- Auteur : Solar System Scope
- Licence : Creative Commons Attribution 4.0
- <https://www.solarsystemscope.com/textures/>

Merci de conserver la mention « Solar System Scope (CC BY 4.0) » si vous réutilisez ces fichiers.

## Libre d’utilisation, crédit apprécié — Planet Pixel Emporium

- `pluto.jpg` (carte cylindrique issue de `plutomap1k`, James Hastings-Trew)
- <http://planetpixelemporium.com/>
- L’auteur autorise l’usage y compris commercial ; un crédit est apprécié.

## CC BY 4.0 — Solar System Scope, via Wikimedia Commons

Cartes 8k réduites à 3840×1920 pour le chargement progressif (aperçu 512 px, puis la carte pleine) :

- `earth_day.jpg`, `earth_night.jpg`, `earth_clouds.jpg`, `earth_normal.jpg` (normale tangentielle), `moon.jpg`, `mars.jpg`, `mercury.jpg`
- Fichiers d’origine : « Solarsystemscope texture 8k … »
- Auteur : Solar System Scope
- Licence : Creative Commons Attribution 4.0
- <https://commons.wikimedia.org/> et <https://www.solarsystemscope.com/textures/>

## Domaine public — NASA / USGS / Galileo / Voyager / Cassini

- `io.jpg` — mosaïque Galileo et Voyager, Wikimedia « Io from Galileo and Voyager missions », domaine public NASA.
- `europa.jpg` — « Moon Europa color map », CC0.
- `ganymede.jpg`, `callisto.jpg` — albédo dérivé des planches USGS (domaine public), fortement lissé pour retirer le graticule et les noms, puis recraterisé. Ce ne sont plus les planches annotées.
- `enceladus.jpg` — « Enceladus Color Map », domaine public.
- `titan.jpg` — mosaïque Cassini « Titan map April 2011 », domaine public.
- `cmb.jpg` — « Cosmic Microwave Background (Planck-CMB-SMICA) », ESA/Planck, CC BY 4.0. Carte équirectangulaire des anisotropies SMICA, réduite à 3840×1920.

## Tuiles distantes, chargées à la volée (non embarquées)

- Terre : NASA GIBS, couche Blue Marble Next Generation, grille EPSG:4326 `500m`. <https://nasa-gibs.github.io/gibs-api-docs/>
- Lune : OpenPlanetaryMap, fond LRO WAC (`opm-moon-basemap-v0-1`).
- Mars : OpenPlanetaryMap, mosaïque couleur Viking (`opm-mars-basemap-v0-1`).
- Les tuiles ne sont demandées que pour la face sous la caméra, avec un cache LRU. En cas d’échec, les tuiles locales `public/textures/tiles/` restent le repli.

## Procédural

Triton, Charon, la Voie lactée, les galaxies, les nébuleuses, le champ d’étoiles de fond, les halos et le micro-relief (bruit 3D sous trois rayons) sont dessinés par shaders ou par canvas. Le micro-détail se superpose aux cartes photographiques ; il ne les remplace pas.
