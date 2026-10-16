import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties, type ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { COMMAND_MAP } from '../../../shared/commands'
import { formatBinding } from '../core/shortcuts'
import { isMac } from '../platform'
import { useKeymap } from './useKeymap'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Tooltip text for a command, including its first shortcut. */
export function useCommandTip(commandId: string, label?: string): string {
  const keymap = useKeymap()
  const keys = keymap[commandId]
  const name = label ?? COMMAND_MAP[commandId]?.label ?? commandId
  return keys?.length ? `${name}  (${formatBinding(keys[0], isMac)})` : name
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  size?: 's' | 'm' | 'l'
  tipSide?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}

export function IconButton({ label, active, size = 'm', tipSide = 'bottom', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-tip={label}
      data-tip-side={tipSide}
      className={cx('icon-btn', `icon-btn--${size}`, active && 'is-active', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  small?: boolean
}

export function Button({ variant = 'secondary', small, className, ...rest }: ButtonProps) {
  return <button type="button" className={cx('btn', `btn--${variant}`, small && 'btn--small', className)} {...rest} />
}

// ---------------------------------------------------------------------------
// Popover anchored to an element

export function Popover({
  anchor,
  open,
  onClose,
  children,
  placement = 'top',
  className
}: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  children: ReactNode
  placement?: 'top' | 'bottom' | 'right' | 'left'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return
    const place = () => {
      if (!ref.current) return
      const a = anchor.getBoundingClientRect()
      const p = ref.current.getBoundingClientRect()
      const gap = 10
      let left = a.left + a.width / 2 - p.width / 2
      let top = placement === 'top' ? a.top - p.height - gap : a.bottom + gap
      if (placement === 'right') {
        left = a.right + gap
        top = a.top + a.height / 2 - p.height / 2
      } else if (placement === 'left') {
        left = a.left - p.width - gap
        top = a.top + a.height / 2 - p.height / 2
      }
      left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8))
      top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8))
      setPos({ left, top })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(ref.current)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, placement])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchor, onClose])

  if (!open) return null
  return createPortal(
    <div ref={ref} className={cx('popover', className)} style={{ position: 'fixed', ...pos }} role="dialog">
      {children}
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Modal dialog

export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 520,
  className
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, textarea, select, button:not(.dialog__close)')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      } else if (e.key === 'Tab' && el) {
        // Keep focus inside the dialog.
        const items = Array.from(el.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter(
          (n) => !n.hasAttribute('disabled') && n.offsetParent !== null
        )
        if (!items.length) return
        const i = items.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && i <= 0) {
          e.preventDefault()
          items[items.length - 1].focus()
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault()
          items[0].focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx('dialog', className)} style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog__header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn icon-btn--s dialog__close" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Context menu

export interface MenuItem {
  label: string
  shortcut?: string
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  icon?: ReactNode
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({ left: Math.min(x, window.innerWidth - r.width - 6), top: Math.min(y, window.innerHeight - r.height - 6) })
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
  }, [x, y])
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const btns = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
        const i = btns.indexOf(document.activeElement as HTMLElement)
        const next = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]
        next?.focus()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  return createPortal(
    <div ref={ref} className="menu" role="menu" style={{ position: 'fixed', ...pos }}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu__sep" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={cx('menu__item', it.danger && 'is-danger')}
            onClick={() => {
              onClose()
              it.onSelect?.()
            }}
          >
            <span className="menu__icon">{it.icon}</span>
            <span className="menu__label">{it.label}</span>
            {it.shortcut && <span className="menu__shortcut">{it.shortcut}</span>}
          </button>
        )
      )}
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Form controls

export function Swatch({ color, active, onClick, label, size = 24 }: { color: string | null; active?: boolean; onClick: () => void; label?: string; size?: number }) {
  return (
    <button
      type="button"
      className={cx('swatch', active && 'is-active', !color && 'swatch--none')}
      style={{ width: size, height: size, ['--swatch' as string]: color ?? 'transparent' }}
      onClick={onClick}
      aria-label={label ?? color ?? 'No colour'}
      aria-pressed={active}
      data-tip={label ?? color ?? 'No fill'}
    />
  )
}

export function ColorRow({
  colors,
  value,
  onChange,
  allowNone,
  allowCustom = true
}: {
  colors: string[]
  value: string | null
  onChange: (c: string | null) => void
  allowNone?: boolean
  allowCustom?: boolean
}) {
  const norm = (c: string | null) => (c ? c.toLowerCase() : null)
  const inPalette = colors.some((c) => norm(c) === norm(value))
  return (
    <div className="color-row">
      {allowNone && <Swatch color={null} active={value === null} onClick={() => onChange(null)} label="No fill" />}
      {colors.map((c) => (
        <Swatch key={c} color={c} active={norm(c) === norm(value)} onClick={() => onChange(c)} />
      ))}
      {allowCustom && (
        <label className={cx('swatch swatch--custom', value && !inPalette && 'is-active')} data-tip="Custom colour" style={{ ['--swatch' as string]: value && !inPalette ? value : 'transparent' }}>
          <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Custom colour" />
        </label>
      )}
    </div>
  )
}

/** A compact colour control: a swatch button that opens a palette popover. */
export function ColorButton({
  colors,
  value,
  onChange,
  allowNone,
  label
}: {
  colors: string[]
  value: string | null
  onChange: (c: string | null) => void
  allowNone?: boolean
  label: string
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        type="button"
        className="color-btn"
        aria-label={`${label}: ${value ?? 'none'}`}
        aria-haspopup="dialog"
        data-tip={label}
        onClick={(e) => setAnchor(anchor ? null : (e.currentTarget as HTMLElement))}
      >
        <span className={cx('color-btn__swatch', !value && 'swatch--none')} style={{ background: value ?? undefined }} />
        <span className="color-btn__label">{label}</span>
      </button>
      <Popover anchor={anchor} open={!!anchor} onClose={() => setAnchor(null)} placement="top" className="color-pop">
        <ColorRow
          colors={colors}
          value={value}
          allowNone={allowNone}
          onChange={(c) => {
            onChange(c)
            setAnchor(null)
          }}
        />
      </Popover>
    </>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx('segmented__item', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
          data-tip={o.title}
          aria-label={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit = ''
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  unit?: string
}) {
  return (
    <label className="slider">
      <span className="slider__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider__value">
        {Math.round(value * 10) / 10}
        {unit}
      </span>
    </label>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}
