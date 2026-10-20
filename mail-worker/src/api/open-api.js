import app from '../hono/hono';
import result from '../model/result';
import BizError from '../error/biz-error';
import apiKeyService from '../service/api-key-service';
import openApiService from '../service/open-api-service';
import { createOpenApiSpec } from '../openapi/openapi-spec';

app.get('/open/v1/health', c => c.json(result.ok({ status: 'ok', time: new Date().toISOString() })));

app.get('/open/v1/openapi.json', c => {
	return c.json(createOpenApiSpec(new URL(c.req.url).origin));
});

app.get('/open/v1/users', async c => {
	await apiKeyService.authenticate(c, 'users:read');
	return c.json(result.ok(await openApiService.listUsers(c, c.req.query())));
});

app.post('/open/v1/users', async c => {
	await apiKeyService.authenticate(c, 'users:write');
	return c.json(result.ok(await openApiService.createUser(c, await readJson(c))));
});

app.get('/open/v1/users/:userId', async c => {
	await apiKeyService.authenticate(c, 'users:read');
	return c.json(result.ok(await openApiService.getUser(c, c.req.param('userId'))));
});

app.patch('/open/v1/users/:userId', async c => {
	await apiKeyService.authenticate(c, 'users:write');
	return c.json(result.ok(await openApiService.updateUser(c, c.req.param('userId'), await readJson(c))));
});

app.delete('/open/v1/users/:userId', async c => {
	await apiKeyService.authenticate(c, 'users:write');
	await openApiService.deleteUser(c, c.req.param('userId'));
	return c.json(result.ok());
});

app.get('/open/v1/users/:userId/mailboxes', async c => {
	await apiKeyService.authenticate(c, 'mailboxes:read');
	return c.json(result.ok(await openApiService.listUserMailboxes(c, c.req.param('userId'), c.req.query())));
});

app.post('/open/v1/users/:userId/mailboxes', async c => {
	await apiKeyService.authenticate(c, 'mailboxes:write');
	return c.json(result.ok(await openApiService.createMailbox(c, c.req.param('userId'), await readJson(c))));
});

app.patch('/open/v1/mailboxes/:accountId', async c => {
	await apiKeyService.authenticate(c, 'mailboxes:write');
	return c.json(result.ok(await openApiService.updateMailbox(c, c.req.param('accountId'), await readJson(c))));
});

app.delete('/open/v1/mailboxes/:accountId', async c => {
	await apiKeyService.authenticate(c, 'mailboxes:write');
	return c.json(result.ok(await openApiService.deleteMailbox(c, c.req.param('accountId'))));
});

app.get('/open/v1/emails', async c => {
	await apiKeyService.authenticate(c, 'emails:read');
	return c.json(result.ok(await openApiService.listEmails(c, c.req.query())));
});

app.post('/open/v1/emails/send', async c => {
	await apiKeyService.authenticate(c, 'emails:send');
	return c.json(result.ok(await openApiService.sendEmail(c, await readJson(c))));
});

app.get('/open/v1/emails/:emailId', async c => {
	await apiKeyService.authenticate(c, 'emails:read');
	return c.json(result.ok(await openApiService.getEmail(c, c.req.param('emailId'))));
});

app.patch('/open/v1/emails/:emailId', async c => {
	await apiKeyService.authenticate(c, 'emails:write');
	return c.json(result.ok(await openApiService.updateEmail(c, c.req.param('emailId'), await readJson(c))));
});

app.delete('/open/v1/emails/:emailId', async c => {
	await apiKeyService.authenticate(c, 'emails:write');
	return c.json(result.ok(await openApiService.deleteEmail(c, c.req.param('emailId'))));
});

async function readJson(c) {
	try {
		const value = await c.req.json();
		if (!value || Array.isArray(value) || typeof value !== 'object') {
			throw new Error('invalid JSON object');
		}
		return value;
	} catch {
		throw new BizError('请求体必须是有效的 JSON 对象', 400);
	}
}
