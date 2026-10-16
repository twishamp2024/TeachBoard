import { currentPage, useDoc } from '../../state/doc'
import { useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'
import { fitViewport } from '../../state/view'

/** The current page's effective zoom (fitted when the user has not zoomed). */
export function useViewportZoom(): { zoom: number } {
  const page = useDoc((s) => currentPage(s))
  const stored = useUi((s) => s.viewports[page.id])
  const size = useUi((s) => s.viewSize)
  useSettings((s) => s.settings.toolbar.position)
  if (stored && !stored.fit) return { zoom: stored.zoom }
  return { zoom: fitViewport(size.w, size.h, page).zoom }
}
