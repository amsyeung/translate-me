import { useStorageValue } from './useStorageValue'

export function useRate(defaultValue = 0.9) {
  return useStorageValue('rate', defaultValue)
}
