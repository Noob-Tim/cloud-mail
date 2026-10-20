import { apiScopes } from '../const/api-key-const';

const encoder = new TextEncoder();

export function generateApiKey() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return `cm_${toHex(bytes)}`;
}

export async function hashApiKey(value) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return toHex(new Uint8Array(digest));
}

export function parseApiScopes(value) {
	if (Array.isArray(value)) {
		return value;
	}

	try {
		const parsed = JSON.parse(value || '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function validateApiScopes(scopes) {
	if (!Array.isArray(scopes) || scopes.length === 0) {
		return false;
	}

	return scopes.every(scope => apiScopes.includes(scope));
}

function toHex(bytes) {
	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
