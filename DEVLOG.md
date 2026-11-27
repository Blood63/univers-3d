# DEVLOG — UNIVERS

Journal d’auto-audit. Chaque phase a été compilée (`tsc --noEmit` et `vite build`, 0 erreur TypeScript). Les shaders ont été vérifiés dans Chrome headless (SwiftShader) : pas d’erreur WebGL au chargement des vues ISS, Terre, Saturne, JWST et Andromède.

## Phase 1 — Socle et moteur 64 bits

Validé

- Vite, React 18, TypeScript strict, R3F, Tailwind, Zustand.
- Positions monde dans un `Float64Array`, caméra GPU à l’origine, depth buffer logarithmique, far plan 1e32.
- Post-traitement : ACES, bloom sélectif par luminance, FXAA/SMAA, vignette, aberration chromatique pendant le warp.
- Boucle de vol découplée du rendu React.

Défauts

- Le depth logarithmique et le composer HDR exigeaient un framebuffer half-float, sinon le bloom écrêtait tout.
- Une origine flottante naïve laissait la Terre et l’ISS dans le même `float32` que les galaxies.

Améliorations appliquées

1. Framebuffer `HalfFloatType` et tone mapping uniquement dans le composer.
2. Coquille de rendu pour galaxies, nébuleuses et trous noirs : position angulaire exacte, échelle ramenée sous 1e6 pour le GPU.
3. Presets de qualité (Mobile, Moyen, Élevé, Ultra) qui règlent le `devicePixelRatio` et le bloom.

## Phase 2 — Galaxies et espace profond

Validé

- Voie lactée : ciel procédural (bande, bulbe, poussière) quand la caméra est dans le disque, mesh 3D au-dehors.
- M31, M33, M51, M104, M87 (jet), Nuages de Magellan.
- Nébuleuses M42, M16, M1, Hélice en sprites additifs.
- Champ d’étoiles catalogue (parallaxe) plus champ de fond.

Défauts

- Un disque galactique mis à l’échelle réelle (1e21 m) cassait le `float32` : Andromède devenait un quartier d’ellipse.
- Le bloom avalait les bras spiraux.

Améliorations appliquées

1. Coquille angulaire pour chaque galaxie, disque face à la caméra puis inclinaison de 0,62 rad.
2. Contraste des bras relevé, intensité du disque baissée pour laisser le bloom aux étoiles.
3. Bascule ciel / mesh de la Voie lactée selon la distance au centre galactique.

## Phase 3 — Soleil, étoiles, objets extrêmes

Validé

- Shader solaire : granulation, taches, assombrissement centre-bord, protubérances.
- Spectres O–M, Alpha Centauri, Proxima b, TRAPPIST-1 et ses sept planètes, Kepler-186f, Sirius A/B, Bételgeuse, Rigel.
- Sagittarius A* et Cygnus X-1 : disque, anneau de photons, côté Doppler, horizon noir.
- Pulsar du Crabe, faisceaux ralentis pour rester lisibles (période réelle affichée : 33 ms).

Défauts

- Le repère du disque devenait `NaN` quand la ligne de visée était parallèle à l’axe Y : écran blanc, page figée.
- Bételgeuse et les autres étoiles partageaient la teinte du Soleil.

Améliorations appliquées

1. Axe de référence du shader choisi pour ne jamais être colinéaire à la visée.
2. Uniforme `uTint` par étoile.
3. Halo sprite des étoiles avec une taille angulaire minimale, pour que le Soleil reste un disque depuis la Terre.

## Phase 4 — Planètes et shaders

Validé

- Huit planètes, Pluton, Charon, Cérès. Textures NASA et Solar System Scope.
- Terre : jour, nuit, speculaire, nuages, aurores, atmosphère Rayleigh/Mie.
- Vénus, Mars, Titan : atmosphères dédiées. Jupiter : bandes et Grande Tache Rouge.
- Saturne : anneaux, division de Cassini, ombre du globe sur les anneaux et des anneaux sur le globe. Uranus inclinée, anneaux fins.
- Io (panaches), Encelade (geysers).

Défauts

- L’ombre des anneaux intersectait le plan passant par l’origine, pas par le centre de Saturne.
- Les nuages NASA en palette n’avaient pas d’alpha exploitable.

Améliorations appliquées

1. Intersection rayon / plan de l’anneau recentrée sur la planète.
2. Conversion des nuages en RGBA avant commit.
3. Lumière hémisphérique relevée pour que la face nuit des vaisseaux reste lisible sans effacer le terminateur.

## Phase 5 — Ceintures, comètes, temps, orrery

Validé

- Ceinture principale et ceinture de Kuiper : `InstancedMesh`, éléments générés dans le worker, anneau lointain en repli.
- Halley et 67P, deux queues opposées au Soleil.
- Képler (anomalie, éléments J2000) vérifié : Terre à 1 UA, Jupiter, Neptune, Lune, Voyager 1 ≈ 169 UA en 2026, JWST à ~1,5 million de km de la Terre.
- Barre de temps, date, pause, retour arrière, bascule échelle réelle / orrery qui emporte la caméra avec le corps le plus proche.

Défauts

- `bodyQuaternion` réécrivait les vecteurs temporaires de la poursuite : la caméra filait au centre de la Terre.
- La poursuite filtrait trop lentement et décrochait de plusieurs kilomètres à 7,6 km/s.

Améliorations appliquées

1. Tampons dédiés dans le calcul d’orientation.
2. Poursuite verrouillée sur la position prédite, plus d’intégration en retard.
3. Auto-contrôle képlérien (`scripts/selfcheck.ts`) : Terre, Jupiter, Neptune, Lune, Voyager 1, JWST.

## Phase 6 — Patrimoine spatial

Validé

- ISS (poutre, modules, Cupola, quatre paires de panneaux, Canadarm2, feux).
- Tiangong en T, Hubble, JWST (18 hexagones, bouclier 5 couches), Voyager (antenne, RTG, disque d’or), Parker, Juno, New Horizons.
- Coquilles Starlink, GPS et anneau GEO en instances.
- Trajectoires historiques Voyager 1, Voyager 2 (survols Jupiter → Neptune) et New Horizons, calculées dans le worker.

Défauts

- JWST était à contre-jour, entièrement noir.
- L’ISS à 8 m du centre géométrique traversait la poutre.

Améliorations appliquées

1. Or JWST plus émissif, cadrage de trois-quarts côté miroir.
2. Point de vue ISS à environ 22 m du centre, au-dessus de la poutre, Terre en arrière-plan.
3. Orientation ISS : +Y radial, panneaux dans le plan de la station.

## Phase 7 — Vol, warp, visites, audio

Validé

- 6 degrés de liberté, AZERTY et QWERTY, inertie, vitesse proportionnelle à la distance au corps le plus proche, molette logarithmique.
- Warp : interpolation smoothstep, ouverture du champ, étirement des étoiles, mise en orbite ou en poursuite à l’arrivée.
- Quatre visites guidées, textes synchronisés.
- Nappe Web Audio, souffle radio près de Jupiter et Saturne, bip d’interface, sourdine.

Défauts

- Le premier `lookAt` du warp enregistrait l’arrivée comme quaternion de départ : demi-tour au lancement.
- Ctrl restait enfoncé après Ctrl+K et faisait descendre le vaisseau.

Améliorations appliquées

1. Quaternion de départ capturé avant le calcul de l’arrivée.
2. La touche Contrôle est relâchée quand la recherche s’ouvre.
3. Durée de warp bornée entre 2,5 s et 8 s selon le logarithme de la distance.

## Phase 8 — HUD et outils

Validé

- Verre sombre, Outfit / IBM Plex Mono, tout le texte en français.
- Ctrl+K avec filtres par catégorie.
- Fiche : distance à la Terre, diamètre, masse, gravité, température, atmosphère, spectre, découverte.
- Calques, qualité, bloom, densité stellaire, comparateur de tailles, règle cosmique (lumière, Voyager 1 à 17 km/s, vaisseau à 60 km/s).
- Mode photo : H masque le HUD, exposition, capture PNG. Joystick tactile si pointeur grossier.

Défauts

- Le compteur de draw calls lisait le tampon après reset du composer et affichait 0 ou 1.
- Le comparateur cadrait la caméra à z = 10, donc les planètes de 10 000 km sortaient du champ.

Améliorations appliquées

1. Le compteur ignore les lectures nulles.
2. Caméra du comparateur recadrée sur le plus grand rayon.
3. Règle cosmique branchée sur les positions réelles, pas sur l’échelle orrery.

## Phase 9 — Audit des vues critiques

Vues capturées (Chrome headless, WebGL SwiftShader, 1600×900) :

- ISS à quelques mètres, Terre en fond, panneaux et modules lisibles.
- Terre : nuages, océans, terminateur, aurore.
- Saturne : bandes, division de Cassini, ombre mutuelle.
- JWST à L2 : hexagones dorés, bouclier, Soleil dans le champ (0,811 UA dans la fiche, ordre de grandeur du point L2 vu depuis le télescope).
- Andromède : disque hors de la Voie lactée, échelle intergalactique.
- HUD complet en français.

Aucun `pageerror` ni erreur shader sur ces vues. SwiftShader avertit qu’il est un repli logiciel ; ce n’est pas une erreur de l’application.

Défauts restants assumés

- Andromède reste un disque lumineux : les bras sont dans le shader mais peu contrastés une fois le disque réduit à quelques centaines de pixels.
- Le disque de Sagittarius A* est un modèle analytique (anneau, Doppler, horizon), pas un raymarch complet : le raymarch de 40 pas figeait SwiftShader et produisait des `NaN`.
- Les draw calls restent sous-estimés à cause du composer.

Améliorations appliquées

1. Coquille numérique pour tout objet au-delà de 500 km-rendus, pour que M31 et Sgr A* ne sortent plus du `float32`.
2. Shader de trou noir sans boucle, axe de visée sécurisé.
3. `try/catch` autour du boot pour qu’une vue extrême ne laisse pas le canvas sans drapeau `ready`.

## Phase 10 — Cinq cycles de polish

### Cycle 1 — Atmosphères

Terre, Vénus, Mars et Titan passent par le même intégrateur (6 pas primaires, 3 pas vers le Soleil), coefficients et épaisseur par corps. Aurores polaires ajoutées sur la face nuit.

### Cycle 2 — Anneaux

Cassini déplacée à 68 % du profil (rayon réel ~2,02 R), division d’Encke suggérée, ombre du globe par intersection sphère, ombre des anneaux sur le globe, transparence qui dépend de l’incidence.

### Cycle 3 — Sondes

Grille de cellules solaires générée sur canvas. JWST : 18 hexagones sans miroir central, cinq membranes. Voyager : coupelle, trois RTG, mât, disque d’or. ISS : feux de navigation émissifs pris par le bloom.

### Cycle 4 — Warp

Étirement des sprites le long de la vitesse écran, FOV +18° au milieu du trajet, slerp de quaternion, fin en orbite ou en poursuite. La cible est relue pendant le vol pour suivre une planète qui bouge.

### Cycle 5 — HUD

Hiérarchie verre / ambre / bleu, données mono tabulaire, recherche clavier, visites au-dessus de la barre de temps, mode photo séparé du HUD scientifique. Bascule AZERTY/QWERTY explicite dans l’aide.

## Après les cinq cycles

Corrections encore faites parce qu’elles changeaient l’image :

- Poursuite et quaternion ne partagent plus les mêmes vecteurs (la caméra tombait dans la Terre).
- JWST cadré de côté, or émissif, pour que le miroir existe à l’image.
- Galaxies face caméra : plus de quartier d’ellipse dû au `float32`.
- Anneau du trou noir relu à ~80 rayons de Schwarzschild, sans `NaN`.

Le dernier passage, après la coquille numérique, a été revu dans le navigateur : Andromède montre ses bras spiraux, et Sagittarius A* un anneau orange autour d’un horizon noir.

## Cycles de polish supplémentaires

Les captures « avant » sont celles de la v1. Les captures « après » sont les vues régénérées sur la même branche.

### Cycle 6 — Terre

Avant : limbe bleu correct, aurore en bande, peu de reflet d’océan.

Après : reflet spéculaire serré sur les océans (carte speculaire), ombre des nuages décalée vers le Soleil, lumières de villes poussées au-dessus de 1 pour le bloom, aurores en rideaux animés vert et violet. L’atmosphère ajoute un terme de Mie orangé quand le rayon vise le Soleil.

### Cycle 7 — Soleil

Granulation à deux octaves, ombre et pénombre des taches, couronne additive en coquille (2,6 rayons) dont l’intensité a été baissée pour ne plus laver le ciel. Les orbites planétaires se masquent quand la caméra est à moins de 12 rayons solaires, pour ne plus barrer le disque.

### Cycle 8 — Saturne

Profil d’anneau resserré : Cassini pleine, division d’Encke, fines bandes radiales, diffusion vers l’avant quand on regarde à contre-jour, ombre du globe conservée. La Grande Tache Rouge gagne un col clair.

### Cycle 9 — Sondes

L’ISS n’est plus une poutre pleine : longerons, entretoises tous les 4 m, radiateurs, modules en MLI or (texture de feuille froissée), panneaux cuivrés, hublots de Cupola, bras segmenté. Io et Encelade ont des panaches plus hauts. Les nébuleuses passent de 14 à 26 sprites.

### Cycle 10 — Échelles et coût

Les meshes planétaires et leurs atmosphères se coupent sous un seuil angulaire (environ 1,6 px pour le globe, 7 px pour l’atmosphère) afin d’éviter le tremblement d’un sphère de 6 000 km perdue dans un `float32` galactique. Les ceintures et les coquilles Starlink/GPS/GEO ne mettent à jour leurs matrices que lorsque la caméra est dans le système. Les trajectoires de sondes réutilisent leur buffer au lieu d’en allouer un par frame.

### Cycle 11 — HUD et mobile

Le calque de gauche est masqué sous 768 px. La qualité Mobile reste sélectionnée automatiquement sur pointeur grossier. Le compteur de draw calls ignore les lectures vides du composer.

### Cycle 12 — Les trois écarts fermés

Trace au sol. Une orbite d’ISS (pas de 92,68 min) est projetée dans le repère tournant de la Terre (obliquité 23,44°, jour sidéral) et dessinée à 1,012 rayon, enfant du globe, donc collée aux continents. Calque « Trace au sol ISS », coché par défaut. Visible sur la vue Terre comme un arc ambre qui traverse l’Afrique et l’Atlantique.

Lentille. Sagittarius A* et Cygnus X-1 dévient le ciel et les étoiles de fond avec l’approximation de Schwarzschild : angle d’Einstein θ_E² = 2 R_s / D, image primaire θ = ½ (β + √(β² + 4 θ_E²)) pour les étoiles, et β = θ − θ_E²/θ pour le ciel (y compris l’image secondaire de l’autre côté de l’axe). Les rayons de Schwarzschild passés au shader sont ceux de la coquille de rendu, donc la déviation a la bonne taille angulaire quand on s’approche. Autour de Sgr A*, le ciel se tord en anneau et des étoiles proches deviennent des arcs.

Compteur. `gl.info.autoReset` est coupé. La lecture se fait dans un `useFrame` de priorité 2, après le `EffectComposer` (priorité 1), puis le compteur est remis à zéro. Les draw calls ne sont plus écrasés par le blit final. Contrôle headless : ISS 94 appels, Terre 203, Sgr A* 302, zéro `pageerror` et zéro erreur shader. Les FPS sont une moyenne sur 400 ms. Sur SwiftShader ils restent bas (quelques images à quelques dizaines) ; le compteur lui-même suit le vrai coût, et un GPU de bureau n’a pas ce plafond logiciel.

La grille galactique (plan orienté vers le pôle galactique, centrée sur la caméra) et le calque débris (points en orbite basse) répondent enfin à leur case, qui ne faisait rien.

### Revue finale, sections 03 à 08

- 03 Moteur : Float64, origine flottante, depth logarithmique, worker, six échelles avec coupure angulaire, ACES + bloom + FXAA/SMAA.
- 04 Univers : Voie lactée, M31, M33, M51, M104, M87 et son jet, Nuages de Magellan, M42, M16, M1, Hélice, Soleil animé, huit planètes, Pluton, Charon, Cérès, lunes demandées, ceintures, Halley et 67P, Alpha Centauri, TRAPPIST-1, Kepler-186, Sirius, Bételgeuse, Rigel, Sgr A* et Cyg X-1 avec lentille, pulsar du Crabe.
- 05 Patrimoine : ISS, Tiangong, Voyager 1 et 2, JWST, Hubble, Parker, New Horizons, Juno, Starlink, GPS, GEO, débris optionnels, trace au sol de l’ISS.
- 06 Outils : Képler J2000, temps, orrery, comparateur, règle (km, UA, années-lumière, lumière, Voyager, 60 km/s).
- 07 Vol : 6 DoF, vitesse logarithmique, warp, orbite / surface / poursuite, quatre visites, photo, Web Audio.
- 08 HUD : verre, Ctrl+K, télémétrie, calques (orbites, trajectoires, trace, étiquettes, constellations, grilles écliptique et galactique, zone habitable, héliosphère, débris), presets, FPS et draw calls lus après le composer.

Vérification : `tsc --noEmit` propre, build Vite propre, Chrome headless sans erreur de console ni de shader sur les vues ISS, Terre et Sgr A*.
