vi.mock('../ui', () => ({
  __esModule: true,
  UIType: 'UITypeMock'
}))

describe('types index', () => {
  test('re-exports types modules', async () => {
    const mod = await import('../index')

    expect(mod.UIType).toBe('UITypeMock')
  })
})
