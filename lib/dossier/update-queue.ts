/** Sérialise les mutations ; la fonction lit l'état courant au moment de son tour. */
export class DossierUpdateQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
