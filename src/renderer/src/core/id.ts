let counter = 0

/** Collision-resistant, readable ids. Time prefix keeps z-ordering stable. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 0xffff
  const time = Date.now().toString(36).slice(-6)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${time}${counter.toString(36)}${rand}`
}

export function pinId(): string {
  return uid('pin')
}
