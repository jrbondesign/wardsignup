/** True the first time. Further submits are ignored until `finish` runs. */
export function beginSubmit(lock: { current: boolean }, event: { preventDefault(): void }): boolean {
  event.preventDefault();
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function finishSubmit(lock: { current: boolean }) {
  lock.current = false;
}
