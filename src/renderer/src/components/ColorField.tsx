import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pipette } from 'lucide-react'
import { useT } from '@/i18n'
import { t } from '@/i18n'

const PALETTE = [
  '#e9e6de',
  '#c8553d',
  '#c99a3d',
  '#6e9c73',
  '#5b8db8',
  '#a06aa8',
  '#d4753f',
  '#e8c56a',
  '#e7a4b2',
  '#9fbfdc',
  '#1f2228',
  '#8b909a'
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeHex(value: string): string {
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase()
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`
  return '#000000'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = normalizeHex(hex).slice(1)
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export default function ColorField({
  value,
  onChange,
  onCommitStart,
  onCommitEnd,
  compact = false,
  alpha,
  onAlphaChange
}: {
  value: string
  onChange: (value: string) => void
  onCommitStart?: () => void
  onCommitEnd?: () => void
  compact?: boolean
  alpha?: number
  onAlphaChange?: (value: number) => void
}): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(normalizeHex(value))
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const color = normalizeHex(value)

  const rgb = useMemo(() => hexToRgb(color), [color])
  const hsv = useMemo(() => rgbToHsv(rgb.r, rgb.g, rgb.b), [rgb.r, rgb.g, rgb.b])
  const [hue, setHue] = useState(hsv.h)
  const [saturation, setSaturation] = useState(hsv.s)
  const [brightness, setBrightness] = useState(hsv.v)

  useEffect(() => {
    setDraft(color)
    const next = rgbToHsv(rgb.r, rgb.g, rgb.b)
    setHue(next.h)
    setSaturation(next.s)
    setBrightness(next.v)
  }, [color, rgb.r, rgb.g, rgb.b])

  useEffect(() => {
    if (!open) return
    const updatePosition = (): void => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 274
      const height = 330
      setPosition({
        x: clamp(rect.left, 10, window.innerWidth - width - 10),
        y: clamp(rect.bottom + 7, 10, window.innerHeight - height - 10)
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    const close = (event: PointerEvent): void => {
      if (!popoverRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        setOpen(false)
        onCommitEnd?.()
      }
    }
    window.addEventListener('pointerdown', close, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('pointerdown', close, true)
    }
  }, [open, onCommitEnd])

  const apply = (next: { h?: number; s?: number; v?: number }): void => {
    const nextH = next.h ?? hue
    const nextS = clamp(next.s ?? saturation, 0, 1)
    const nextV = clamp(next.v ?? brightness, 0, 1)
    setHue(nextH)
    setSaturation(nextS)
    setBrightness(nextV)
    const colorRgb = hsvToRgb(nextH, nextS, nextV)
    const nextHex = rgbToHex(colorRgb.r, colorRgb.g, colorRgb.b)
    setDraft(nextHex)
    onChange(nextHex)
  }

  return (
    <div className="color-field">
      <button
        ref={buttonRef}
        type="button"
        className={`color-field-button ${compact ? 'is-compact' : ''}`}
        onClick={() => {
          if (!open) onCommitStart?.()
          setOpen((value) => !value)
          if (open) onCommitEnd?.()
        }}
        title={t('Choose a colour')}
        aria-label={t('Choose a colour')}
      >
        <span className="color-field-swatch checker" style={{ background: color }} />
        {!compact && <span className="color-field-hex">{color.toUpperCase()}</span>}
        <Pipette size={11} />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="color-popover"
            style={{ left: position.x, top: position.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="color-popover-head">
              <strong>{t('Pick colour')}</strong>
              <span className="color-popover-preview checker" style={{ background: color }} />
            </div>
            <div
              className="color-sv"
              style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))` }}
              onPointerDown={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                const move = (clientX: number, clientY: number): void => {
                  apply({
                    s: (clientX - rect.left) / rect.width,
                    v: 1 - (clientY - rect.top) / rect.height
                  })
                }
                move(event.clientX, event.clientY)
                const onMove = (moveEvent: PointerEvent): void => move(moveEvent.clientX, moveEvent.clientY)
                const onUp = (): void => {
                  window.removeEventListener('pointermove', onMove)
                  window.removeEventListener('pointerup', onUp)
                }
                window.addEventListener('pointermove', onMove)
                window.addEventListener('pointerup', onUp)
              }}
            >
              <span
                className="color-sv-thumb"
                style={{ left: `${saturation * 100}%`, top: `${(1 - brightness) * 100}%`, background: color }}
              />
            </div>
            <div className="color-sliders">
              <label className="color-slider-row">
                <span>{t('Hue')}</span>
                <input
                  className="color-hue"
                  type="range"
                  min={0}
                  max={360}
                  value={hue}
                  onChange={(event) => apply({ h: Number(event.target.value) })}
                />
              </label>
              {onAlphaChange && alpha !== undefined && (
                <label className="color-slider-row">
                  <span>{t('Alpha')}</span>
                  <input
                    className="color-alpha"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={alpha}
                    style={{ '--alpha-color': color } as React.CSSProperties}
                    onChange={(event) => onAlphaChange(Number(event.target.value))}
                  />
                  <span className="color-alpha-value">{Math.round(alpha * 100)}%</span>
                </label>
              )}
            </div>
            <div className="color-hex-row">
              <span className="color-hex-label">{t("HEX")}</span>
              <input
                className="input color-hex-input"
                value={draft}
                spellCheck={false}
                onChange={(event) => {
                  setDraft(event.target.value)
                  if (/^#?[0-9a-f]{6}$/i.test(event.target.value.trim()) || /^#?[0-9a-f]{3}$/i.test(event.target.value.trim())) {
                    onChange(normalizeHex(event.target.value))
                  }
                }}
                onBlur={() => setDraft(color)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onChange(normalizeHex(draft))
                    setOpen(false)
                    onCommitEnd?.()
                  }
                }}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setOpen(false)
                  onCommitEnd?.()
                }}
                title={t('Done')}
              >
                <Check size={13} />
              </button>
            </div>
            <div className="color-palette">
              {PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`color-palette-swatch ${color === swatch ? 'is-active' : ''}`}
                  style={{ background: swatch }}
                  onClick={() => {
                    onChange(swatch)
                    setDraft(swatch)
                  }}
                  title={swatch}
                />
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
