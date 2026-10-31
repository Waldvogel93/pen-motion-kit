import rawDecisions from '@decisions'
import { useEffect } from 'react'
import { useHashRoute, visibleScreens } from '@/app/router'
import { DecisionsError, parseDecisions } from '@/motion/decisions'
import { MotionPanel } from '@/motion/panel/MotionPanel'
import { styles } from '@/motion/registry'
import { ScreenTransition } from '@/motion/roles'
import { MotionRoot, ScreenProvider, useMotionRuntime } from '@/motion/runtime'
import type { MotionDecisions } from '@/motion/types'
import { screens as allScreens, type ScreenDef } from '@/screens'

function readDecisions(): { decisions: MotionDecisions } | { error: string } {
  try {
    return { decisions: parseDecisions(rawDecisions) }
  } catch (e) {
    if (e instanceof DecisionsError) return { error: e.message }
    throw e
  }
}

const read = readDecisions()

declare global {
  interface Window {
    /** Что в макете есть: из этого объекта e2e-проверки берут, что обходить. */
    __MOTION__?: { screens: string[]; candidates: string[] }
  }
}

/** Экран пересоздаётся при смене стиля и по «Проиграть появление» — появление играет заново. */
function CurrentScreen({ screen }: { screen: ScreenDef }) {
  const { activeId, replayKey } = useMotionRuntime()
  const Screen = screen.component
  return <Screen key={activeId + ':' + replayKey} />
}

export default function App() {
  const decisions = 'decisions' in read ? read.decisions : undefined
  const screens = visibleScreens(allScreens, { isProd: import.meta.env.PROD, styleFixed: decisions?.style != null })
  const screen = useHashRoute(screens)
  const screenIds = screens.map((s) => s.id)
  const candidates = decisions?.candidates ?? []
  useEffect(() => {
    window.__MOTION__ = { screens: screenIds, candidates }
  })
  if ('error' in read) {
    return (
      <main role="alert" className="p-8 text-destructive">
        Решения о движении не прочитаны, макет не запущен. {read.error}
      </main>
    )
  }
  return (
    <MotionRoot decisions={read.decisions} styles={styles}>
      {screen ? (
        <ScreenTransition screenId={screen.id}>
          <ScreenProvider name={screen.id}>
            <CurrentScreen screen={screen} />
          </ScreenProvider>
        </ScreenTransition>
      ) : (
        <main className="p-8 text-muted-foreground">
          Экранов пока нет: добавьте их в src/screens/index.ts.
        </main>
      )}
      <ScreenProvider name={screen?.id ?? ''}>
        <MotionPanel />
      </ScreenProvider>
    </MotionRoot>
  )
}
