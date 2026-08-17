import { useStorageValue } from './useStorageValue'

export function usePitch(defaultValue = 1.2) {
  return useStorageValue('pitch', defaultValue)
}
