import app from '../hono/hono';
import result from '../model/result';
import externalService from '../service/external-service';

app.post('/external/send-email', async c => {
	return c.json(result.ok(await externalService.sendEmail(c, await c.req.json())));
});

app.post('/external/query-email', async c => {
	return c.json(result.ok(await externalService.queryEmail(c, await c.req.json())));
});
