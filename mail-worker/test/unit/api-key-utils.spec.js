import { describe, expect, it } from 'vitest';
import { apiScopes } from '../../src/const/api-key-const';
import {
	generateApiKey,
	hashApiKey,
	parseApiScopes,
	validateApiScopes
} from '../../src/utils/api-key-utils';

describe('api key utilities', () => {
	it('generates unique prefixed keys', () => {
		const first = generateApiKey();
		const second = generateApiKey();

		expect(first).toMatch(/^cm_[0-9a-f]{64}$/);
		expect(second).not.toBe(first);
	});

	it('hashes keys deterministically without returning the key', async () => {
		const key = 'cm_test-key';
		const first = await hashApiKey(key);
		const second = await hashApiKey(key);

		expect(first).toBe(second);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(first).not.toContain(key);
	});

	it('accepts only known non-empty scopes', () => {
		expect(validateApiScopes(apiScopes)).toBe(true);
		expect(validateApiScopes([])).toBe(false);
		expect(validateApiScopes(['root'])).toBe(false);
	});

	it('parses stored scope JSON safely', () => {
		expect(parseApiScopes('["users:read"]')).toEqual(['users:read']);
		expect(parseApiScopes('invalid')).toEqual([]);
	});
});
