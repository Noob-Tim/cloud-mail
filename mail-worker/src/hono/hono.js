import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

app.use('*', cors());

app.onError((err, c) => {
	const isOpenApi = c.req.path.startsWith('/open/v1');
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return errorResponse(c, 'KV数据库未绑定<br/>KV database not bound', 502, isOpenApi);
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return errorResponse(c, 'KV数据库未绑定<br/>KV database not bound', 502, isOpenApi);
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return errorResponse(c, 'D1数据库未绑定<br/>D1 database not bound', 502, isOpenApi);
	}

	if (err.message?.includes('D1_ERROR: no such column')) {
		return errorResponse(c, '请按照文档更新数据库<br/>Please update the database as documented', 502, isOpenApi);
	}

	if (isOpenApi && err.name !== 'BizError') {
		return errorResponse(c, '服务器内部错误', 500, true);
	}
	return errorResponse(c, err.message, err.code, isOpenApi);
});

function errorResponse(c, message, code = 500, useHttpStatus = false) {
	const status = code >= 400 && code <= 599 ? code : 500;
	const payload = result.fail(message, status);
	return useHttpStatus ? c.json(payload, status) : c.json(payload);
}

export default app;


