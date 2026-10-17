export const SESSION_ENDED = 'suva:admin-session-ended';

export function expireAdminSession(rejectedToken, storage = localStorage) {
  // An older in-flight request must not invalidate a newer sign-in.
  if (!rejectedToken || storage.getItem('sv_admin_token') !== rejectedToken) return false;
  storage.removeItem('sv_admin_token');
  storage.removeItem('sv_admin_user');
  return true;
}
