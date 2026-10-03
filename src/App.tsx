import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BRANDS, type Brand } from './brands'
import { planFromSelection, suggestTurn, TURN_SIZE, type Turn } from './game'

type Phase = 'menu' | 'setup' | 'playing' | 'finished'

const BEST_KEY = 'lg_best'

export default function App() {
  const [phase, setPhase] = useState<Phase>('menu')
  const [turns, setTurns] = useState<Turn[]>([])
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(BRANDS.map((b) => b.slug)),
  )
  const [turnIdx, setTurnIdx] = useState(0)
  const [cardIdx, setCardIdx] = useState(0)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem(BEST_KEY) ?? 0))

  const turn = turns[turnIdx]
  const card = turn?.[cardIdx]
  const totalCards = useMemo(() => turns.reduce((n, t) => n + t.length, 0), [turns])
  const isRevealed = card ? Boolean(revealed[card.slug]) : false

  const start = useCallback((selection: Brand[]) => {
    const pickedBrands = BRANDS.filter((b) => selection.some((s) => s.slug === b.slug))
    setTurns(planFromSelection(pickedBrands, TURN_SIZE))
    setTurnIdx(0)
    setCardIdx(0)
    setRevealed({})
    setScore(0)
    setPhase('playing')
  }, [])

  const reveal = useCallback(() => {
    if (!card || revealed[card.slug]) return
    setRevealed((r) => ({ ...r, [card.slug]: true }))
    setScore((s) => s + 1)
  }, [card, revealed])

  const next = useCallback(() => {
    if (!turns.length || !turn) return
    const lastInTurn = cardIdx >= turn.length - 1
    const lastTurn = turnIdx >= turns.length - 1
    if (lastInTurn && lastTurn) {
      setBest((b) => {
        const nextBest = Math.max(b, score)
        localStorage.setItem(BEST_KEY, String(nextBest))
        return nextBest
      })
      setPhase('finished')
      return
    }
    if (lastInTurn) {
      setTurnIdx((i) => i + 1)
      setCardIdx(0)
    } else {
      setCardIdx((i) => i + 1)
    }
  }, [turns, turn, turnIdx, cardIdx, score])

  const gotoCard = useCallback(
    (i: number) => {
      if (!turn) return
      setCardIdx(Math.max(0, Math.min(i, turn.length - 1)))
    },
    [turn],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'playing' || !turn || !card) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        isRevealed ? next() : reveal()
      } else if (e.key === 'ArrowRight') {
        gotoCard(cardIdx + 1)
      } else if (e.key === 'ArrowLeft') {
        gotoCard(cardIdx - 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setTurnIdx((t) => Math.min(t + 1, turns.length - 1))
        setCardIdx(0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setTurnIdx((t) => Math.max(t - 1, 0))
        setCardIdx(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, turn, card, isRevealed, next, reveal, gotoCard, cardIdx, turns.length])

  if (phase === 'menu') {
    return (
      <Menu
        best={best}
        onPlay={() => setPhase('setup')}
        onQuick={() => start(BRANDS)}
      />
    )
  }

  if (phase === 'setup') {
    return (
      <Setup
        picked={picked}
        onToggle={(slug) =>
          setPicked((p) => {
            const n = new Set(p)
            n.has(slug) ? n.delete(slug) : n.add(slug)
            return n
          })
        }
        onAll={() => setPicked(new Set(BRANDS.map((b) => b.slug)))}
        onNone={() => setPicked(new Set())}
        onEasy={() => setPicked(new Set(BRANDS.filter((b) => b.difficulty === 1).map((b) => b.slug)))}
        onStart={() => {
          const chosen = BRANDS.filter((b) => picked.has(b.slug))
          if (chosen.length) start(chosen)
        }}
        onBack={() => setPhase('menu')}
      />
    )
  }

  if (phase === 'finished') {
    return (
      <Finished
        score={score}
        total={totalCards}
        best={best}
        turns={turns.length}
        onPlayAgain={() => start(BRANDS.filter((b) => picked.has(b.slug)))}
        onMenu={() => setPhase('menu')}
      />
    )
  }

  if (!turn || !card) return null

  return (
    <div className="app">
      <header className="hud">
        <button className="ghost" onClick={() => setPhase('menu')} aria-label="Back to menu">
          ‹
        </button>
        <div className="hud-mid">
          <span className="turn">
            Turn {turnIdx + 1}/{turns.length}
          </span>
          <div className="pips" role="group" aria-label="Progress this turn">
            {turn.map((b, i) => (
              <button
                key={b.slug}
                className={
                  'pip' + (revealed[b.slug] ? ' pip-on' : '') + (i === cardIdx ? ' pip-active' : '')
                }
                onClick={() => gotoCard(i)}
                aria-label={`Card ${i + 1}: ${revealed[b.slug] ? b.brand : 'hidden'}`}
              />
            ))}
          </div>
        </div>
        <div className="score">
          <strong>{score}</strong>
          <span>/{totalCards}</span>
        </div>
      </header>

      <main className="stage">
        <p className="prompt">{card.hasQuestion ? 'Guess the brand' : 'Which brand is this?'}</p>

        <SwipeCard key={card.slug} brand={card} revealed={isRevealed} onReveal={reveal} onNext={next} />

        <p className="counter">
          {cardIdx + 1} of {turn.length} in this turn
        </p>
      </main>
    </div>
  )
}

/* -------------------------------------------------------------------- card */

function SwipeCard({
  brand,
  revealed,
  onReveal,
  onNext,
}: {
  brand: Brand
  revealed: boolean
  onReveal: () => void
  onNext: () => void
}) {
  // Gesture state lives in refs, not component state: pointerup and pointerleave can
  // both fire for a single touch (pointerleave arrives after React has already
  // re-rendered with revealed=true, which used to skip straight past the answer).
  // The `startX.current === null` check makes finish() single-fire per gesture.
  const startX = useRef<number | null>(null)
  const deltaX = useRef(0)
  const lastTap = useRef(0)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)

  const onDown = (e: React.PointerEvent) => {
    if (startX.current !== null) return // ignore extra fingers mid-gesture
    startX.current = e.clientX
    deltaX.current = 0
    setDx(0)
    setDragging(true)
    // capture keeps move/up delivered here even if the finger slides off the card
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onMove = (e: React.PointerEvent) => {
    if (startX.current === null) return
    deltaX.current = e.clientX - startX.current
    setDx(deltaX.current)
  }

  // tap and swipe behave the same: reveal when hidden, advance when shown
  const finish = () => {
    if (startX.current === null) return // already handled this gesture
    startX.current = null
    setDragging(false)
    setDx(0)
    // a fast double-tap on touch produces two whole gestures in quick succession;
    // without this the card reveals and instantly advances again
    const now = Date.now()
    if (now - lastTap.current < 400) return
    lastTap.current = now
    if (revealed) onNext()
    else onReveal()
  }

  const shift = dragging ? Math.max(-150, Math.min(150, dx)) : 0
  const rotate = shift / 22

  return (
    <div
      className={'card' + (revealed ? ' card-open' : '')}
      style={{ transform: `translateX(${shift}px) rotate(${rotate}deg)` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      role="button"
      tabIndex={0}
      aria-label={revealed ? `Answer: ${brand.brand}. Tap for next.` : 'Tap or swipe to reveal'}
    >
      <div className="card-inner">
        <div className="face face-back">
          <img src={brand.questionFrame} alt="" draggable={false} />
          {!revealed && <span className="hint">tap / swipe to reveal</span>}
        </div>
        <div className="face face-front">
          <img src={brand.answerFrame} alt={`${brand.brand} logo`} draggable={false} />
          {!brand.hasQuestion && <span className="tag">single logo</span>}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- menu */

function Menu({
  best,
  onPlay,
  onQuick,
}: {
  best: number
  onPlay: () => void
  onQuick: () => void
}) {
  return (
    <div className="app menu">
      <div className="menu-inner">
        <p className="kicker">Party game</p>
        <h1>
          Logo <span>Guesser</span>
        </h1>
        <p className="blurb">
          The badge with the name ripped off. Five brands a turn, easy ones first.
          Swipe or tap to reveal.
        </p>

        <div className="menu-actions">
          <button className="play" onClick={onPlay}>
            Choose brands
          </button>
          <button className="play secondary" onClick={onQuick}>
            Quick play — all {BRANDS.length}
          </button>
        </div>

        <div className="facts">
          <div>
            <strong>{BRANDS.length}</strong>
            <span>brands</span>
          </div>
          <div>
            <strong>{TURN_SIZE}</strong>
            <span>per turn</span>
          </div>
          <div>
            <strong>{best}</strong>
            <span>your best</span>
          </div>
        </div>

        <p className="foot">Space / &crarr; reveal &middot; &larr; &rarr; card &middot; &uarr;&darr; turn</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- setup */

function Setup({
  picked,
  onToggle,
  onAll,
  onNone,
  onEasy,
  onStart,
  onBack,
}: {
  picked: Set<string>
  onToggle: (slug: string) => void
  onAll: () => void
  onNone: () => void
  onEasy: () => void
  onStart: () => void
  onBack: () => void
}) {
  const remaining = BRANDS.filter((b) => !picked.has(b.slug))
  const chosen = BRANDS.filter((b) => picked.has(b.slug))
  const nextUp = suggestTurn(remaining, TURN_SIZE)
  const turns = Math.ceil(chosen.length / TURN_SIZE)

  const byTier = [1, 2, 3].map((t) => ({
    tier: t,
    items: BRANDS.filter((b) => b.difficulty === t),
  }))

  return (
    <div className="app setup">
      <header className="hud">
        <button className="ghost" onClick={onBack} aria-label="Back to menu">
          ‹
        </button>
        <div className="hud-mid">
          <span className="turn">Choose your brands</span>
          <span className="subturn">
            {chosen.length} selected &middot; {turns} turn{turns === 1 ? '' : 's'}
          </span>
        </div>
        <button className="start" onClick={onStart} disabled={!chosen.length}>
          Start
        </button>
      </header>

      <div className="setup-body">
        <div className="toolbar">
          <span className="lbl">Quick fill</span>
          <button className="chip" onClick={onAll}>
            All {BRANDS.length}
          </button>
          <button className="chip" onClick={onEasy}>
            Easy only
          </button>
          <button className="chip" onClick={onNone}>
            Clear
          </button>
          <button
            className="chip accent"
            onClick={() => nextUp.forEach((b) => onToggle(b.slug))}
            disabled={!nextUp.length}
          >
            + Next 5 for me
          </button>

          <div className="nextup">
            <span className="lbl">Up next</span>
            {nextUp.length ? (
              nextUp.map((b) => (
                <span className="who" key={b.slug}>
                  <span className={`dot t${b.difficulty}`} aria-hidden />
                  {b.brand}
                </span>
              ))
            ) : (
              <span className="who">All selected</span>
            )}
          </div>
        </div>

        <div className="picker">
          {byTier.map(({ tier, items }) => (
            <section key={tier} className="tier">
              <h3>
                <span className={`dot t${tier}`} aria-hidden />
                {tier === 1 ? 'Well known' : tier === 2 ? 'Familiar' : 'Tricky'}
                <em>{items.length}</em>
              </h3>
              <div className="grid">
                {items.map((b) => {
                  const on = picked.has(b.slug)
                  return (
                    <button
                      key={b.slug}
                      className={'brand' + (on ? ' on' : '')}
                      onClick={() => onToggle(b.slug)}
                      aria-pressed={on}
                    >
                      <img src={b.questionFrame} alt="" loading="lazy" draggable={false} />
                      <span>{b.brand}</span>
                      <i className="tick" aria-hidden>
                        ✓
                      </i>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- finished */

function Finished({
  score,
  total,
  best,
  turns,
  onPlayAgain,
  onMenu,
}: {
  score: number
  total: number
  best: number
  turns: number
  onPlayAgain: () => void
  onMenu: () => void
}) {
  const pct = total ? Math.round((score / total) * 100) : 0
  const verdict =
    pct === 100 ? 'Flawless. You have seen all of these.'
    : pct >= 80 ? 'Strong. A couple had you.'
    : pct >= 50 ? 'Solid. The hard tail got you.'
    : 'Rough one. Run it back?'

  return (
    <div className="app menu">
      <div className="menu-inner">
        <p className="kicker">Run complete</p>
        <h1>
          {score}
          <span className="of">/{total}</span>
        </h1>
        <p className="blurb">{verdict}</p>
        <div className="facts">
          <div>
            <strong>{pct}%</strong>
            <span>correct</span>
          </div>
          <div>
            <strong>{turns}</strong>
            <span>turns</span>
          </div>
          <div>
            <strong>{best}</strong>
            <span>your best</span>
          </div>
        </div>
        <div className="menu-actions">
          <button className="play" onClick={onPlayAgain}>
            Play again
          </button>
          <button className="play secondary" onClick={onMenu}>
            Change brands
          </button>
        </div>
      </div>
    </div>
  )
}