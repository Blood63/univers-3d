import { useEffect, useMemo, useState } from 'react'
import { BODY_BY_ID, BODY_IDS, TOURS, type Category } from '../astro/catalog'
import { AU, C, LY, YEAR, formatDateUTC, formatDist, formatDuration, formatSpeed, jdToDate, dateToJD, BAND_LABEL } from '../astro/math'
import { readPos } from '../astro/ephemeris'
import { capturePng } from '../App'
import { applyMute, resumeAudio } from '../engine/audio'
import { beginWarp, refreshBelts, setNav, startTour, stopTour, toggleFollow, toggleScale, viewSolarSystem } from '../engine/runtime'
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

function useTick(ms = 120) {
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

  if (!sim.hud && !sim.photo) return null

  return (
    <div className="pointer-events-none absolute inset-0 text-[13px]">
      {sim.hud && (
        <>
          <header className="pointer-events-auto absolute left-4 top-4 flex items-center gap-4">
            <div className="glass rounded-2xl px-4 py-3">
              <div className="text-[10px] tracking-[0.32em] text-[#9ec5ff]">UNIVERS</div>
              <div className="text-lg leading-none">Poste de navigation</div>
              <div className="mono mt-1 text-[11px] text-white/70">{formatDateUTC(sim.jd)}</div>
            </div>
            <div className="glass rounded-2xl px-4 py-3">
              <div className="text-[10px] tracking-[0.18em] text-white/45">ÉCHELLE</div>
              <div>{BAND_LABEL[sim.band]}</div>
              <div className="mono text-[11px] text-[#f0c27a]">
                {sim.scaleMode === 'real' ? 'Réelle' : 'Orrery'} · {formatSpeed(sim.speed)}
              </div>
            </div>
          </header>

          <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
            <button className="hud-btn" onClick={() => (sim.search = true)}>
              Ctrl+K
            </button>
            <div className="glass mono rounded-full px-3 py-2 text-[11px]">
              {Math.round(sim.fps)} fps · {sim.draws} dc
            </div>
          </div>

          <aside className="pointer-events-auto absolute left-4 top-36 hidden w-52 md:block">
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
          </aside>

          <aside className="pointer-events-auto absolute right-4 top-20 w-[320px]">
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
                <button className="hud-btn" data-on={sim.follow} onClick={() => toggleFollow()}>
                  Suivre l'astre
                </button>
              </div>
            </div>
          </aside>

          <footer className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-4">
            <div className="flex flex-wrap justify-center gap-2">
              <button className="hud-btn" data-on={sim.mode === 'aerial'} onClick={() => setNav('aerial')}>
                Vue aérienne
              </button>
              <button className="hud-btn" data-on={sim.mode === 'freefly'} onClick={() => setNav('freefly')}>
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
              {SCALES.map((s) => (
                <button key={s.label} className="hud-btn" data-on={sim.timeScale === s.value && !sim.paused} onClick={() => { sim.timeScale = s.value; sim.paused = s.value === 0 }}>
                  {s.label}
                </button>
              ))}
              <input className="mono rounded-full bg-black/30 px-2 py-1 text-[11px]" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
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
              <button className="hud-btn" onClick={() => (sim.help = !sim.help)}>
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
              <button className="hud-btn" onClick={() => (sim.photo = true)}>
                Photo
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {TOURS.map((t) => (
                <button key={t.id} className="hud-btn" onClick={() => startTour(t.id)}>
                  {t.title}
                </button>
              ))}
              <button className="hud-btn" onClick={() => (sim.comparator = true)}>
                Comparateur
              </button>
            </div>
            <div className="glass grid gap-3 rounded-2xl p-3 md:grid-cols-3">
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
                        sim.bloom = QUALITY_PRESET[q].bloom
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
                <input type="range" min={0} max={1.6} step={0.02} value={sim.bloom} onChange={(e) => (sim.bloom = Number(e.target.value))} />
              </label>
              <div className="text-xs md:col-span-3">
                <div className="text-[10px] tracking-[0.16em] text-white/45">RÈGLE COSMIQUE</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <select className="mono bg-transparent" value={sim.rulerA} onChange={(e) => (sim.rulerA = e.target.value)}>
                    {BODY_IDS.map((id) => (
                      <option key={id} value={id}>
                        {BODY_BY_ID[id].name}
                      </option>
                    ))}
                  </select>
                  <span>→</span>
                  <select className="mono bg-transparent" value={sim.rulerB} onChange={(e) => (sim.rulerB = e.target.value)}>
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
        </>
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
              <li>R — vue Système Solaire · Ctrl+K recherche · H photo · O orrery · P pause</li>
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
