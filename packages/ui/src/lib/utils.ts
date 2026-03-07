import type { MutableRefObject, Ref } from 'react'
import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') ref(value)
      else if (ref != null) (ref as MutableRefObject<T | null>).current = value
    })
  }
}
