import type { Navigation } from '@shared/core/contract'

export function guidance(fields: Partial<Navigation> = {}): Navigation {
  return {
    active: true,
    orderType: null,
    roadName: 'Main Street',
    afterRoadName: null,
    destinationName: 'Berlin',
    timeToDestination: 720,
    distanceToDestination: 5000,
    remainDistance: 200,
    maneuverType: 2,
    turnSide: 2,
    junctionType: null,
    turnAngle: null,
    eta: null,
    etaText: null,
    appName: 'Maps',
    image: null,
    maneuverText: 'Turn right',
    maneuverDistanceText: '200 m',
    destinationDistanceText: '5 km',
    timeLeftText: '12 min',
    ...fields
  }
}
