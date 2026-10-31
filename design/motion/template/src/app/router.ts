import { useEffect, useState } from 'react'
import type { ScreenDef } from '@/screens/types'

/** id экрана из хэша вида `#/<id>`; неизвестный или пустой хэш — первый экран, пустой список — ''. */
export function parseHash(hash: string, ids: string[]): string {
  let id = ''
  try {
    id = decodeURIComponent(hash.replace(/^#\/?/, ''))
  } catch {
    // битая кодировка — как неизвестный id
  }
  return ids.includes(id) ? id : (ids[0] ?? '')
}

export function useHashRoute(screens: ScreenDef[]): ScreenDef | undefined {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const id = parseHash(hash, screens.map((s) => s.id))
  return screens.find((s) => s.id === id)
}

/** В итоговой сборке с выбранным стилем экраны с `_` (черновики, доски вариантов) не показываются. */
export function visibleScreens(screens: ScreenDef[], o: { isProd: boolean; styleFixed: boolean }): ScreenDef[] {
  return o.isProd && o.styleFixed ? screens.filter((s) => !s.id.startsWith('_')) : screens
}
