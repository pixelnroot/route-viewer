export function canRead(req: Request): boolean {
  const auth = req.headers.get('Authorization');
  const vk = process.env.VIEW_ADMIN_KEY;
  const ek = process.env.EDIT_ADMIN_KEY;
  return Boolean((vk && auth === `Bearer ${vk}`) || (ek && auth === `Bearer ${ek}`));
}

export function canEdit(req: Request): boolean {
  const auth = req.headers.get('Authorization');
  const ek = process.env.EDIT_ADMIN_KEY;
  return Boolean(ek && auth === `Bearer ${ek}`);
}
