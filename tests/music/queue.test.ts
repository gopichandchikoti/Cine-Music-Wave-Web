import test from 'node:test'
import assert from 'node:assert/strict'
import {
  append,
  clearUpcoming,
  currentItem,
  insertNext,
  jump,
  makeQueue,
  move,
  nextIndex,
  previousIndex,
  removeAt,
  restoreOrder,
  shuffleUpcoming,
  upcoming,
} from '../../src/features/music/queue.js'
import { seededRandom } from '../../src/features/music/musicModel.js'

const ids = (queue: ReturnType<typeof makeQueue>): string[] => queue.items.map((item) => item.trackId)
const five = (): ReturnType<typeof makeQueue> => makeQueue(['a', 'b', 'c', 'd', 'e'], 1)

test('a new queue starts at the chosen song and an empty one has no current song', () => {
  assert.equal(currentItem(five())?.trackId, 'b')
  assert.deepEqual(
    upcoming(five()).map((item) => item.trackId),
    ['c', 'd', 'e'],
  )
  assert.equal(currentItem(makeQueue([])), null)
  assert.equal(makeQueue(['a'], 9).index, 0)
})

test('next and previous follow the repeat mode', () => {
  const queue = makeQueue(['a', 'b', 'c'], 2)
  assert.equal(nextIndex(queue, 'off', false), null, 'the end of the queue stops')
  assert.equal(nextIndex(queue, 'all', false), 0, 'repeat all wraps')
  assert.equal(nextIndex(queue, 'one', false), 2, 'repeat one replays the song when it ends')
  assert.equal(nextIndex(queue, 'one', true), 0, 'pressing Next still moves on')
  assert.equal(previousIndex(makeQueue(['a', 'b'], 0), 'off'), null)
  assert.equal(previousIndex(makeQueue(['a', 'b'], 0), 'all'), 1)
  assert.equal(nextIndex(makeQueue([]), 'all', true), null)
})

test('Play next goes right after the current song, Add to queue goes last', () => {
  assert.deepEqual(ids(insertNext(five(), ['x', 'y'])), ['a', 'b', 'x', 'y', 'c', 'd', 'e'])
  assert.deepEqual(ids(append(five(), ['x'])), ['a', 'b', 'c', 'd', 'e', 'x'])
  const started = append(makeQueue([]), ['x'])
  assert.equal(started.index, 0, 'adding to an empty queue makes the first song current')
})

test('removing a song keeps the same song playing', () => {
  assert.equal(currentItem(removeAt(five(), 0))?.trackId, 'b', 'removing an earlier song')
  assert.equal(currentItem(removeAt(five(), 3))?.trackId, 'b', 'removing a later song')
  assert.equal(currentItem(removeAt(five(), 1))?.trackId, 'c', 'removing the current song moves on to the next')
  assert.equal(removeAt(makeQueue(['a']), 0).index, -1)
  assert.equal(removeAt(five(), 99).items.length, 5)
})

test('dragging a song never changes which song is playing', () => {
  assert.equal(currentItem(move(five(), 3, 0))?.trackId, 'b')
  assert.deepEqual(ids(move(five(), 3, 0)), ['d', 'a', 'b', 'c', 'e'])
  assert.equal(currentItem(move(five(), 1, 4))?.trackId, 'b', 'moving the current song itself')
  assert.equal(move(five(), 1, 4).index, 4)
  const untouched = five()
  assert.equal(move(untouched, 2, 2), untouched, 'dropping a song where it was changes nothing')
  assert.deepEqual(ids(move(five(), 0, 9)), ids(five()), 'a drop outside the list changes nothing')
})

test('shuffle reorders only what is still to come, and un-shuffling restores it', () => {
  const queue = makeQueue(
    Array.from({ length: 12 }, (_, i) => `t${i}`),
    3,
  )
  const shuffled = shuffleUpcoming(queue, seededRandom('x'))
  assert.deepEqual(ids(shuffled).slice(0, 4), ids(queue).slice(0, 4), 'played songs and the current one stay')
  assert.deepEqual([...ids(shuffled)].sort(), [...ids(queue)].sort(), 'no song is lost or duplicated')
  assert.notDeepEqual(ids(shuffled), ids(queue))
  assert.deepEqual(ids(restoreOrder(shuffled)), ids(queue))
  assert.equal(restoreOrder(shuffled).original, null)
})

test('songs added while shuffled keep their place when shuffle is turned off', () => {
  const queue = makeQueue(
    Array.from({ length: 8 }, (_, i) => `t${i}`),
    0,
  )
  let shuffled = shuffleUpcoming(queue, seededRandom('y'))
  shuffled = insertNext(shuffled, ['next-up'])
  shuffled = append(shuffled, ['last-in'])
  const restored = ids(restoreOrder(shuffled))
  assert.equal(restored[1], 'next-up')
  assert.equal(restored[restored.length - 1], 'last-in')
})

test('clearing the queue removes only what is still to come', () => {
  assert.deepEqual(ids(clearUpcoming(five())), ['a', 'b'])
  assert.equal(jump(five(), 3).index, 3)
  assert.equal(jump(five(), 9).index, 1)
})
