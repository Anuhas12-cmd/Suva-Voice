import test from 'node:test';
import assert from 'node:assert/strict';
import { expireAdminSession } from '../src/session.js';

function storage(token) {
  const items = new Map([['sv_admin_token', token], ['sv_admin_user', '{"role":"admin"}'], ['other-setting', 'keep']]);
  return { getItem: key => items.get(key) ?? null, removeItem: key => items.delete(key) };
}

test('a rejected current session clears both credentials without clearing unrelated settings', () => {
  const saved = storage('expired');
  assert.equal(expireAdminSession('expired', saved), true);
  assert.equal(saved.getItem('sv_admin_token'), null);
  assert.equal(saved.getItem('sv_admin_user'), null);
  assert.equal(saved.getItem('other-setting'), 'keep');
});
test('a late rejected request from the old session cannot sign out a newer login', () => {
  const saved = storage('new-session');
  assert.equal(expireAdminSession('old-session', saved), false);
  assert.equal(saved.getItem('sv_admin_token'), 'new-session');
  assert.ok(saved.getItem('sv_admin_user'));
});
test('an unauthenticated rejection and repeated invalidation do not end another session', () => {
  const saved = storage('current');
  assert.equal(expireAdminSession(null, saved), false);
  assert.equal(expireAdminSession('current', saved), true);
  assert.equal(expireAdminSession('current', saved), false);
});
