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

## V2 — expansion cosmique (1 m → 46,5 Gal)

Base mesurée sur `main` avant cette branche (build Vite 2,93 s, script 1 279 900 octets). Mesures « après » : build Vite 2,81 s, script 1 320 772 octets. Les FPS ci-dessous sont ceux de Chrome headless SwiftShader, pas d’un GPU de bureau : ils restent bas (quelques images à quelques dizaines). Le budget de draw calls, lui, est tenu sur le préréglage Élevé.

| Vue | FPS (SwiftShader) | Draw calls |
| --- | --- | --- |
| Système solaire | ~3–13 | 122 |
| ISS | ~10–11 | 34 |
| Terre | ~14 | 49 |
| Saturne | ~11–15 | 103 |
| Voyager 1 | ~5 | 30 |
| Sagittarius A* | ~5 | 51 |
| Andromède | ~5 | 36 |
| Fond diffus | ~3–4 | 78 |

Zéro `pageerror`, zéro erreur console, zéro shader sur ces huit vues. La vue aérienne, R, le cadrage sans verrouillage et l’arrêt du suivi au panoramique ont été rejoués.

### Phase 1 — Audit et zéro allocation

Avant : script 1,28 Mo, une allocation `Object.keys` et un `v3()` à chaque frame sur le calcul de L2, un `clone()` de vecteur sur les comètes.

Après : mêmes ordres de FPS SwiftShader, draw calls système ramenés ensuite sous 140 (phase 11).

Défauts corrigés

1. `updateNearest` recréait la liste des identifiants à chaque image.
2. Le placement L2 (JWST) allouait un vecteur « up » à chaque frame.
3. Les queues de comètes clonaient la position du Soleil et un point de visée à chaque image.

Le HUD se rafraîchit à 12,5 Hz (80 ms). Les textures NASA passent par un cache qui les décharge au-delà d’environ 1 800 al et les recharge au retour dans le système.

### Phase 2 — Dix échelles

`echelleOf` découpe 1 m → 46,5 Gal (E1 à E10). L’ancienne bande (sonde, planétaire, système…) reste dérivée, pour ne pas casser les calques. Le fil d’Ariane et la jauge lisent E1–E10. Les galaxies, nébuleuses, le nuage d’Oort et la toile sont placés sur la coquille de rendu : le GPU ne voit jamais un `float32` à 10²⁴ m.

Défauts corrigés

1. Un `dt` utile trop court n’est pas revenu : le plafond 0,1 s de la vue aérienne est conservé.
2. Les nébuleuses (26 sprites chacune) restaient dessinées dans le système solaire : elles ne s’allument qu’à partir de E5, sauf sélection.
3. Les trajectoires interstellaires en `float32` barraient la vue ISS : elles sont masquées sous E3.

### Phase 3 — Micro-détails

Bruit 3D sur la sphère (pas de couture UV) quand la caméra passe sous trois rayons : normale et rugosité. Oren-Nayar sur Mercure et la Lune. Anneaux : profil D, C, B, Cassini, A, Encke, F, et scintillement de glace en vue très proche. Anisotropie au maximum du GPU, mipmaps trilinéaires.

Défauts corrigés

1. La perturbation de normale à 0,55 donnait un damier sur la Terre : ramenée à 0,22.
2. Hauméa n’avait pas d’anneau fin : flag `rings-thin`, rayons 1,42–1,72.
3. Japet n’avait pas d’hémisphère sombre : uniforme `uTwoTone`.

### Phase 4 — Atmosphères et Soleil

Le shader d’atmosphère Rayleigh/Mie est inchangé dans sa structure et sert toujours Vénus, Mars, Titan et la Terre. Le Soleil garde granulation, taches et protubérances. Le bloom ACES passe le seuil de 1,08 à 1,14 pour moins laver les limbes. Vénus a un défilement de texture (super-rotation). Un repli procédural remplace une texture NASA qui échoue.

Défauts corrigés

1. Le chargement d’une texture en échec renvoyait un gris 1×1.
2. L’anisotropie était figée à 8, sous le maximum du GPU.
3. Aucun fondu de texture au retour d’une session lointaine : le rechargement est branché sur les matériaux.

### Phase 5 — Système solaire profond

Éris et Dysnomie, Hauméa (ellipsoïde + anneau), Makémaké, Sedna (orbite jusqu’à ~937 UA), Arrokoth (bilobe). Lunes : Phobos, Deimos, Mimas, Japet, Rhéa, Dioné, Miranda, Ariel, Obéron. Héliopause déformée (choc terminal à 90 UA, enveloppe à 120 UA). Nuage d’Oort instancié entre 2 000 et 50 000 UA, calque dédié.

Défauts corrigés

1. Sedna sur une ligne d’orbite en `float32` était instable : l’orbite reste calculée, le tracé écran est omis.
2. L’héliosphère était une sphère : échelles 1,08 / 0,84 / 1,55, allongée dans le vent.
3. Le calque héliosphère ne montrait pas le choc terminal.

### Phase 6 — Étoiles, nébuleuses, amas

Quinze étoiles ajoutées (Barnard, Wolf 359, ε Eridani, τ Ceti, Véga, Arcturus, Aldébaran, Antarès, η Carinae, VY CMa, UY Scuti, Polaris, 51 Peg, HD 189733, 55 Cnc) et trois planètes (51 Peg b, HD 189733 b, 55 Cnc e). Nébuleuses : Carène, Anneau M57, Œil de Chat, Pléiades. Amas : Oméga du Centaure et M13, chacun en nuage de points. Secteurs stellaires déterministes autour de la caméra en E5–E7.

Défauts corrigés

1. Le secteur stellaire réécrivait ses positions monde dans le buffer GPU et les perdait : deux tableaux, monde en Float64 et écran en Float32.
2. Une grille 361³ pour la toile a été abandonnée avant de geler le chargement (remplacée par des filaments directs, phase 8).
3. Les étoiles lointaines gardaient un halo forcé à 2 % de la distance : le halo suit maintenant la taille angulaire réelle.

### Phase 7 — Extragalactique

M32, M110, NGC 6822, Antennes (queue de marée), Centaurus A (bande de poussière + jet), Roue de Chariot, M101, Laniakea, Grand Attracteur, Persée-Poissons, Coma, Shapley. Le jet de M87 est celui de la v1, conservé.

Défauts corrigés

1. Les galaxies « vides » et l’horizon CMB auraient eu un disque plein : échelle du mesh ramenée à 0,15.
2. Le courant magellanique n’existait pas : un segment LMC–SMC en E6–E7.
3. Centaurus A n’avait pas de bande sombre : un plan local sur le flag `dustlane`.

### Phase 8 — Toile et fond diffus

Filaments instanciés (quelques milliers de galaxies de champ, elliptiques dorées au cœur des brins, spirales plus bleues), visibles à partir de E8. Étiquettes : Vide du Bouvier, Supervide de l’Éridan, Grand Mur de Sloan, Grand Mur d’Hercule-Couronne. Sphère CMB, shader d’anisotropies, fondu au-delà d’environ 8 milliards d’années-lumière, pleine vers 46,5 Gal.

Défauts corrigés

1. Le premier essai de toile parcourait une grille cubique inutilisable au démarrage.
2. Les positions en Gly ne tiennent pas dans un `float32` : coquille de rendu, comme pour M31.
3. La sphère CMB compilait sans les en-têtes `logdepthbuf` : les `include` three.js ont été ajoutés.

### Phase 9 — Patrimoine

Feux de navigation nommés, clignotement sur l’ISS et les autres engins qui en ont. Disque d’or de Voyager avec un sillon. Bouclier de Parker émissif sous 0,28 UA. Nouveaux modèles : Gaia, Euclid (L2), Pioneer 10 et 11, Cassini, Rosetta (près de 67P), Gateway (NRHO), Apollo 11 sur la Lune. Le cadrage de chaque engin a un offset, pour ne pas naître dans la coque.

Défauts corrigés

1. Les nouveaux engins tombaient sur l’offset nul et la caméra entrait dans le mesh.
2. Apollo 11 était écrit dans le tampon temporaire de l’éphéméride, qui sert aussi au parent : la Lune était écrasée. Le résultat est écrit dans le tampon de sortie.
3. Pioneer n’avait pas de trajectoire dans le worker : deux polylignes de plus.

### Phase 10 — HUD

Fil d’Ariane cliquable (Univers observable → … → l’astre le plus proche). Jauge logarithmique verticale, 5 m → 46,5 Gal, qui pose la distance aérienne sans verrouiller. Visites « Puissances de Dix » et « Exoplanètes et géantes ». Profil repliable : FPS, temps de frame, draw calls, triangles, textures, objets actifs, qualité, biais de DPR. R et « Vue Système Solaire » inchangés. Le suivi s’éteint toujours au panoramique.

Défauts corrigés

1. Le sélecteur de mode et le fil d’Ariane se faisaient recouvrir par les étiquettes : le pied de page et le fil sont au-dessus.
2. Le compteur ne montrait pas les triangles ni les textures du compositeur : lecture après le `EffectComposer`, priorité 2.
3. La jauge ne pouvait pas traverser les échelles : `setAltitude` pose pivot et distance, sans suivi.

### Phase 11 — Non-régression

`tsc --noEmit` et `vite build` propres. Huit vues critiques sans erreur WebGL. Draw calls Élevé : système 122, ISS 34, Terre 49, Saturne 103, Voyager 30, Sgr A* 51, M31 36, CMB 78. Trace ISS ambrée toujours présente sur la vue rapprochée. Lentille Sgr A* / Cyg X-1 inchangée (aucun shader d’étoile retiré). DPR dynamique : si les FPS restent sous 55 pendant 2 s, le biais baisse jusqu’à 0,75 ; il remonte au-dessus de 70. Le préréglage Mobile reste forcé sur pointeur grossier.

Défauts corrigés

1. Les sprites de nébuleuse comptaient pour plus de cent appels dans la vue système.
2. Les engins lointains gardaient toute leur géométrie : ils disparaissent sous 1,3 px, sauf la cible.
3. Le cadrage Terre après warp restait à ~19 200 km, suivi faux, et la touche D coupait le suivi : rejoué après la v2.

### Phase 12 — Six cycles de polish

1. Photométrie : seuil de bloom 1,14, rayon un peu plus serré, pour laisser les bandes de Saturne et le limbe terrestre.
2. Transitions : opacité de l’Oort, de la toile et du CMB en fonction de l’échelle, pas un interrupteur sec.
3. Micro-détails : normale adoucie, Oren-Nayar, deux tons de Japet, anneau de Hauméa.
4. Caméra : portée du panoramique = minimum entre l’altitude et huit fois la distance à l’astre le plus proche, pour rester précis près d’une planète. Amortissement exponentiel inchangé.
5. Étiquettes : une liste selon l’échelle, et rejet si deux pastilles sont à moins de 28 px (la sélection garde la sienne).
6. Build de production : `base` `/univers-3d/` inchangé, `tsc` et `vite build` propres, zéro erreur console sur les vues critiques.

### Écarts assumés

- Le 60–144 FPS n’a pas été mesuré sur un GPU de bureau. Cette machine n’a que SwiftShader. Les draw calls, eux, sont sous 140 (système) et sous 65 (ISS) au préréglage Élevé.
- Pas de nouvelles cartes USGS multi-gigapixels : les cartes déjà versionnées restent la couche HD, le micro-détail est procédural, et le repli procédural couvre un échec réseau.
- Les ombres mutuelles Io / Europe / Ganymède sur Jupiter ne sont pas calculées. Les ombres anneaux ↔ globe de Saturne le sont.
- Hauméa est un ellipsoïde par échelle de mesh, pas une vraie surface triaxiale.
- Le nuage d’Oort et la toile sont des champs instanciés, pas des corps sélectionnables un par un. Les structures nommées (vides, murs, Laniakea) le sont.
- Le fondu du CMB est une anisotropie procédurale rappelant Planck, pas le fichier HEALPix officiel.

## Cycle rendu — cartes, ombres, Hauméa, Planck

Avant : cartes 2k très compressées (la Terre jour faisait 462 Ko en 4096²), Io et les lunes galiléennes procédurales, Hauméa sphérique, CMB synthétique, pas d’ombre de lune sur Jupiter. Build Vite 2,81 s, script 1 320 772 octets.

Après : build Vite 2,84 s, script 1 326 430 octets, textures `public/textures` ~26 Mo. Chrome headless, 0 erreur console / shader. Draw calls : Terre 56, Lune 59, Jupiter 51, Io 49, Hauméa 48, CMB 78.

Ce qui est fermé

- Terre, Lune, Mars, Mercure : cartes Solar System Scope 8k (CC BY 4.0) ramenées à 3840×1920, plus normale terrestre branchée dans le shader. Aperçu 512 px dès la première frame, carte pleine ensuite. Le mobile (qualité basse) reste sur l’aperçu.
- Io (Galileo/Voyager, domaine public), Europe (CC0), Ganymède et Callisto (planches USGS), Encelade, Titan (Cassini).
- Fond diffus : carte Planck SMICA (ESA, CC BY 4.0) échantillonnée sur la sphère.
- Ombres de transit : Io, Europe et Ganymède sur Jupiter ; Titan, Rhéa et Encelade sur Saturne. Chaque lune reçoit aussi l’ombre de sa planète.
- Hauméa : ellipsoïde 1161 × 852 × 513 km, normales corrigées, anneau fin.
- Aurore terrestre : plus de damier vert au pôle (le masque suivait la normale perturbée).

Défauts corrigés dans ce cycle

1. La normale dérivée explosait vers les pôles et allumait l’aurore en damier.
2. Les nuages JPEG n’avaient pas d’alpha : le shader lit la luminance pour cette carte.
3. Le décodage HD partait avant le choix Mobile / Élevé : il attend `boot()`, et le mobile ne charge pas les 3840.

Encore pas excellent

- Ganymède et Callisto gardent le graticule et les noms de la planche USGS : aucune mosaïque Galileo sans annotation n’était disponible sous licence libre.
- 3840 px, pas des tuiles gigapixel. Le micro-détail procédural couvre le dernier kilomètre.
- Hauméa n’a pas de carte photographique.
- Les FPS SwiftShader restent entre 5 et 28. Le 60–144 FPS d’un GPU de bureau n’est toujours pas mesuré ici.
- L’ombre d’une lune n’est visible que lorsqu’elle passe vraiment devant le Soleil vu de la surface. Le cadrage de Jupiter à la date du jour ne montrait pas de transit.

## Cycle profondeur — cartes propres, tuiles, Hauméa, découpage

Avant : Ganymède et Callisto montraient la planche USGS (grille et toponymes). Aucune tuile de proximité. Hauméa était un ellipsoïde gris. Le script principal pesait 1,32 Mo, post-traitement inclus. La qualité Mobile était lue après la création de la scène, donc les comptes d’étoiles restaient ceux du preset Élevé.

Après : `tsc` propre, build Vite ~5 s. Découpage : `index` 322 Ko, `three` 688 Ko, `post` 315 Ko chargé à part, worker 62 Ko. Headless, 0 erreur.

- Ganymède : albédo régional sans grille ni noms, rainures claires. Callisto : champ de cratères circulaires, plus de planche annotée.
- Terre, Lune, Mars : 8 tuiles 1536² (4×2) par corps. Sous 2,4 rayons la tuile face à la caméra remplace la carte globale. En dessous de la taille d’un texel, un octave de bruit supplémentaire empêche le flou.
- Hauméa : glace, fractures et tache rouge sombre, sur l’ellipsoïde 1161 × 852 × 513 km.
- La scène mobile choisit la qualité basse avant de construire les géométries. Le preset bas ne passe plus par FXAA. Échap retire le focus du champ de recherche, pour que R et H répondent ensuite.
- Contrôles rejoués : panoramique, inclinaison, zoom, R, Ctrl+K, visite « Puissances de Dix ». Zéro erreur console.

Défauts corrigés

1. Le pincement allouait un tableau à chaque mouvement de doigt.
2. `createUniverse` lisait la qualité avant que le mobile ne soit détecté.
3. Les tuiles USGS annotées restaient l’albédo de Ganymède et Callisto.

Encore pas excellent

- Les tuiles sont un agrandissement net de la carte 3840, pas une photo plus résolue. Le détail sous le texel est procédural.
- Ganymède n’a pas les rainures fines de Galileo : elles ont été sacrifiées avec la grille.
- Hauméa, de loin, reste une petite boule pâle ; la tache rouge et l’aplatissement se lisent surtout de près.
- SwiftShader : quelques images par seconde à une vingtaine. Pas de mesure 60–144 FPS sur GPU de bureau.
- Le chunk `three` (688 Ko) est encore chargé tout de suite, parce que le canvas en a besoin dès la première image.

## Cycle boucle — sillons, quadtree NASA, banc, robustesse

Avant : Ganymède sans rainures. Les tuiles proches étaient un simple agrandissement local 4×2. Pas de banc intégré. Un onglet caché pouvait rendre une frame au `dt` plafonné, et une tuile GIBS hors grille répondait 400.

Après : build propre, script d’entrée 326 Ko. Headless SwiftShader, banc `?bench=1` (48 frames par vue) : système 12,7 fps (1 % bas 10), ISS 10,9, Terre 10,6, Lune 11,1, Mars 11,1, Jupiter 11,3, Saturne 10,8, Ganymède 11,4, M31 12,4. Temps de frame moyen 79–94 ms. Ce sont les chiffres du GPU logiciel, pas ceux d’une carte dédiée.

- Sillons de Ganymède : bandes claires parallèles et quelques rainures qui les coupent, peintes sur l’albédo sans grille.
- Quadtree distant : Terre via NASA GIBS Blue Marble (niveaux mesurés 2×1, 3×2, 5×3, 10×5, 20×10, 40×20, pour ne plus demander d’index 400). Lune et Mars via OpenPlanetaryMap (LRO WAC et Viking), en Web Mercator, échantillonné dans le shader. Cache de 14 tuiles, dispose à l’éviction. Repli sur les tuiles locales si le réseau refuse.
- `?bench=1` enchaîne neuf vues et affiche fps moyen, fps du pire centile et temps de frame. Le tableau reste dans `window.__BENCH__`.
- Onglet caché : la simulation s’arrête (`visibilitychange`), donc pas de saut de temps au retour. Perte du contexte WebGL : rechargement propre.
- Rejoué sans erreur console : les six visites, le vol libre, le suivi qui s’éteint au panoramique, sept cibles de catégories différentes, le mode photo, l’orrery, le comparateur, les quatre qualités, les douze calques, un redimensionnement mobile puis bureau.

Défauts corrigés

1. La grille GIBS n’est pas une puissance de deux : les colonnes inventées renvoyaient HTTP 400.
2. Les tuiles lointaines n’étaient pas plafonnées : un long vol en remplissait la mémoire. Le LRU en garde 14.
3. Ganymède avait perdu ses rainures avec le graticule.

Encore pas excellent

- Les sillons sont procéduraux, pas la mosaïque Galileo des sulci.
- Le quadtree s’arrête au niveau 5 (Terre) ou 4 (Lune, Mars). En dessous, le détail reste du bruit.
- OpenPlanetaryMap est un service tiers : s’il ne répond pas, on retombe sur les tuiles locales.
- Le banc SwiftShader tourne autour de 11 fps. Le chiffre utile est celui que le propriétaire lira sur son GPU avec `?bench=1`.
- Le chunk Three.js reste sur le chemin de démarrage.

## Navigation — vue aérienne libre

La caméra ne se verrouille plus sur un astre. Le mode par défaut au lancement est une vue carte, du même genre qu’un globe ou une carte de stratégie : un pivot, une distance, un cap et une inclinaison.

Validé

- Panoramique au clic gauche ou en ZQSD / flèches, au-dessus du plan, sans cible imposée. La vitesse latérale suit la distance (plus haut, plus vite).
- Inclinaison et orbite autour du point regardé au clic droit, et à deux doigts sur mobile. L’inclinaison va du ras de l’écliptique jusqu’au zénith.
- Zoom continu, logarithmique, à la molette ou au pincement. Plancher numérique 0,25 m pour éviter les NaN, aucun plafond de distance.
- Amortissement exponentiel sur le pivot, le log de la distance, le cap et l’inclinaison, avec un pas de temps réel (plafonné à 0,1 s).
- Un clic ou Ctrl+K cadre l’astre par un vol, puis rend la main. « Suivre l’astre » est un bouton à part et s’éteint dès qu’on déplace la vue (glisser ou ZQSD), y compris pendant la frappe, avant la frame suivante.
- R, ou le bouton « Vue Système Solaire », ramène instantanément la carte à 42 UA autour du Soleil.
- Le sélecteur du bas bascule en un clic entre Vue aérienne et Vol libre. Les visites guidées suivent encore l’astre le temps du commentaire. Origine flottante, positions 64 bits et depth logarithmique inchangés. Ctrl+K et H gardent leur rôle (recherche, photo).

Défauts

- Le clic droit ouvrait le menu du navigateur et les déplacements suivants n’arrivaient plus à la page : l’inclinaison ne bougeait pas, et une touche de panoramique juste après ne coupait pas le suivi.
- Un `dt` plafonné à 50 ms mettait le warp au ralenti dès que le rendu passait sous 20 images/s.

Améliorations appliquées

1. Le bouton droit est mémorisé dès le `mousedown` sur la fenêtre, et le menu contextuel est bloqué, pour que l’inclinaison parte même si l’événement ne tombe pas sur le canvas.
2. Le suivi est coupé dans le gestionnaire clavier des touches de panoramique, pas seulement dans la boucle de vue.
3. Le pas de temps utile est plafonné à 100 ms. Le sélecteur de mode est une rangée du pied de page, au-dessus des curseurs de qualité, pour rester cliquable.

Vérification headless (SwiftShader, 0 `pageerror`, 0 erreur console) : démarrage aérien à 42 UA, inclinaison 1,08 puis 1,42 après un glisser droit, panoramique clic gauche de 8,7 UA, zoom arrière 42 → 83 UA, cadrage Terre à ~19 200 km sans suivi, suivi allumé puis éteint par la touche D, R de retour à 42 UA. `tsc --noEmit` et `vite build` propres.

## Passe audit du 28 novembre 2026 (note 64/100, commit c54fc71)

Avant (mesuré par l’audit, pas rejoué ici)

- Démarrage : 26,8 Mo transférés, JS 1,33 Mo (~410 Ko gzip). Lighthouse Perf 64 PC / 44 mobile, TBT 2,3 s / 8,5 s.
- Vue système : voile laiteux, fiche ISS, fil « Saturne › Japet ».
- Vue ISS : station absente, limbe terrestre brûlé.
- Lune : 400 107 km contre 364 219 km (9,9 %).
- HUD : ~53 % de l’écran PC, panneaux superposés sur Pixel 7. A11y Lighthouse 69/65.
- `?bench=1` : `dt` plafonné à 0,1 s, donc 1 % low jamais sous 10 fps.

Après (cette branche)

- `tsc --noEmit` propre. `vite build` sans avertissement de chunk. `selfcheck` vert, et le workflow Pages l’exécute avant le build.
- Chunks : `index` 197 Ko (67 Ko gzip), `vendor` (react, react-dom, R3F) 275 Ko (88 Ko gzip), `three` 688 Ko (178 Ko gzip). Le post-traitement est dans `post` 176 Ko (78 Ko gzip), chargé seulement avec `PostFX`. JS critique gzip ≈ 333 Ko, contre ~410 Ko qui incluait le post.
- Premier chargement headless : ~0,91 Mo transférés (aperçus JPEG, pas les cartes HD). Les HD ne partent que pour l’astre cadré. Le worker Kepler ne contient plus que les ceintures (0,8 Ko).
- Lune : théorie de Meeus ch. 47, termes principaux. Le selfcheck compare le 12 avril 1992 à 368 409,7 km et le 28 novembre 2026 à 364 219 km, les deux à ±1 %.
- Vues headless (SwiftShader, 0 erreur console) : système sans le disque cosmologique, sélection Soleil, fil jusqu’au Soleil ; ISS au premier plan, limbe terrestre bleu et non blanc ; Sgr A* avec le fil « Voie lactée › Centre galactique › Sagittarius A* » ; Pixel 7 avec fiche et calques fermés, fil réduit au dernier niveau, cibles de 44 px.
- Occupation HUD, union des boîtes sur une grille de 6 px, même méthode avant (`c54fc71`) et après. PC 1440×900 : 56,2 % → 21,0 %. Pixel 7 412×915 : 95,8 % → 37,0 %. L’audit citait 53 % sur PC. Premier chargement de la vue système, corps des réponses : 28,4 Mo (dont 27,0 Mo de textures) → 1,86 Mo (JS non compressé 1,34 Mo, aperçus 0,47 Mo). Le JS critique gzip du build est 333 Ko, le chunk `post` 78 Ko.
- Banc : `dt` brut, 300 images par vue, p99, export JSON. Le bloom et le seuil de luminance sont mis à jour chaque frame.

Reste partiel

- Pas de KTX2 : les cartes restent des JPEG, au plus 3840×1920. La VRAM si tout était décodé en HD n’est pas le chemin de démarrage, mais ce n’est pas une compression GPU.
- Le limbe terrestre vu depuis l’ISS est un arc, pas un disque plein : la station est cadrée de côté, côté jour.
- L’échelle affichée près d’un objet de la coquille (Sgr A*) suit maintenant la distance réelle, mais le rendu reste sur la coquille.
- Les dépendances majeures n’ont pas été montées, comme demandé.
- Les scores Lighthouse du site déployé sont relevés après la publication Pages. Ils ne sont pas estimés dans ce journal tant que la mesure n’a pas tourné.

### Mesure du site publié (28 novembre 2026)

Pages : run `46128458652` réussi. `https://blood63.github.io/univers-3d/` répond 200 et sert `index-zywrzqrD.js` (viewport sans `user-scalable=no`).

Lighthouse 12, Chrome headless de cette machine (SwiftShader, pas un GPU de bureau). Les scores de performance ne sont donc pas comparables à ceux de l’audit s’il a tourné sur un vrai GPU. Le poids transféré, lui, ne dépend pas du GPU.

| | Perf | Accessibilité | Bonnes pratiques | SEO | Poids |
| --- | --- | --- | --- | --- | --- |
| Audit, PC | 64 | 69 | — | — | 26,8 Mo |
| Audit, mobile | 44 | 65 | — | — | 26,8 Mo |
| Mesuré, PC | 60 | 94 | 96 | 90 | 0,90 Mo |
| Mesuré, mobile | 55 | 100 | 96 | 90 | 0,90 Mo |

Le détail réseau du run PC : JS gzip 66 + 175 + 87 Ko (index, three, vendor), post 77 Ko chargé juste après, aperçus JPEG 0,46 Mo, deux woff2 latin (Outfit 14 Ko, IBM Plex Mono 15 Ko). Aucune carte HD au premier écran. TBT mesuré ici : 23,5 s PC et 10,6 s mobile. Le TBT PC est dominé par le thread principal sous SwiftShader (45 s) ; je ne le présente pas comme une régression réelle sur un GPU.

## Pics GPU du 28 novembre 2026, 11:23 (RTX 5070, 300 Hz)

Référence mesurée par l’utilisateur, Chrome, 1920×1080, vsync coupée. Colonnes : fps moyen / 1 % low / ms moyen / p99 ms.

| Vue | fps | 1 % low | ms | p99 |
| --- | --- | --- | --- | --- |
| system | 178,3 | 39,8 | 5,61 | 25,1 |
| iss | 186,5 | 22,3 | 5,36 | 44,9 |
| earth | 273,5 | 175,4 | 3,66 | 5,7 |
| moon | 274,4 | 161,3 | 3,64 | 6,2 |
| mars | 279,4 | 208,3 | 3,58 | 4,8 |
| jupiter | 287,7 | 101,0 | 3,48 | 9,9 |
| saturn | 286,5 | 138,9 | 3,49 | 7,2 |
| ganymede | 295,1 | 188,7 | 3,39 | 5,3 |
| m31 | 291,3 | 93,5 | 3,43 | 10,7 |

Diagnostic. Le 1 % low est l’inverse du p99, donc system et iss ont quelques images longues (25 ms et 45 ms), pas une moyenne basse. Le banc démarrait le chronomètre à la première image de la vue. `system` est la première : compilation des shaders du composer (le `compileAsync` précédent visait une scène encore vide), construction des cinq trajectoires de sondes sur le thread principal, et upload groupé des aperçus. `iss` arrive environ deux secondes plus tard, au moment où le réglage automatique du DPR redimensionne les framebuffers, et où les cinq cartes HD de la Terre sont décodées en JPEG puis envoyées au GPU dans la même fenêtre de 300 images. Jupiter et M31 dépassent 10 ms de p99 pour la même raison, avec une seule carte ou un premier usage de shader. Les vues planète déjà chaudes (Terre, Lune, Mars, Ganymède) restent sous 7 ms : ce ne sont pas des pics permanents.

Correctifs. Échauffement de 60 images, rapporté à part (`warmupFrames`, `warmupMs`, `warmupMaxMs`) et exclu du p99. Le JSON ajoute `maxMs`, `over16`, `over33`. Les shaders de la scène sont compilés avant `boot`. Les images passent par `createImageBitmap`. Les uploads GPU sont étalés (une carte HD par image, plusieurs aperçus). Une trajectoire de sonde par image. Le DPR ne bouge pas pendant le banc. Les cartes HD sont en KTX2 Basis ETC1S, avec repli JPEG si le transcodeur échoue.

Poids des cartes HD : JPEG+PNG 25,42 Mo → KTX2 12,87 Mo. VRAM si toutes sont résidentes, mipmaps compris : RGBA8 571 Mo → environ 143 Mo en BC7 (RTX 5070) ou 71 Mo en BC1. Le démarrage reste sur les aperçus JPEG. Le 404 `textures/preview/saturn_ring.png` est comblé. Sur Pixel 7 le fil d’Ariane est sous le titre, plus sous Ctrl+K. `H` est documenté comme immersion. La vue ISS recule à ~780 m le long de la radiale : le disque terrestre remplit le fond, le limbe reste bleu.

Pages `46135749201` réussi, le site répond 200 et sert `index-CYnxw_vS.js`. `textures/preview/saturn_ring.png` répond 200. Lighthouse 12 sur ce déploiement, même Chrome headless SwiftShader : PC 59 / 94 / 100 / 90, mobile 44 / 100 / 100 / 90 (perf, accessibilité, bonnes pratiques, SEO). Bonnes pratiques revient à 100, aucune requête en échec. Poids au premier écran toujours 0,90 Mo : les KTX2 ne partent qu’avec la carte HD de l’astre cadré. Ces scores de performance ne remplacent pas un `?bench=1` à 300 Hz sur la RTX 5070.

## Re-bench RTX 5070, 28 novembre 2026, 11:44

Même machine, 300 Hz, après la PR #8. Colonnes : fps / 1 % low / p99 ms. Le max et les images au-dessus de 16,7 ms ne sont cités que lorsqu’ils comptent.

| Vue | fps | 1 % low | p99 | avant (fps / 1 % / p99) |
| --- | --- | --- | --- | --- |
| system | 273,6 | 196,1 | 5,1 | 178 / 40 / 25,1 |
| iss | 282,4 | 97,1 | 10,3 | 186 / 22 / 44,9 |
| earth | 299,0 | 238,1 | 4,2 | 274 / 175 / 5,7 |
| moon | 300,4 | 277,8 | 3,6 | 274 / 161 / 6,2 |
| mars | 299,4 | 263,2 | 3,8 | 279 / 208 / 4,8 |
| jupiter | 300,0 | 238,1 | 4,2 | 288 / 101 / 9,9 |
| saturn | 300,0 | 285,7 | 3,5 | 286 / 139 / 7,2 |
| ganymede | 300,0 | 277,8 | 3,6 | 295 / 189 / 5,3 |
| m31 | 300,0 | 285,7 | 3,5 | 291 / 94 / 10,7 |

ISS : max 18,3 ms, une image au-dessus de 16,7 ms. Échauffement max : system 19,3 ms, iss 12,6 ms, les autres ≤ 8 ms.

Cette image de 18 ms est l’upload GPU (ou la recompilation du shader terrestre) d’une carte KTX2 de la Terre, ou une tuile GIBS, qui arrive après les 60 images d’échauffement. La vue ISS est à ~400 km, donc le quadtree demande des tuiles, et les cinq KTX2 (jour, nuit, nuages, normale, spéculaire) mettent plus de 60 images à transcoder. Le correctif précharge ces cartes dès le début de la vue, prolonge l’échauffement tant qu’un transcodage ou un upload est en cours (plafond 240 images, plus l’image qui suit la fin de la file), et ne demande aucune tuile pendant le banc. Les aperçus du premier écran sont envoyés par plus petits paquets, et les quatre premières images (compilation du composer) ne sont pas comptées dans l’échauffement de `system`.

## Re-bench RTX 5070, 28 novembre 2026, 11:52

Après la PR #9, 300 Hz. Les neuf vues tiennent l’objectif dans la fenêtre mesurée : 1 % low entre 175 et 294, p99 ≤ 5,7 ms, aucune image au-dessus de 16,7 ms. L’ISS donne 298 fps, 1 % low 222, p99 4,5 ms.

Le warm-up, lui, saccade encore. warmupMaxMs : system 68 ms (premier affichage), iss 40,4 ms, earth 14,9 ms, m31 10,7 ms, les autres sous le seuil.

La passe suivante ne rallonge plus l’échauffement : il reste à 60 images. `KHR_parallel_shader_compile` est activé avant tout programme. Le post-traitement ne s’affiche qu’une fois chaque passe compilée à part, via `compileAsync`, en idle. Les cartes KTX2 de la Terre et les tuiles GIBS z0/z1 partent dès le boot, une texture par image, et seulement si la frame a encore moins de 8 ms. Le plus grand niveau au-dessus de 2048 n’est pas envoyé, pour que cet envoi tienne dans le budget. Un vol déclenche le chargement de la cible au départ, pas à l’arrivée. Le DPR est fixé dès le départ et ne change pas pendant 8 s ni pendant le banc.
