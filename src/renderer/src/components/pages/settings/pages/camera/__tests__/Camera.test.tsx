import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Camera } from '../Camera'

const renderCamera = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

const setCameraFound = vi.fn()

const detectCameras = vi.fn().mockResolvedValue([
  { deviceId: 'cam-1', label: 'Front cam' },
  { deviceId: 'cam-2', label: 'Rear cam' }
])

vi.mock('@utils/cameraDetection', () => ({
  updateCameras: (...args: unknown[]) => detectCameras(...args)
}))

vi.mock('@store/store', () => ({
  useStatusStore: (selector: (s: any) => unknown) => selector({ setCameraFound }),
  useLiviStore: (selector: (s: any) => unknown) => selector({ audioDevicesRevision: 0 })
}))

describe('Settings Camera page', () => {
  beforeEach(async () => {
    detectCameras.mockClear()
    setCameraFound.mockClear()
  })

  test('loads camera options', async () => {
    const onChange = vi.fn()
    const { unmount } = renderCamera(<Camera state={{ cameraId: '' } as any} onChange={onChange} />)

    await waitFor(() => {
      expect(detectCameras).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText('Front cam')).toBeInTheDocument()
      expect(screen.getByText('Rear cam')).toBeInTheDocument()
    })
    unmount()
  })

  test('safeCameraPersist skips onChange when camera is already configured', async () => {
    // lines 26-27: if (state.cameraId && state.cameraId !== '') return early
    const onChange = vi.fn()
    renderCamera(<Camera state={{ cameraId: 'cam-1' } as any} onChange={onChange} />)

    await waitFor(() => expect(detectCameras).toHaveBeenCalled())

    // detectCameras is called with (setCameraFound, safeCameraPersist, state) → index 1
    const [, persistFn] = detectCameras.mock.calls[0]
    await persistFn('cam-2')
    expect(onChange).not.toHaveBeenCalled()
  })

  test('safeCameraPersist calls onChange when camera is not yet set', async () => {
    // lines 28-29: cameraId && onChange(cameraId)
    const onChange = vi.fn()
    renderCamera(<Camera state={{ cameraId: '' } as any} onChange={onChange} />)

    await waitFor(() => expect(detectCameras).toHaveBeenCalled())

    const [, persistFn] = detectCameras.mock.calls[0]
    await persistFn('cam-1')
    expect(onChange).toHaveBeenCalledWith('cam-1')
  })

  test('safeCameraPersist accepts object with cameraId property', async () => {
    // line 27: cfgOrId?.cameraId branch
    const onChange = vi.fn()
    renderCamera(<Camera state={{ cameraId: '' } as any} onChange={onChange} />)

    await waitFor(() => expect(detectCameras).toHaveBeenCalled())

    const [, persistFn] = detectCameras.mock.calls[0]
    await persistFn({ cameraId: 'cam-1' })
    expect(onChange).toHaveBeenCalledWith('cam-1')
  })

  test('camera label falls back to "Camera" when label is empty', async () => {
    // line 50: c.label || 'Camera'
    detectCameras.mockResolvedValueOnce([{ deviceId: 'cam-x', label: '' }])
    renderCamera(<Camera state={{ cameraId: 'cam-x' } as any} onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Camera')).toBeInTheDocument()
    })
  })

  test('shows "No camera" option label when no cameras detected', async () => {
    // cameras.length === 0 → cameraOptions = [{deviceId:'', label:'No camera'}]
    detectCameras.mockResolvedValueOnce([])
    renderCamera(<Camera state={{ cameraId: '' } as any} onChange={vi.fn()} />)

    await waitFor(() => expect(detectCameras).toHaveBeenCalled())

    await waitFor(() => {
      expect(screen.getByText('No camera')).toBeInTheDocument()
    })
  })

  test('selecting a camera option forwards the value to onChange', async () => {
    const onChange = vi.fn()
    renderCamera(<Camera state={{ cameraId: '' } as any} onChange={onChange} />)

    await waitFor(() => expect(detectCameras).toHaveBeenCalled())

    await waitFor(() => expect(screen.getByText('Rear cam')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Rear cam' }))

    expect(onChange).toHaveBeenCalledWith('cam-2')
  })

  test('camera without a deviceId falls back to an empty option id', async () => {
    detectCameras.mockResolvedValueOnce([{ deviceId: undefined, label: 'Ghost cam' }])
    renderCamera(<Camera state={{} as any} onChange={vi.fn()} />)

    await waitFor(() => expect(detectCameras).toHaveBeenCalled())

    await waitFor(() => expect(screen.getByText('Ghost cam')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Ghost cam' })).toBeNull()
  })
})
