'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

const REVEAL_AT_TOP = 16
const HIDE_AFTER_SCROLL = 120
const DELTA = 6
const STABLE_FRAMES_NEEDED = 4

export default function HeaderScrollBehavior({ children }: { children?: ReactNode }) {
  const searchParams = useSearchParams()
  const localeParam = searchParams?.get('locale') ?? ''
  const savedScrollY = useRef<number | null>(null)
  const lastLocale = useRef(localeParam)

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false

    const update = () => {
      const y = window.scrollY
      const diff = y - lastY

      if (y < REVEAL_AT_TOP) {
        document.body.classList.remove('cms-scrolled-down')
      } else if (diff > DELTA && y > HIDE_AFTER_SCROLL) {
        document.body.classList.add('cms-scrolled-down')
      } else if (diff < -DELTA) {
        document.body.classList.remove('cms-scrolled-down')
      }

      lastY = y
      ticking = false
    }

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update)
        ticking = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.body.classList.remove('cms-scrolled-down')
    }
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const button = target?.closest('.popup-button-list__button')
      if (button?.querySelector('[data-locale]')) {
        savedScrollY.current = window.scrollY
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (localeParam === lastLocale.current) return
    lastLocale.current = localeParam
    if (savedScrollY.current === null) return

    const targetY = savedScrollY.current
    savedScrollY.current = null

    let cancelled = false
    let frameId = 0
    let stableFrames = 0
    let lastHeight = -1

    const attempt = () => {
      if (cancelled) return
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (maxScroll === lastHeight) {
        stableFrames++
      } else {
        stableFrames = 0
        lastHeight = maxScroll
      }
      if (stableFrames >= STABLE_FRAMES_NEEDED) {
        window.scrollTo(0, Math.min(targetY, maxScroll))
        return
      }
      frameId = window.requestAnimationFrame(attempt)
    }

    frameId = window.requestAnimationFrame(attempt)

    return () => {
      cancelled = true
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [localeParam])

  return <>{children}</>
}
