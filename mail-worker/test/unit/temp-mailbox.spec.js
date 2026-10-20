import { describe, expect, it } from 'vitest';
import accountService from '../../src/service/account-service';

describe('temporary mailbox expiry', () => {
	const now = Date.UTC(2026, 9, 20, 4, 0, 0);

	it('expires temporary mailboxes at the stored UTC time', () => {
		expect(accountService.isExpiredTempMailbox({
			isTemp: 1,
			expiresAt: '2026-10-20 03:59:59'
		}, now)).toBe(true);
		expect(accountService.isExpiredTempMailbox({
			isTemp: 1,
			expiresAt: '2026-10-20 04:00:01'
		}, now)).toBe(false);
	});

	it('never expires regular mailboxes', () => {
		expect(accountService.isExpiredTempMailbox({
			isTemp: 0,
			expiresAt: '2026-10-20 03:00:00'
		}, now)).toBe(false);
	});
});
