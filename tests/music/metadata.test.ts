import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanAlbum,
  cleanGenre,
  cleanTags,
  cleanTitle,
  detectLanguage,
  looksLikeSite,
  nameKey,
  splitNames,
} from '../../server/music/metadata.js'
import type { ProbedTags } from '../../server/watch/types.js'

// Real tags from the songs on this library's G: drive.
const tags = (overrides: Partial<ProbedTags>): ProbedTags => ({
  title: null,
  artist: null,
  albumArtist: null,
  album: null,
  genre: null,
  date: null,
  track: null,
  disc: null,
  composer: null,
  language: null,
  bpm: null,
  hasLyrics: false,
  ...overrides,
})

test('site names, track numbers and underscores are removed from titles', () => {
  assert.equal(cleanTitle('[iSongs.info] 01 - Aakupachhani Chandamaamalaa', 'x.mp3'), 'Aakupachhani Chandamaamalaa')
  assert.equal(cleanTitle('Prema Ane - TeluguWap.Net', 'x.mp3'), 'Prema Ane')
  assert.equal(cleanTitle('Chilaka O Chilaka-SenSongsMp3.Co', 'x.mp3'), 'Chilaka O Chilaka')
  assert.equal(cleanTitle('Pilli Kalla Pilla [www.AtoZmp3.in]', 'x.mp3'), 'Pilli Kalla Pilla')
  assert.equal(cleanTitle('Padahaarellainaa_-_[TeluguMp3.Asia].mp3', 'x.mp3'), 'Padahaarellainaa')
  assert.equal(cleanTitle('Le Le Le Le', '01_-_Le_Le_Le_Le.mp3'), 'Le Le Le Le')
})

test('titles that are really file names keep only the song', () => {
  assert.equal(cleanTitle('02_-_Emjarugutondi_-_Mahatma_(2009)_128Kbps.mp3-(TeluguWap.Net)', 'x.mp3'), 'Emjarugutondi')
  assert.equal(cleanTitle('05_-_Muddulaata_-_Aata_(2007)_128Kbps.mp3-(TeluguWap.Net)', 'x.mp3'), 'Muddulaata')
  assert.equal(cleanTitle('04  Nee Paata Madhuram  - DownloadSouthMP3.Com', 'x.mp3'), 'Nee Paata Madhuram')
  assert.equal(
    cleanTitle('3(Moonu) Movie Climax Nice BGM Tones - Mobitones.Net', 'x.mp3'),
    '3(Moonu) Movie Climax Nice BGM Tones',
  )
  assert.equal(cleanTitle('Hero - Reprise', 'x.mp3'), 'Hero - Reprise', 'a real subtitle is not cut')
})

test('a title that is only a website falls back to the file name', () => {
  assert.equal(
    cleanTitle('www.fdmr.in', 'sun-raha-hai-na-tu-santur-aashiqui2-instrumental.mp3'),
    'Sun Raha Hai Na Tu Santur Aashiqui2 Instrumental',
  )
  assert.equal(cleanTitle(null, '02 - Aasa Aasa  www.AtoZmp3.in .mp3'), 'Aasa Aasa')
  assert.equal(cleanTitle(null, '.mp3'), 'Untitled')
})

test('the film name and year are separated, whatever the spelling', () => {
  assert.deepEqual(cleanAlbum('Jyo Achyutananda - (2016)', null), { name: 'Jyo Achyutananda', year: 2016 })
  assert.deepEqual(cleanAlbum('Inkokadu(2016)', null), { name: 'Inkokadu', year: 2016 })
  assert.deepEqual(cleanAlbum('Current Teega (2014) - TeluguMp3.Asia', null), { name: 'Current Teega', year: 2014 })
  assert.deepEqual(cleanAlbum('Mr.Spicy [UrsTelugu.Net]', null), { name: 'Mr.Spicy', year: null })
  assert.deepEqual(cleanAlbum('3 (2012)', null), { name: '3', year: 2012 })
})

test('albums that are file names lose the bitrate and underscores', () => {
  assert.deepEqual(cleanAlbum('Mahatma_(2009)_128Kbps', null), { name: 'Mahatma', year: 2009 })
  assert.deepEqual(cleanAlbum('3 Bgm Tones - Mobitones.Net', null), { name: '3 Bgm Tones', year: null })
})

test('an album that is only a website uses its folder, and the shared audios folder becomes Singles', () => {
  assert.deepEqual(cleanAlbum('freedownloadmobileringtones.com', 'Padesave (2016)'), { name: 'Padesave', year: 2016 })
  assert.deepEqual(cleanAlbum('freedownloadmobileringtones.com', 'audios'), { name: 'Singles', year: null })
  assert.deepEqual(cleanAlbum(null, null), { name: 'Singles', year: null })
})

test('singers are split into individual names and uploader tags are dropped', () => {
  assert.deepEqual(splitNames('Karthik, Ramya Behara'), ['Karthik', 'Ramya Behara'])
  assert.deepEqual(splitNames('S.P.Balasubrahmanyam & Swarnalatha'), ['S.P.Balasubrahmanyam', 'Swarnalatha'])
  assert.deepEqual(splitNames('Christopher Stanley,Abhay Jodhpurkar,Sunitha Sarathy'), [
    'Christopher Stanley',
    'Abhay Jodhpurkar',
    'Sunitha Sarathy',
  ])
  assert.deepEqual(splitNames('Sagar, Sumangali (Humming)'), ['Sagar', 'Sumangali'])
  assert.deepEqual(splitNames('K.K'), ['K.K'])
  assert.deepEqual(splitNames('[UrsTelugu.Net]'), [])
  assert.deepEqual(splitNames('TeluguWap.Net'), [])
  assert.deepEqual(splitNames('Mobitones.Net'), [])
  assert.deepEqual(splitNames('TeluguMp3.Asia'), [])
  assert.deepEqual(splitNames('www.freedownloadmobileringtones.com'), [])
  assert.deepEqual(splitNames('Anirudh, anirudh'), ['Anirudh'])
})

test('two spellings of one person share a key', () => {
  assert.equal(nameKey('S.P.Balasubrahmanyam'), nameKey('S. P. Balasubrahmanyam'))
  assert.notEqual(nameKey('Karthik'), nameKey('Karthik Raju'))
})

test('sites are recognised, names are not', () => {
  for (const site of ['[UrsTelugu.Net]', 'TeluguMp3.Asia', 'SenSongsMp3.Co', 'www.AtoZmp3.in', 'iSongs.info'])
    assert.ok(looksLikeSite(site), site)
  for (const name of ['K.K', 'S.P.Balasubrahmanyam', 'Ramya Behara', 'A.R.Rahman', 'Devi Sri Prasad'])
    assert.ok(!looksLikeSite(name), name)
})

test('genres that are site names or filler are dropped, and a bare language is not a genre', () => {
  for (const junk of ['www.AtoZmp3.in', 'TeluguMp3', '(SenSongsMp3.Com)', '[UrsTelugu.Net]', 'Other', 'Indian', 'Telugu'])
    assert.equal(cleanGenre(junk), null, junk)
  assert.equal(cleanGenre('Soundtrack'), 'Soundtrack')
  assert.equal(cleanGenre('Melody'), 'Melody')
})

test('language comes from the tags or the path, including names run into a site name', () => {
  assert.equal(detectLanguage('TeluguMp3'), 'Telugu')
  assert.equal(detectLanguage(null, null, 'Padesave', 'Tamil Songs'), 'Tamil')
  assert.equal(detectLanguage('hin'), 'Hindi')
  assert.equal(detectLanguage('Soundtrack', 'Other'), null)
})

test('a whole file is cleaned at once: a typical song from this library', () => {
  const song = cleanTags(
    tags({
      title: '[iSongs.info] 01 - Aakupachhani Chandamaamalaa',
      artist: 'Karthik, Ramya Behara',
      album: 'Jyo Achyutananda - (2016)',
      albumArtist: 'Nara Rohith, Naga Shourya, Regina Cassandra',
      genre: 'Telugu',
      date: '2016',
      track: '01',
      hasLyrics: true,
    }),
    'Telegram movies/audios/[iSongs.info] 01 - Aakupachhani Chandamaamalaa.mp3',
  )
  assert.deepEqual(
    [song.title, song.artists, song.album, song.year, song.track, song.genre, song.language, song.cast, song.hasLyrics],
    [
      'Aakupachhani Chandamaamalaa',
      ['Karthik', 'Ramya Behara'],
      'Jyo Achyutananda',
      2016,
      1,
      null,
      'Telugu',
      ['Nara Rohith', 'Naga Shourya', 'Regina Cassandra'],
      true,
    ],
  )
})

test('a file with no tags at all still gets a title, an album and a track number from its name and folder', () => {
  const song = cleanTags(null, 'Telegram movies/audios/Padesave (2016)/03 - Padesave Title Song.mp3')
  assert.deepEqual(
    [song.title, song.album, song.year, song.track, song.artists],
    ['Padesave Title Song', 'Padesave', 2016, 3, []],
  )
})

test('songs of one film share an album key even when the tags are spelled differently', () => {
  const a = cleanTags(tags({ album: 'Padesave (2016)' }), 'a/1.mp3')
  const b = cleanTags(tags({ album: 'Padesave - (2016) [TeluguMp3.Asia]' }), 'b/2.mp3')
  assert.equal(a.albumKey, b.albumKey)
})

test('a leftover "Mp3" word is dropped from a title', () => {
  assert.equal(cleanTitle('Kabira Mp3', 'x.mp3'), 'Kabira')
})
