describe('main constants', () => {
  test('exports expected window size constants', async () => {
    const constants = await import('../constants')

    expect(constants.MIN_WIDTH).toBe(300)
    expect(constants.MIN_HEIGHT).toBe(200)
    expect(constants.DEFAULT_WIDTH).toBe(800)
    expect(constants.DEFAULT_HEIGHT).toBe(480)
  })
})
