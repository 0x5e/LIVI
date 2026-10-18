import { ManeuverType, roundaboutExitNumber } from '@main/shared/types/NavigationTypes'

describe('roundaboutExitNumber', () => {
  test('counts the exits from the first roundabout exit code', () => {
    expect(roundaboutExitNumber(ManeuverType.RoundaboutExit1)).toBe(1)
    expect(roundaboutExitNumber(ManeuverType.RoundaboutExit19)).toBe(19)
    expect(roundaboutExitNumber(ManeuverType.EndOfDirections)).toBeUndefined()
    expect(roundaboutExitNumber(ManeuverType.SharpLeft)).toBeUndefined()
  })
})
