import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * `tailwind-merge` only knows Tailwind's stock scales. The design system's custom font-size
 * (`text-headline-lg`, `text-label-sm`, …) and shadow (`shadow-card`, …) tokens from
 * `globals.css` would otherwise be classified as *colors* — and `cn('text-headline-lg',
 * 'text-foreground')` would silently drop the size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display-lg',
        'headline-lg',
        'headline-md',
        'headline-sm',
        'body-lg',
        'body-md',
        'body-sm',
        'label-lg',
        'label-md',
        'label-sm',
      ],
      shadow: ['card', 'raised', 'cta', 'modal', 'bar'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
