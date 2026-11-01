import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appPath } from '../public/runtime.js';

test('real URLs stay real and demo API requests remain scoped across pages', () => {
 assert.equal(appPath('/api/state','/'),'/api/state');
 assert.equal(appPath('/api/state','/demo/'),'/demo/api/state');
 assert.equal(appPath('/api/state','/demo/settings.html'),'/demo/api/state');
 assert.equal(appPath('/api/state','/demography'),'/api/state');
 assert.equal(appPath('/demo/api/state','/demo/'),'/demo/api/state');
 assert.equal(appPath('https://example.com','/demo/'),'https://example.com');
 assert.equal(appPath('//example.com','/demo/'),'//example.com');
});
