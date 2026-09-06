import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwa() {
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches)
  const [canInstall, setCanInstall] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [updateReady, setUpdateReady] = useState(false)
  const installEvent = useRef<InstallEvent | null>(null)
  const updater = useRef<((reloadPage?: boolean) => Promise<void>) | undefined>(undefined)

  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault()
      installEvent.current = event as InstallEvent
      setCanInstall(true)
    }
    const installedHandler = () => { setInstalled(true); setCanInstall(false); installEvent.current = null }
    const onlineHandler = () => setOnline(navigator.onLine)
    const mode = window.matchMedia('(display-mode: standalone)')
    const modeHandler = () => setInstalled(mode.matches)
    window.addEventListener('beforeinstallprompt', install)
    window.addEventListener('appinstalled', installedHandler)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', onlineHandler)
    mode.addEventListener('change', modeHandler)
    let mounted = true
    if ('serviceWorker' in navigator) {
      updater.current = registerSW({
        immediate: true,
        onNeedRefresh: () => { if (mounted) setUpdateReady(true) },
        onOfflineReady: () => { if (mounted) setOfflineReady(true) },
      })
      void navigator.serviceWorker.ready.then(() => { if (mounted) setOfflineReady(true) })
    }
    return () => {
      mounted = false
      window.removeEventListener('beforeinstallprompt', install)
      window.removeEventListener('appinstalled', installedHandler)
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', onlineHandler)
      mode.removeEventListener('change', modeHandler)
    }
  }, [])

  async function install() {
    if (!installEvent.current) return
    const current = installEvent.current
    installEvent.current = null
    setCanInstall(false)
    await current.prompt()
    await current.userChoice
  }

  return { installed, canInstall, offlineReady, online, updateReady, install, update: () => updater.current?.(true) }
}
