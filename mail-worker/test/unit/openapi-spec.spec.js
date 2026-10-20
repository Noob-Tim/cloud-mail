import { describe, expect, it } from 'vitest';
import { createOpenApiSpec } from '../../src/openapi/openapi-spec';

describe('open api specification', () => {
	const spec = createOpenApiSpec('https://mail.example.com');

	it('uses the deployed origin and exposes the required resources', () => {
		expect(spec.servers[0].url).toBe('https://mail.example.com/api/open/v1');
		expect(spec.paths).toHaveProperty('/users');
		expect(spec.paths).toHaveProperty('/users/{userId}/mailboxes');
		expect(spec.paths).toHaveProperty('/emails/{emailId}');
		expect(spec.paths).toHaveProperty('/emails/send');
	});

	it('declares a scope for every protected operation', () => {
		for (const pathItem of Object.values(spec.paths)) {
			for (const operation of Object.values(pathItem)) {
				if (operation.security?.length === 0) continue;
				expect(operation['x-scope']).toMatch(/^[a-z]+:(read|write|send)$/);
			}
		}
	});
});
