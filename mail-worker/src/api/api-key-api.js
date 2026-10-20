import app from '../hono/hono';
import result from '../model/result';
import apiKeyService from '../service/api-key-service';
import userContext from '../security/user-context';
import { createOpenApiSpec } from '../openapi/openapi-spec';

app.get('/apiKey/docs', c => {
	return c.json(result.ok(createOpenApiSpec(new URL(c.req.url).origin)));
});

app.get('/apiKey/list', async c => {
	return c.json(result.ok(await apiKeyService.list(c)));
});

app.post('/apiKey/create', async c => {
	const data = await apiKeyService.create(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.put('/apiKey/:apiKeyId', async c => {
	const data = await apiKeyService.update(c, c.req.param('apiKeyId'), await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/apiKey/:apiKeyId', async c => {
	await apiKeyService.delete(c, c.req.param('apiKeyId'));
	return c.json(result.ok());
});
