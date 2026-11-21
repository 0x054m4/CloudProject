import { randomUUID } from 'node:crypto';
import { entrySchema } from '../domain.js';
import { fail, publicItem } from './library.js';

export function createJournalService(store, library) {
  return {
    async list(owner, bookId) {
      await library.requireBook(owner, bookId);
      return (await store.list(`${owner}#BOOK#${bookId}`)).map(publicItem);
    },
    async add(owner, bookId, input) {
      const book = await library.requireBook(owner, bookId);
      const entry = entrySchema.parse(input);
      // Planning notes are useful before reading; captured passages require a started book.
      if (entry.kind === 'highlight' && book.status === 'to-read') {
        throw fail(409, 'Start reading this book before saving highlights. Planning notes are available now.');
      }
      const id = randomUUID();
      return publicItem(await store.put({ ...entry, id, pk: `${owner}#BOOK#${bookId}`, sk: id,
        createdAt: new Date().toISOString() }));
    },
    async remove(owner, bookId, entryId) {
      await library.requireBook(owner, bookId);
      const pk = `${owner}#BOOK#${bookId}`;
      if (!await store.get(pk, entryId)) throw fail(404, 'Entry not found');
      await store.remove(pk, entryId);
    }
  };
}
