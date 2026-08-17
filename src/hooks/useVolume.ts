import { useStorageValue } from './useStorageValue'

export function useVolume(defaultValue = 1) {
  return useStorageValue('volume', defaultValue)
}
