// The play queue ("Up next"): an ordered list, a position in it, and the rules for shuffling, repeating and editing it.
// These are plain functions that return a new queue, so every rule can be tested without a browser or any audio.

export type QueueItem = { uid: string; trackId: string }
export type RepeatMode = 'off' | 'all' | 'one'

export type Queue = {
  items: QueueItem[]
  /** Position of the song that is playing; -1 when the queue is empty. */
  index: number
  /** While shuffled, the order the songs were in before, so turning shuffle off puts them back. */
  original: string[] | null
}

export const emptyQueue: Queue = { items: [], index: -1, original: null }

let counter = 0
const newUid = (): string => {
  counter += 1
  return `q${Date.now().toString(36)}${counter.toString(36)}`
}

export const itemFor = (trackId: string): QueueItem => ({ uid: newUid(), trackId })

export function makeQueue(trackIds: readonly string[], startIndex = 0): Queue {
  const items = trackIds.map(itemFor)
  return { items, index: items.length === 0 ? -1 : Math.min(Math.max(startIndex, 0), items.length - 1), original: null }
}

export const currentItem = (queue: Queue): QueueItem | null => queue.items[queue.index] ?? null

export const upcoming = (queue: Queue): QueueItem[] => queue.items.slice(queue.index + 1)

/** The position to move to after a song ends or Next is pressed; null at the end of a queue that does not repeat. */
export function nextIndex(queue: Queue, repeat: RepeatMode, manual: boolean): number | null {
  if (queue.items.length === 0) return null
  if (repeat === 'one' && !manual) return queue.index
  if (queue.index + 1 < queue.items.length) return queue.index + 1
  return repeat === 'all' || (repeat === 'one' && manual) ? 0 : null
}

export function previousIndex(queue: Queue, repeat: RepeatMode): number | null {
  if (queue.items.length === 0) return null
  if (queue.index > 0) return queue.index - 1
  return repeat === 'all' ? queue.items.length - 1 : null
}

export const jump = (queue: Queue, index: number): Queue =>
  index >= 0 && index < queue.items.length ? { ...queue, index } : queue

/** Songs that play right after the current one ("Play next"). */
export function insertNext(queue: Queue, trackIds: readonly string[]): Queue {
  const added = trackIds.map(itemFor)
  const items = [...queue.items]
  items.splice(queue.index + 1, 0, ...added)
  // While shuffled, the saved order learns about them too, so un-shuffling keeps them right after the playing song.
  let original = queue.original
  if (original) {
    const at = original.indexOf(queue.items[queue.index]?.uid ?? '')
    original = [...original]
    original.splice(at + 1, 0, ...added.map((item) => item.uid))
  }
  return { ...queue, items, index: queue.index < 0 ? 0 : queue.index, original }
}

/** Songs added to the end ("Add to queue"). */
export function append(queue: Queue, trackIds: readonly string[]): Queue {
  const added = trackIds.map(itemFor)
  const items = [...queue.items, ...added]
  return {
    ...queue,
    items,
    index: queue.index < 0 && items.length > 0 ? 0 : queue.index,
    original: queue.original ? [...queue.original, ...added.map((item) => item.uid)] : null,
  }
}

export function removeAt(queue: Queue, index: number): Queue {
  if (index < 0 || index >= queue.items.length) return queue
  const items = queue.items.filter((_item, position) => position !== index)
  const newIndex = items.length === 0 ? -1 : index < queue.index ? queue.index - 1 : Math.min(queue.index, items.length - 1)
  return {
    items,
    index: newIndex,
    original: queue.original ? queue.original.filter((uid) => uid !== queue.items[index].uid) : null,
  }
}

/** Drags the song at `from` to `to`; the playing song stays the playing song wherever it ends up. */
export function move(queue: Queue, from: number, to: number): Queue {
  if (from === to || from < 0 || to < 0 || from >= queue.items.length || to >= queue.items.length) return queue
  const items = [...queue.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  const playing = queue.items[queue.index]
  return { ...queue, items, index: playing ? items.findIndex((item) => item.uid === playing.uid) : queue.index }
}

/** Removes everything after the playing song. */
export const clearUpcoming = (queue: Queue): Queue => ({ ...queue, items: queue.items.slice(0, queue.index + 1), original: null })

/** Shuffles what is still to come; the playing song stays put and everything before it is untouched. */
export function shuffleUpcoming(queue: Queue, random: () => number): Queue {
  if (queue.items.length - queue.index - 1 < 2) return { ...queue, original: queue.items.map((item) => item.uid) }
  const head = queue.items.slice(0, queue.index + 1)
  const tail = queue.items.slice(queue.index + 1)
  for (let position = tail.length - 1; position > 0; position -= 1) {
    const other = Math.floor(random() * (position + 1))
    ;[tail[position], tail[other]] = [tail[other], tail[position]]
  }
  return { ...queue, items: [...head, ...tail], original: queue.items.map((item) => item.uid) }
}

/** Puts the upcoming songs back in the order they had before shuffling; songs added since stay at the end. */
export function restoreOrder(queue: Queue): Queue {
  const original = queue.original
  if (!original) return queue
  const head = queue.items.slice(0, queue.index + 1)
  const tail = queue.items.slice(queue.index + 1)
  const rank = new Map(original.map((uid, position) => [uid, position]))
  const ordered = [...tail].sort((left, right) => (rank.get(left.uid) ?? Infinity) - (rank.get(right.uid) ?? Infinity))
  return { ...queue, items: [...head, ...ordered], original: null }
}
