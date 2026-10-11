import { config } from '../../config.js'

// Jev and the main model score on different scales, so each judge is held to its own threshold.
export function admitThreshold(): number {
  return config.memory.judge === 'model' ? config.memory.modelAdmitThreshold : config.memory.admitThreshold
}

export function verifyThreshold(): number {
  return config.memory.judge === 'model' ? config.memory.modelVerifyThreshold : config.memory.verifyThreshold
}
