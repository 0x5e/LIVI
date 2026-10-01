export interface RawFrame {
  channelId: number
  flags: number
  msgId: number // first 2 bytes of payload (after framing)
  payload: Buffer // bytes AFTER the 2-byte msgId (the actual proto data)
  rawPayload: Buffer // full payload including msgId bytes
}
