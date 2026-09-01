/**
 * The React context `ContentProvider.tsx` populates and `useContent()` reads.
 *
 * Split into its own (non-component) module so `ContentProvider.tsx` only exports the
 * `ContentProvider` component — a file that exports both a component and a plain function
 * (here, the `useContent` hook) breaks Vite's fast-refresh boundary
 * (`react-refresh/only-export-components`).
 */
import { createContext, useContext } from 'react'
import type { Manifest } from '@/content/content.schema.ts'

export interface ContentContextValue {
  readonly manifest: Manifest
  readonly wordCount: number
}

export const ContentContext = createContext<ContentContextValue | null>(null)

/** Reads the loaded manifest/word-count. Throws if called outside `<ContentProvider>` —
 *  a real bug, not a loading state (the provider never renders `children` until ready). */
export function useContent(): ContentContextValue {
  const value = useContext(ContentContext)
  if (!value) {
    throw new Error('useContent() must be used inside <ContentProvider>')
  }
  return value
}
