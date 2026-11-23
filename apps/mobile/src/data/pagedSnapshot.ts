export type PageSnapshot<T>={key:string;cursor?:string;page:{items:T[];nextCursor:string|null;isDone:boolean}};
/** Paused views retain their page; other queries, cursors and sessions never see it. */
export function visiblePage<T>(snapshot:PageSnapshot<T>,key:string,cursor?:string) {
  return snapshot.key===key&&snapshot.cursor===cursor?snapshot.page:{items:[] as T[],nextCursor:null,isDone:true};
}
