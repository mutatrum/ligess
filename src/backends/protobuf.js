/**
 * Lightweight Protobuf field parser for decoding length-delimited and varint fields
 * without external dependencies.
 * @param {Buffer} buffer
 * @returns {Array<{ fieldNum: number, wireType: number, val?: number, data?: Buffer }>}
 */
function parseProtobufFields(buffer) {
  let offset = 0
  const fields = []
  while (offset < buffer.length) {
    const key = buffer[offset++]
    const fieldNum = key >> 3
    const wireType = key & 7
    if (wireType === 0) {
      let val = 0, shift = 0
      while (true) {
        if (offset >= buffer.length) break
        const b = buffer[offset++]
        val |= (b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7
      }
      fields.push({ fieldNum, wireType, val })
    } else if (wireType === 2) {
      let len = 0, shift = 0
      while (true) {
        if (offset >= buffer.length) break
        const b = buffer[offset++]
        len |= (b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7
      }
      if (offset + len > buffer.length) break
      const data = buffer.subarray(offset, offset + len)
      offset += len
      fields.push({ fieldNum, wireType, data })
    } else {
      break
    }
  }
  return fields
}

module.exports = {
  parseProtobufFields
}
