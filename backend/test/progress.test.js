import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

const book = { title: 'Dune', author: 'Frank Herbert', genre: 'Science fiction', status: 'to-read',
  rating: null, finishedAt: null, nextUp: false, coverKey: null };

test('reading progress rules, percentage, auto-finish and page-checked highlights', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'margin-progress-'));
  const store = createStore({ file: join(dir, 'db.json') });
  const server = createApp({ store, local: true }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, method = 'GET', data) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }
  try {
    const id = (await request('/books', 'POST', book)).body.id;

    // New book: no progress yet
    assert.deepEqual((await request(`/books/${id}/progress`)).body.percentage, 0);

    // Rule 1: a To Read book cannot record progress (409)
    assert.equal((await request(`/books/${id}/progress`, 'PUT', { pageCount: 400, currentPage: 10 })).status, 409);

    await request(`/books/${id}`, 'PUT', { ...book, status: 'reading' });

    // Invalid input (400): page after the end, zero pages, text instead of a number, extra field
    assert.equal((await request(`/books/${id}/progress`, 'PUT', { pageCount: 400, currentPage: 401 })).status, 400);
    assert.equal((await request(`/books/${id}/progress`, 'PUT', { pageCount: 0, currentPage: 0 })).status, 400);
    assert.equal((await request(`/books/${id}/progress`, 'PUT', { pageCount: '400', currentPage: 10 })).status, 400);
    assert.equal((await request(`/books/${id}/progress`, 'PUT', { pageCount: 400, currentPage: 10, percentage: 99 })).status, 400);

    // Rule 2: the server calculates the percentage
    const saved = await request(`/books/${id}/progress`, 'PUT', { pageCount: 400, currentPage: 100 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.percentage, 25);
    assert.equal(saved.body.bookStatus, 'reading');

    // Highlights cannot point past the last page; progress is not listed as a journal entry
    assert.equal((await request(`/books/${id}/entries`, 'POST', { kind: 'highlight', text: 'Fear is the mind-killer', page: 401 })).status, 400);
    assert.equal((await request(`/books/${id}/entries`, 'POST', { kind: 'highlight', text: 'Fear is the mind-killer', page: 8 })).status, 201);
    assert.equal((await request(`/books/${id}/entries`)).body.length, 1);
    assert.equal((await request(`/books/${id}/entries/PROGRESS`, 'DELETE')).status, 404);

    // Rule 3: reaching the last page finishes the book and sets the completion date
    const done = await request(`/books/${id}/progress`, 'PUT', { pageCount: 400, currentPage: 400 });
    assert.equal(done.body.percentage, 100);
    assert.equal(done.body.bookStatus, 'finished');
    const finishedBook = (await request('/books')).body.find(b => b.id === id);
    assert.equal(finishedBook.status, 'finished');
    assert.match(finishedBook.finishedAt, /^\d{4}-\d{2}-\d{2}$/);

    // Rule 1b: a finished book cannot move its progress back (409)
    assert.equal((await request(`/books/${id}/progress`, 'PUT', { pageCount: 400, currentPage: 5 })).status, 409);

    // A book marked finished by editing (not by progress) still shows 100%
    const edited = (await request('/books', 'POST', { ...book, status: 'reading' })).body.id;
    await request(`/books/${edited}/progress`, 'PUT', { pageCount: 100, currentPage: 5 });
    await request(`/books/${edited}`, 'PUT', { ...book, status: 'finished', finishedAt: '2026-11-23' });
    const shown = (await request(`/books/${edited}/progress`)).body;
    assert.equal(shown.percentage, 100);
    assert.equal(shown.currentPage, 100);

    // Ownership: another user's book is not found (404)
    await store.put({ ...book, id: 'other', pk: 'USER#someone-else', sk: 'BOOK#other' });
    assert.equal((await request('/books/other/progress')).status, 404);
    assert.equal((await request('/books/other/progress', 'PUT', { pageCount: 10, currentPage: 1 })).status, 404);

    // Deleting the book also deletes its progress
    await request(`/books/${id}`, 'DELETE');
    assert.equal((await store.list(`USER#local-reader#BOOK#${id}`)).length, 0);
  } finally {
    await new Promise(r => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
