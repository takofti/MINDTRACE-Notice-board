import { useEffect, useState } from 'react'
import { resolveAssetUrl } from '@/services/storage'

/** Resolves persistent asset references into URLs the DOM can render. */
export function useAssetUrl(ref?: string): { url: string | undefined; loading: boolean; error: boolean } {
  const immediate = ref && !ref.startsWith('webasset://') ? ref : undefined
  const [state, setState] = useState<{ url: string | undefined; loading: boolean; error: boolean }>({
    url: immediate,
    loading: Boolean(ref && !immediate),
    error: false
  })

  useEffect(() => {
    if (!ref) {
      setState({ url: undefined, loading: false, error: false })
      return
    }
    if (!ref.startsWith('webasset://')) {
      setState({ url: ref, loading: false, error: false })
      return
    }
    let alive = true
    setState({ url: undefined, loading: true, error: false })
    resolveAssetUrl(ref)
      .then((url) => {
        if (alive) setState({ url, loading: false, error: false })
      })
      .catch(() => {
        if (alive) setState({ url: undefined, loading: false, error: true })
      })
    return () => {
      alive = false
    }
  }, [ref])

  return state
}
