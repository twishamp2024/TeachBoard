import { CheckCircle2, Info, Loader2, TriangleAlert, X } from 'lucide-react'
import { useUi } from '../../state/ui'
import { cx } from '../primitives'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', `toast--${t.kind}`)}>
          {t.kind === 'success' ? <CheckCircle2 size={17} /> : t.kind === 'error' ? <TriangleAlert size={17} /> : <Info size={17} />}
          <span className="toast__msg">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function BusyOverlay() {
  const busy = useUi((s) => s.busy)
  if (!busy) return null
  return (
    <div className="busy" role="alert" aria-busy="true">
      <div className="busy__card">
        <Loader2 size={20} className="spin" />
        <span>{busy}</span>
      </div>
    </div>
  )
}
