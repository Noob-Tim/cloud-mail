import http from '@/axios/index.js';

export function apiKeyList() {
	return http.get('/apiKey/list');
}

export function apiKeyCreate(form) {
	return http.post('/apiKey/create', form);
}

export function apiKeyUpdate(apiKeyId, form) {
	return http.put(`/apiKey/${apiKeyId}`, form);
}

export function apiKeyDelete(apiKeyId) {
	return http.delete(`/apiKey/${apiKeyId}`);
}

export function openApiSpec() {
	return http.get('/apiKey/docs');
}
