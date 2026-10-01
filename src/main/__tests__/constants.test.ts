describe('main constants', () => {
  const originalDebug = process.env.DEBUG

  beforeEach(async () => {
    vi.resetModules()
    process.env.DEBUG = originalDebug
  })

  afterAll(async () => {
    process.env.DEBUG = originalDebug
  })

  test('exports expected window size constants', async () => {
    const constants = await import('../constants')

    expect(constants.MIN_WIDTH).toBe(300)
    expect(constants.MIN_HEIGHT).toBe(200)
    expect(constants.DEFAULT_WIDTH).toBe(800)
    expect(constants.DEFAULT_HEIGHT).toBe(480)
  })

  test('NULL_DELETES contains expected resettable config keys', async () => {
    const { NULL_DELETES } = await import('../constants')

    expect(NULL_DELETES).toEqual([
      'primaryColorDark',
      'primaryColorLight',
      'highlightColorDark',
      'highlightColorLight'
    ])
  })

  test('DEBUG is true when DEBUG=1', async () => {
    process.env.DEBUG = '1'
    vi.resetModules()

    const { DEBUG } = await import('../constants')

    expect(DEBUG).toBe(true)
  })

  test('DEBUG is false when DEBUG is not 1', async () => {
    process.env.DEBUG = '0'
    vi.resetModules()

    const { DEBUG } = await import('../constants')

    expect(DEBUG).toBe(false)
  })
})
