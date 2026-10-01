describe('telemetry widgets index', () => {
  test('re-exports all widgets', async () => {
    const mod = await import('../index')

    expect(mod).toHaveProperty('normalizeGear')
    expect(mod).toHaveProperty('NavFull')
    expect(mod).toHaveProperty('NavMini')
  })
})
