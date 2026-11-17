import type { Document } from "~/core/models";

import type { DocumentChanges } from "./context";

/**
 * The fields of an open document that the options change, and their saving. `POST /document`
 * overwrites every field of the row (published, folder, deleted...), so each request is built
 * from what the server holds, changed by the endpoints that changed it (publish, move), plus
 * the changes made here. Requests go one at a time; the changes made meanwhile wait and leave
 * together. A refused request drops only its own changes: a later one never goes back.
 */
export class DocumentMetadata {
  private confirmed: Document;
  private inFlight: DocumentChanges[] = [];
  private waiting: DocumentChanges[] = [];
  private view: Document | null = null;

  constructor(
    document: Document,
    private readonly options: {
      /** Sends the document's own fields; the caller adds the title and leaves the steps out. */
      send: (document: Document) => Promise<void>;
      /** What the document looks like changed. */
      onChange: () => void;
      onError: (error: unknown) => void;
      onSaved?: () => void;
    },
  ) {
    this.confirmed = document;
  }

  /** The document as the user sees it: what the server holds and the changes on their way. */
  get current(): Document {
    this.view ??= Object.assign({}, this.confirmed, ...this.inFlight, ...this.waiting) as Document;
    return this.view;
  }

  change(changes: DocumentChanges): void {
    this.waiting.push(changes);
    this.changed();
    this.pump();
  }

  /** Fields another endpoint changed on the server: the publish state, the folder. */
  serverChanged(fields: Partial<Document>): void {
    const keys = Object.keys(fields) as (keyof Document)[];
    if (keys.every((key) => this.confirmed[key] === fields[key])) return;
    this.confirmed = { ...this.confirmed, ...fields };
    this.changed();
  }

  private changed(): void {
    this.view = null;
    this.options.onChange();
  }

  private pump(): void {
    if (this.inFlight.length > 0 || this.waiting.length === 0) return;
    this.inFlight = this.waiting;
    this.waiting = [];
    const changes = Object.assign({}, ...this.inFlight) as DocumentChanges;

    this.options
      .send({ ...this.confirmed, ...changes })
      .then(
        () => {
          this.confirmed = { ...this.confirmed, ...changes };
          this.options.onSaved?.();
        },
        (error: unknown) => this.options.onError(error),
      )
      .finally(() => {
        this.inFlight = [];
        this.changed();
        this.pump();
      });
  }
}

/**
 * The favorite of the user, sent one request at a time: a quick second toggle is sent after
 * the first one is answered, so the last one the user made is the one the server keeps.
 */
export class FavoriteState {
  private confirmed: boolean | null = null;
  private wanted: boolean | null = null;
  private sending = false;

  constructor(
    private readonly options: {
      send: (favorite: boolean) => Promise<void>;
      onChange: () => void;
      onError: (error: unknown) => void;
      onSaved?: () => void;
    },
  ) {}

  /** The favorite as the user sees it; [known] is what the server answered when asked. */
  current(known: boolean): boolean {
    return this.wanted ?? this.confirmed ?? known;
  }

  toggle(known: boolean): void {
    this.confirmed ??= known;
    this.wanted = !this.current(known);
    this.options.onChange();
    this.pump();
  }

  private pump(): void {
    if (this.sending || this.wanted === null || this.wanted === this.confirmed) return;
    const favorite = this.wanted;
    this.sending = true;
    this.options
      .send(favorite)
      .then(
        () => {
          this.confirmed = favorite;
          this.options.onSaved?.();
        },
        (error: unknown) => {
          // The server keeps what it had; a toggle made meanwhile still goes.
          if (this.wanted === favorite) this.wanted = this.confirmed;
          this.options.onError(error);
        },
      )
      .finally(() => {
        this.sending = false;
        this.options.onChange();
        this.pump();
      });
  }
}
