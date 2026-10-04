import type { SettingsCustomPageProps } from '@settings/type'
import type { Config } from '@shared/types'
import { useStatusStore } from '@store/store'
import { updateCameras as detectCameras } from '@utils/cameraDetection'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { SelectOptionRow } from '../../components/selectOptionRow'

function coerceSelectValue<T extends string | number>(
  value: T | null | undefined,
  options: readonly T[]
): T | '' {
  return value != null && options.includes(value as T) ? (value as T) : ''
}

export const Camera: React.FC<SettingsCustomPageProps<Config, string>> = ({ state, onChange }) => {
  const navigate = useNavigate()
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  const setCameraFound = useStatusStore((s) => s.setCameraFound)

  const safeCameraPersist = useCallback(
    async (cfgOrId: string | { cameraId?: string } | null | undefined) => {
      if (state?.cameraId && state.cameraId !== '') return
      const cameraId = typeof cfgOrId === 'string' ? cfgOrId : cfgOrId?.cameraId

      if (cameraId && cameraId !== '') onChange(cameraId)
    },
    [onChange, state.cameraId]
  )

  useEffect(() => {
    detectCameras(setCameraFound, safeCameraPersist, state).then(setCameras)
  }, [safeCameraPersist, setCameraFound, state])

  const cameraOptions = useMemo<readonly { deviceId: string; label: string }[]>(
    () =>
      cameras.length
        ? cameras.map((c) => ({ deviceId: c.deviceId ?? '', label: c.label || 'Camera' }))
        : [{ deviceId: '', label: 'No camera' }],
    [cameras]
  )
  const cameraIds = useMemo<readonly string[]>(
    () => cameraOptions.map((c) => c.deviceId),
    [cameraOptions]
  )
  const cameraValue = coerceSelectValue(state?.cameraId ?? '', cameraIds)

  return (
    <>
      {cameraOptions.map((o) => (
        <SelectOptionRow
          key={o.deviceId || 'none'}
          label={o.label}
          selected={o.deviceId !== '' && o.deviceId === cameraValue}
          onClick={
            o.deviceId
              ? () => {
                  onChange(o.deviceId)
                  navigate(-1)
                }
              : undefined
          }
        />
      ))}
    </>
  )
}
