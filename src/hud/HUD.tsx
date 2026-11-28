import { useEffect, useMemo, useState } from 'react'
import { BODY_BY_ID, BODY_IDS, TOURS, type Category } from '../astro/catalog'
import { AU, C, LY, YEAR, formatDateUTC, formatDist, formatDuration, formatSpeed, jdToDate, dateToJD } from '../astro/math'
import { ECHELLE_LABEL, altitudeToSlider, breadcrumbs, sliderToAltitude } from '../astro/scales'
import { readPos } from '../astro/ephemeris'
import { capturePng } from '../App'
import { applyMute, resumeAudio } from '../engine/audio'
import { beginWarp, focusBody, refreshBelts, setAltitude, setNav, startBench, startTour, stopTour, toggleFollow, toggleScale, viewSolarSystem } from '../engine/runtime'
import { QUALITY_PRESET, labelFrame, sim, type Quality } from '../engine/state'
import { v3 } from '../astro/math'
import { Comparator } from './Comparator'

const CATS: { id: Category | 'tous'; label: string }[] = [
  { id: 'tous', label: 'Tous' },
  { id: 'galaxie', label: 'Galaxies' },
  { id: 'etoile', label: 'Étoiles' },
  { id: 'planete', label: 'Planètes' },
  { id: 'naine', label: 'Naines' },
  { id: 'lune', label: 'Lunes' },
  { id: 'sonde', label: 'Sondes' },
  { id: 'nebuleuse', label: 'Nébuleuses' },
  { id: 'phenomene', label: 'Phénomènes' },
]

const SCALES: { label: string; value: number }[] = [
  { label: 'Pause', value: 0 },
  { label: '1×', value: 1 },
  { label: '1 min/s', value: 60 },
  { label: '1 h/s', value: 3600 },
  { label: '1 j/s', value: 86400 },
  { label: '1 an/s', value: 86400 * 365.25 },
  { label: '1 siècle/s', value: 86400 * 365.25 * 100 },
]

function useTick(ms = 80) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => v + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return n
}

export function HUD({ nonce }: { nonce: number }) {
  const tick = useTick(120)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('tous')
  const [date, setDate] = useState('')
  void nonce

  useEffect(() => {
    const flare = document.getElementById('sun-flare')
    if (!flare) return
    const f = labelFrame.flare
    flare.style.opacity = String(sim.photo ? 0 : f.a)
    flare.style.left = `${f.x}px`
    flare.style.top = `${f.y}px`
    flare.style.transform = 'translate(-50%, -50%)'
  })

  const body = BODY_BY_ID[sim.selected] ?? BODY_BY_ID.iss
  const distEarth = useMemo(() => {
    const a = v3()
    const b = v3()
    readPos(body.id, a, false)
    readPos('terre', b, false)
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  }, [body.id, tick])
  const ruler = useMemo(() => {
    const a = v3()
    const b = v3()
    readPos(sim.rulerA, a, false)
    readPos(sim.rulerB, b, false)
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    return {
      d,
      light: d / C,
      voyager: d / 17000,
      ship: d / 60000,
    }
  }, [tick])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return BODY_IDS.filter((id) => {
      const b = BODY_BY_ID[id]
      if (cat !== 'tous' && b.category !== cat) return false
      if (!q) return true
      return `${b.name} ${b.id} ${b.spectral} ${b.summary}`.toLowerCase().includes(q)
    }).slice(0, 12)
  }, [query, cat, tick])

  if (!sim.hud && !sim.photo && !sim.credits) return null
  const crumbs = breadcrumbs(sim.selected)
  const shownCrumbs = sim.mobile ? crumbs.slice(-1) : crumbs

  return (
    <div className="pointer-events-none absolute inset-0 text-[13px]" data-mobile={sim.mobile ? '1' : '0'}>
      <h1 className="sr-only">Univers 3D, explorateur du cosmos</h1>
      {sim.hud && (
        <main>
          <header className="pointer-events-auto absolute left-4 top-4 flex items-center gap-4">
            <div className="glass rounded-2xl px-4 py-3">
              <div className="text-[10px] tracking-[0.32em] text-[#9ec5ff]">UNIVERS</div>
              <div className="text-lg leading-none">Poste de navigation</div>
              <div className="mono mt-1 text-[11px] text-white/70">{formatDateUTC(sim.jd)}</div>
            </div>
            <div className="glass desk-only rounded-2xl px-4 py-3">
              <div className="text-[10px] tracking-[0.18em] text-white/45">ÉCHELLE</div>
              <div>{ECHELLE_LABEL[sim.echelle] ?? sim.band}</div>
              <div className="mono text-[11px] text-[#f0c27a]">
                {sim.scaleMode === 'real' ? 'Réelle' : 'Orrery'} · {formatSpeed(sim.speed)}
              </div>
            </div>
          </header>

          <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
            <button className="hud-btn" onClick={() => (sim.search = true)}>
              Ctrl+K
            </button>
            <button className="glass mono rounded-full px-3 py-2 text-[11px]" onClick={() => (sim.profileOpen = !sim.profileOpen)}>
              {Math.round(sim.fps)} fps · {sim.draws} dc
            </button>
          </div>
          {sim.benchNote && (
            <pre className="pointer-events-none glass absolute left-4 top-36 z-30 max-w-xs whitespace-pre-wrap rounded-2xl p-3 text-[11px] leading-relaxed">
              {sim.benchOn ? 'Mesure…\n' : 'Banc\n'}
              {sim.benchNote}
            </pre>
          )}
          {sim.profileOpen && (
            <div className="pointer-events-auto glass absolute right-4 top-16 w-56 rounded-2xl p-3 mono text-[11px] leading-relaxed">
              <div>FPS {sim.fps.toFixed(1)}</div>
              <div>Frame {sim.frameMs.toFixed(2)} ms</div>
              <div>Draw calls {sim.draws}</div>
              <div>Triangles {sim.tris.toLocaleString('fr-FR')}</div>
              <div>Textures {sim.texCount}</div>
              <div>Objets actifs {sim.activeBodies}</div>
              <div>Qualité {sim.quality}</div>
              <div>DPR ×{sim.dprBias.toFixed(2)}</div>
            </div>
          )}
          <nav
            aria-label="Fil d’Ariane"
            className={
              sim.mobile
                ? 'pointer-events-auto absolute left-4 top-[5.6rem] z-30 flex max-w-[42vw] flex-wrap gap-1'
                : 'pointer-events-auto absolute left-1/2 top-4 z-30 flex max-w-[70vw] -translate-x-1/2 flex-wrap justify-center gap-1'
            }
          >
            {shownCrumbs.map((c, i, arr) => (
              <button
                key={c.id}
                className="hud-btn"
                onClick={() => {
                  if (c.id === 'sys' || (c.target === 'soleil' && c.id === 'orion')) viewSolarSystem()
                  else focusBody(c.target)
                }}
              >
                {c.label}
                {i < arr.length - 1 ? ' ›' : ''}
              </button>
            ))}
          </nav>
          <label className="desk-only pointer-events-auto absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2">
            <span className="text-[10px] tracking-[0.14em] text-white/50">46 Gal</span>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(altitudeToSlider(Math.max(sim.altitude, 5)) * 1000)}
              onChange={(e) => setAltitude(sliderToAltitude(Number(e.target.value) / 1000))}
              style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '42vh' }}
            />
            <span className="text-[10px] tracking-[0.14em] text-white/50">1 m</span>
          </label>

          <button className={`hud-btn pointer-events-auto absolute ${sim.mobile ? 'left-4 top-[8.4rem]' : 'left-4 top-28'}`} aria-pressed={sim.layersOpen} onClick={() => (sim.layersOpen = !sim.layersOpen)}>
            Calques
          </button>
          {sim.layersOpen && <aside className={`pointer-events-auto absolute z-40 ${sim.mobile ? 'bottom-28 left-3 right-3 max-h-[46vh] overflow-auto' : 'left-4 top-40 w-52'}`}>
            <div className="glass rounded-2xl p-3">
              <div className="mb-2 text-[10px] tracking-[0.18em] text-white/45">CALQUES</div>
              {(
                [
                  ['orbits', 'Orbites'],
                  ['trajectories', 'Trajectoires'],
                  ['groundTrack', 'Trace au sol ISS'],
                  ['labels', 'Étiquettes'],
                  ['constellations', 'Constellations'],
                  ['ecliptic', 'Grille écliptique'],
                  ['galactic', 'Grille galactique'],
                  ['habitable', 'Zone habitable'],
                  ['heliosphere', 'Héliosphère'],
                  ['oort', 'Nuage d’Oort'],
                  ['cosmicWeb', 'Toile cosmique'],
                  ['debris', 'Débris'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between py-1 text-xs">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={sim.layers[key]}
                    onChange={(e) => {
                      sim.layers[key] = e.target.checked
                    }}
                  />
                </label>
              ))}
            </div>
          </aside>}

          <button
            className="hud-btn pointer-events-auto absolute right-4 top-16"
            aria-pressed={sim.cardOpen}
            onClick={() => (sim.cardOpen = !sim.cardOpen)}
          >
            Fiche
          </button>
          {sim.cardOpen && <aside className={`pointer-events-auto absolute w-[320px] max-w-[92vw] ${sim.mobile ? 'bottom-28 left-1/2 z-40 -translate-x-1/2' : 'right-4 top-28'}`}>
            <div className="glass max-h-[62vh] overflow-auto rounded-2xl p-4">
              <div className="text-[10px] tracking-[0.18em] text-[#f0c27a]">{body.category.toUpperCase()}</div>
              <h2 className="text-2xl leading-tight">{body.name}</h2>
              <p className="mt-2 text-[13px] leading-snug text-white/80">{body.summary}</p>
              <dl className="mono mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <dt className="text-white/45">Distance Terre</dt>
                <dd>{formatDist(distEarth)}</dd>
                <dt className="text-white/45">Diamètre</dt>
                <dd>{formatDist(body.radius * 2)}</dd>
                <dt className="text-white/45">Masse</dt>
                <dd>{body.mass.toExponential(2)} kg</dd>
                <dt className="text-white/45">Gravité</dt>
                <dd>{body.gravity.toFixed(2)} m/s²</dd>
                <dt className="text-white/45">Température</dt>
                <dd>{body.temperature}</dd>
                <dt className="text-white/45">Atmosphère</dt>
                <dd>{body.atmosphere}</dd>
                {body.spectral && (
                  <>
                    <dt className="text-white/45">Spectre</dt>
                    <dd>{body.spectral}</dd>
                  </>
                )}
                <dt className="text-white/45">Découverte</dt>
                <dd>{body.discovered}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="hud-btn" onClick={() => beginWarp(body.id)}>
                  Cadrer
                </button>
                <button className="hud-btn" aria-pressed={sim.follow} onClick={() => toggleFollow()}>
                  Suivre l'astre
                </button>
              </div>
            </div>
          </aside>}

          <footer className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 md:p-4">
            <div className="flex flex-wrap justify-center gap-2">
              <button className="hud-btn" aria-pressed={sim.mode === 'aerial'} data-on={sim.mode === 'aerial'} onClick={() => setNav('aerial')}>
                Vue aérienne
              </button>
              <button className="hud-btn" aria-pressed={sim.mode === 'freefly'} data-on={sim.mode === 'freefly'} onClick={() => setNav('freefly')}>
                Vol libre
              </button>
              <button className="hud-btn" onClick={() => viewSolarSystem()}>
                Vue Système Solaire
              </button>
            </div>
            {sim.tourId && (
              <div className="glass mx-auto max-w-xl rounded-2xl px-4 py-3 text-center">
                <div className="text-[10px] tracking-[0.18em] text-[#f0c27a]">
                  {TOURS.find((t) => t.id === sim.tourId)?.title} · étape {sim.tourStep + 1}
                </div>
                <div className="mt-1">{TOURS.find((t) => t.id === sim.tourId)?.steps[sim.tourStep]?.text}</div>
                <button className="hud-btn mt-2" onClick={stopTour}>
                  Quitter la visite
                </button>
              </div>
            )}
            <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
              <button className="hud-btn" onClick={() => (sim.timeScale = -Math.abs(sim.timeScale || 86400))}>
                ◀
              </button>
              <button
                className="hud-btn"
                onClick={() => {
                  sim.paused = !sim.paused
                }}
              >
                {sim.paused ? 'Lecture' : 'Pause'}
              </button>
              <button className="hud-btn" onClick={() => (sim.timeScale = Math.abs(sim.timeScale || 1))}>
                ▶
              </button>
              <span className="desk-only contents">
              {SCALES.filter((s) => s.value !== 0).map((s) => (
                <button key={s.label} className="hud-btn" aria-pressed={sim.timeScale === s.value && !sim.paused} onClick={() => { sim.timeScale = s.value; sim.paused = false }}>
                  {s.label}
                </button>
              ))}
              <label className="sr-only" htmlFor="sim-date">Date de la simulation</label>
              <input id="sim-date" aria-label="Date de la simulation" className="mono rounded-full bg-black/30 px-2 py-1 text-[11px]" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
              </span>
              <button
                className="hud-btn"
                onClick={() => {
                  if (!date) return
                  const d = new Date(date + 'Z')
                  if (!Number.isNaN(d.getTime())) sim.jd = dateToJD(d)
                }}
              >
                Date
              </button>
              <button className="hud-btn" data-on={sim.scaleMode === 'orrery'} onClick={toggleScale}>
                {sim.scaleMode === 'real' ? 'Échelle réelle' : 'Orrery'}
              </button>
              <button className="hud-btn" aria-pressed={sim.help} onClick={() => (sim.help = !sim.help)}>
                Aide
              </button>
              <button
                className="hud-btn"
                onClick={() => {
                  sim.muted = !sim.muted
                  resumeAudio()
                  applyMute()
                }}
              >
                {sim.muted ? 'Son coupé' : 'Son'}
              </button>
              <button
                className="hud-btn"
                onClick={() => {
                  sim.photo = true
                  sim.hud = false
                }}
              >
                Photo
              </button>
              <button className="hud-btn" aria-pressed={sim.toolsOpen} onClick={() => (sim.toolsOpen = !sim.toolsOpen)}>
                Outils
              </button>
              <button className="hud-btn" aria-pressed={sim.credits} onClick={() => (sim.credits = !sim.credits)}>
                Crédits
              </button>
              <button className="hud-btn" aria-pressed={sim.benchOn} onClick={() => startBench()}>
                Banc
              </button>
              {sim.benchNote && (
                <button
                  className="hud-btn"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(window.__BENCH__ ?? [], null, 2)], { type: 'application/json' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = 'univers-3d-bench.json'
                    a.click()
                  }}
                >
                  Export bench
                </button>
              )}
            </div>
            {sim.toolsOpen && (
            <div className="glass grid gap-3 rounded-2xl p-3 md:grid-cols-3">
              <div className="flex flex-wrap gap-2 md:col-span-3">
              {TOURS.map((t) => (
                <button key={t.id} className="hud-btn" onClick={() => startTour(t.id)}>
                  {t.title}
                </button>
              ))}
              <button className="hud-btn" onClick={() => (sim.comparator = true)}>
                Comparateur
              </button>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.16em] text-white/45">QUALITÉ</div>
                <div className="mt-1 flex gap-1">
                  {(['low', 'medium', 'high', 'ultra'] as Quality[]).map((q) => (
                    <button
                      key={q}
                      className="hud-btn"
                      data-on={sim.quality === q}
                      onClick={() => {
                        sim.quality = q
                        sim.bloomUser = QUALITY_PRESET[q].bloom
                        refreshBelts()
                      }}
                    >
                      {q === 'low' ? 'Mobile' : q === 'medium' ? 'Moyen' : q === 'high' ? 'Élevé' : 'Ultra'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="text-xs">
                Densité stellaire
                <input type="range" min={0.4} max={2.2} step={0.05} value={sim.starDensity} onChange={(e) => (sim.starDensity = Number(e.target.value))} />
              </label>
              <label className="text-xs">
                Bloom
                <input type="range" min={0} max={1.6} step={0.02} value={sim.bloomUser} onChange={(e) => (sim.bloomUser = Number(e.target.value))} />
              </label>
              <div className="text-xs md:col-span-3">
                <div className="text-[10px] tracking-[0.16em] text-white/45">RÈGLE COSMIQUE</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <select aria-label="Origine de la règle cosmique" className="mono bg-transparent" value={sim.rulerA} onChange={(e) => (sim.rulerA = e.target.value)}>
                    {BODY_IDS.map((id) => (
                      <option key={id} value={id}>
                        {BODY_BY_ID[id].name}
                      </option>
                    ))}
                  </select>
                  <span>→</span>
                  <select aria-label="Destination de la règle cosmique" className="mono bg-transparent" value={sim.rulerB} onChange={(e) => (sim.rulerB = e.target.value)}>
                    {BODY_IDS.map((id) => (
                      <option key={id} value={id}>
                        {BODY_BY_ID[id].name}
                      </option>
                    ))}
                  </select>
                  <span className="mono text-[11px]">
                    {formatDist(ruler.d)} · {formatDist(ruler.d / AU * AU)} · lumière {formatDuration(ruler.light)} · Voyager {formatDuration(ruler.voyager)} · vaisseau 60 km/s {formatDuration(ruler.ship)}
                  </span>
                </div>
              </div>
            </div>
            )}
          </footer>

          <div className="pointer-events-none absolute inset-0">
            {labelFrame.items.map((l) => (
              <button
                key={l.id}
                className="label-3d pointer-events-auto glass rounded-full px-2 py-1 text-[11px]"
                style={{ left: l.x, top: l.y }}
                onClick={() => beginWarp(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
        </main>
      )}

      {sim.photo && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-end gap-3">
          <div className="glass w-64 rounded-2xl p-3 text-xs">
            <div className="mb-2 tracking-[0.16em] text-[#f0c27a]">MODE PHOTO</div>
            <label>
              Exposition
              <input type="range" min={0.4} max={1.8} step={0.02} value={sim.exposure} onChange={(e) => (sim.exposure = Number(e.target.value))} />
            </label>
            <label>
              Profondeur de champ
              <input type="range" min={0} max={1} step={0.01} value={sim.dof} onChange={(e) => (sim.dof = Number(e.target.value))} />
            </label>
            <div className="mt-2 flex gap-2">
              <button className="hud-btn" onClick={capturePng}>
                PNG
              </button>
              <button
                className="hud-btn"
                onClick={() => {
                  sim.photo = false
                  sim.hud = true
                }}
              >
                HUD (H)
              </button>
            </div>
          </div>
        </div>
      )}

      {sim.search && (
        <div className="pointer-events-auto absolute inset-0 flex items-start justify-center bg-black/40 pt-[12vh]" onClick={() => (sim.search = false)}>
          <div className="glass w-[min(640px,92vw)] rounded-2xl p-3" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="Rechercher une galaxie, une planète, une sonde…"
              className="w-full bg-transparent px-3 py-2 text-lg outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) {
                  beginWarp(results[0])
                  sim.search = false
                }
                if (e.key === 'Escape') sim.search = false
              }}
            />
            <div className="mb-2 flex flex-wrap gap-1 px-2">
              {CATS.map((c) => (
                <button key={c.id} className="hud-btn" data-on={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <ul className="max-h-80 overflow-auto">
              {results.map((id) => (
                <li key={id}>
                  <button
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/5"
                    onClick={() => {
                      beginWarp(id)
                      sim.search = false
                    }}
                  >
                    <span>{BODY_BY_ID[id].name}</span>
                    <span className="mono text-[10px] uppercase text-white/40">{BODY_BY_ID[id].category}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sim.credits && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/50" onClick={() => (sim.credits = false)}>
          <div className="glass max-w-lg rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg">Crédits</div>
            <p className="mt-2 text-[13px] leading-relaxed text-white/80">
              Cartes Terre, Lune, Mars, Mercure : Solar System Scope, licence CC BY 4.0. Fond diffus cosmologique : Planck SMICA, ESA / Planck Collaboration, licence CC BY 4.0. Tuiles rapprochées : NASA GIBS Blue Marble, OpenPlanetaryMap Lune et Mars. Code sous licence MIT.
            </p>
            <button className="hud-btn mt-3" onClick={() => (sim.credits = false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {sim.help && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/50" onClick={() => (sim.help = false)}>
          <div className="glass max-w-lg rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg">Commandes</div>
            <ul className="mono mt-3 space-y-1 text-[12px] leading-relaxed text-white/80">
              <li>Vue aérienne — clic gauche : déplacer · clic droit : incliner · molette : zoom</li>
              <li>ZQSD ou flèches — panoramique, plus rapide quand on est haut</li>
              <li>Vol libre — ZQSD translation, souris verrouillée, A/E ou Q/E roulis</li>
              <li>Clic sur un astre — vol pour le cadrer, sans verrouillage</li>
              <li>Suivre l'astre est optionnel et s'arrête dès qu'on déplace la vue</li>
              <li>R — vue Système Solaire · Ctrl+K recherche · H immersion · O orrery · P pause</li>
              <li>Disposition clavier : {sim.layout.toUpperCase()} · proche de {BODY_BY_ID[sim.nearestId]?.name}</li>
            </ul>
            <button
              className="hud-btn mt-3"
              onClick={() => {
                sim.layout = sim.layout === 'azerty' ? 'qwerty' : 'azerty'
              }}
            >
              Basculer AZERTY / QWERTY
            </button>
          </div>
        </div>
      )}

      {sim.mobile && sim.hud && <Stick />}
      {sim.comparator && <Comparator onClose={() => (sim.comparator = false)} />}
      <span className="hidden">{jdToDate(sim.jd).getUTCFullYear()}{YEAR}{LY}</span>
    </div>
  )
}

function Stick() {
  return (
    <div
      className="pointer-events-auto absolute bottom-36 left-4 h-28 w-28 rounded-full border border-white/20 bg-white/5"
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width - 0.5
        const y = (e.clientY - r.top) / r.height - 0.5
        sim.stick.x = Math.max(-1, Math.min(1, x * 2))
        sim.stick.y = Math.max(-1, Math.min(1, -y * 2))
      }}
      onPointerUp={() => {
        sim.stick.x = 0
        sim.stick.y = 0
      }}
    />
  )
}
