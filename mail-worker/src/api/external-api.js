import app from '../hono/hono';
import result from '../model/result';
import externalService from '../service/external-service';

// 外部发邮件API接口
app.post('/external/send-email', async (c) => {
	const emailResult = await externalService.sendEmail(c, await c.req.json());
	return c.json(result.ok(emailResult));
});