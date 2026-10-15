// Item lifecycle:
//   queued -> reading -> preparing -> processing -> done
//                                  \-> error
//                                  \-> cancelled  (via Stop)

/** In flight right now — cannot be removed or retried. */
const ACTIVE = ['reading', 'preparing', 'processing']

/** Not finished yet, including images still waiting their turn. */
const PENDING = ['queued', ...ACTIVE]

export function isActive(status) {
  return ACTIVE.includes(status)
}

export function isPending(status) {
  return PENDING.includes(status)
}
