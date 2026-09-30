const pending = new Map();

export function scheduleSessionSave(req, delayMs = 400) {
  if (!req.session) return;
  req.session.touch?.();
  const id = req.sessionID;
  if (!id) {
    req.session.save(() => {});
    return;
  }
  const existing = pending.get(id);
  if (existing) clearTimeout(existing);
  pending.set(
    id,
    setTimeout(() => {
      pending.delete(id);
      req.session.save(() => {});
    }, delayMs),
  );
}
