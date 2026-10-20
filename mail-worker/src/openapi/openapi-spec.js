export function createOpenApiSpec(origin) {
	const response = description => ({
		description,
		content: {
			'application/json': {
				schema: { $ref: '#/components/schemas/Envelope' }
			}
		}
	});
	const idParameter = name => ({
		name,
		in: 'path',
		required: true,
		schema: { type: 'integer', minimum: 1 }
	});
	const jsonBody = (description, schemaName, example) => ({
		required: true,
		description,
		content: {
			'application/json': {
				schema: { $ref: `#/components/schemas/${schemaName}` },
				example
			}
		}
	});

	return {
		openapi: '3.1.0',
		info: {
			title: 'Cloud Mail API',
			version: '1.0.0',
			description: 'Cloud Mail 管理 API。除健康检查和本文档外，所有接口都需要 API Key。'
		},
		servers: [{ url: `${origin}/api/open/v1` }],
		security: [{ ApiKey: [] }],
		tags: [
			{ name: 'System', description: '服务状态与接口文档' },
			{ name: 'Users', description: '用户查询、创建、更新、软删除和恢复' },
			{ name: 'Mailboxes', description: '用户邮箱地址管理' },
			{ name: 'Emails', description: '邮件查询、正文读取、发送、状态更新和软删除' }
		],
		paths: {
			'/health': {
				get: operation('System', '服务健康检查', null, { security: [], responses: { 200: response('服务正常') } })
			},
			'/openapi.json': {
				get: operation('System', '获取 OpenAPI 3.1 文档', null, { security: [], responses: { 200: { description: 'OpenAPI JSON' } } })
			},
			'/users': {
				get: operation('Users', '获取用户列表', 'users:read', {
					parameters: queryParameters(['page', 'pageSize', 'email', 'status', 'deleted', 'sort']),
					responses: { 200: response('分页用户列表') }
				}),
				post: operation('Users', '创建用户', 'users:write', {
					requestBody: jsonBody('创建用户和同名主邮箱', 'UserCreate', { email: 'user@example.com', password: 'change-me', roleId: 1 }),
					responses: { 200: response('创建后的用户') }
				})
			},
			'/users/{userId}': {
				get: operation('Users', '读取用户详情', 'users:read', {
					parameters: [idParameter('userId')],
					responses: { 200: response('用户详情和邮箱地址') }
				}),
				patch: operation('Users', '更新用户', 'users:write', {
					parameters: [idParameter('userId')],
					requestBody: jsonBody('可更新密码、状态、角色；deleted=false 可恢复用户', 'UserUpdate', { status: 0, roleId: 1 }),
					responses: { 200: response('更新后的用户') }
				}),
				delete: operation('Users', '软删除用户', 'users:write', {
					parameters: [idParameter('userId')],
					responses: { 200: response('用户已标记删除') }
				})
			},
			'/users/{userId}/mailboxes': {
				get: operation('Mailboxes', '获取用户邮箱地址', 'mailboxes:read', {
					parameters: [idParameter('userId')],
					responses: { 200: response('邮箱地址列表') }
				}),
				post: operation('Mailboxes', '为用户添加邮箱地址', 'mailboxes:write', {
					parameters: [idParameter('userId')],
					requestBody: jsonBody('邮箱必须属于已配置域名', 'MailboxCreate', { email: 'alias@example.com', name: 'Alias' }),
					responses: { 200: response('创建后的邮箱地址') }
				})
			},
			'/mailboxes/{accountId}': {
				patch: operation('Mailboxes', '更新或恢复邮箱地址', 'mailboxes:write', {
					parameters: [idParameter('accountId')],
					requestBody: jsonBody('可更新显示名称；deleted=false 可恢复', 'MailboxUpdate', { name: 'Support', deleted: false }),
					responses: { 200: response('更新后的邮箱地址') }
				}),
				delete: operation('Mailboxes', '软删除邮箱地址', 'mailboxes:write', {
					parameters: [idParameter('accountId')],
					responses: { 200: response('邮箱地址已标记删除') }
				})
			},
			'/temp-mailboxes': {
				post: operation('Mailboxes', '创建随机临时邮箱', 'mailboxes:write', {
					requestBody: jsonBody('自动生成随机地址；有效期最长 7 天', 'TempMailboxCreate', {
						userId: 1,
						domain: 'example.com',
						prefix: 'register',
						ttlMinutes: 30
					}),
					responses: { 200: response('创建后的临时邮箱和到期时间') }
				})
			},
			'/temp-mailboxes/{accountId}': {
				delete: operation('Mailboxes', '清理临时邮箱及其邮件和附件', 'mailboxes:write', {
					parameters: [idParameter('accountId')],
					responses: { 200: response('临时邮箱已清理') }
				})
			},
			'/emails': {
				get: operation('Emails', '查询邮件列表', 'emails:read', {
					parameters: queryParameters(['page', 'pageSize', 'userId', 'accountId', 'type', 'from', 'to', 'subject', 'unread', 'deleted', 'startTime', 'endTime', 'sort']),
					responses: { 200: response('分页邮件摘要') }
				})
			},
			'/emails/{emailId}': {
				get: operation('Emails', '读取邮件正文和附件信息', 'emails:read', {
					parameters: [idParameter('emailId')],
					responses: { 200: response('完整邮件内容') }
				}),
				patch: operation('Emails', '更新已读或删除状态', 'emails:write', {
					parameters: [idParameter('emailId')],
					requestBody: jsonBody('unread 控制已读状态，deleted=false 可恢复', 'EmailUpdate', { unread: false, deleted: false }),
					responses: { 200: response('更新后的邮件') }
				}),
				delete: operation('Emails', '软删除邮件', 'emails:write', {
					parameters: [idParameter('emailId')],
					responses: { 200: response('邮件已标记删除') }
				})
			},
			'/emails/send': {
				post: operation('Emails', '发送邮件', 'emails:send', {
					requestBody: jsonBody('使用指定用户的邮箱发送；附件内容使用 base64', 'EmailSend', {
						userId: 1,
						accountId: 1,
						to: ['recipient@example.net'],
						subject: 'Hello',
						text: 'Hello from Cloud Mail',
						attachments: [{ filename: 'hello.txt', type: 'text/plain', content: 'SGVsbG8=' }]
					}),
					responses: { 200: response('发送并保存后的邮件') }
				})
			}
		},
		components: {
			securitySchemes: {
				ApiKey: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'Cloud Mail API Key',
					description: '也可以通过 X-API-Key 请求头传递。'
				}
			},
			responses: {
				BadRequest: response('请求参数无效'),
				Unauthorized: response('API Key 缺失、无效、停用或过期'),
				Forbidden: response('API Key 缺少所需权限范围'),
				NotFound: response('资源不存在')
			},
			schemas: {
				Envelope: {
					type: 'object',
					required: ['code', 'message'],
					properties: {
						code: { type: 'integer', example: 200 },
						message: { type: 'string', example: 'success' },
						data: {}
					}
				},
				UserCreate: objectSchema(['email', 'password'], {
					email: { type: 'string', format: 'email', description: '用户登录邮箱，必须属于已配置域名' },
					password: { type: 'string', minLength: 6, description: '初始密码' },
					roleId: { type: 'integer', minimum: 1, description: '角色 ID；省略时使用默认角色' }
				}),
				UserUpdate: objectSchema([], {
					password: { type: 'string', minLength: 6, description: '新密码' },
					status: { type: 'integer', enum: [0, 1], description: '0 正常，1 停用' },
					roleId: { type: 'integer', minimum: 1, description: '新角色 ID' },
					deleted: { type: 'boolean', description: '传 false 恢复已软删除用户' }
				}),
				MailboxCreate: objectSchema(['email'], {
					email: { type: 'string', format: 'email', description: '要添加的完整邮箱地址' },
					name: { type: 'string', maxLength: 30, description: '显示名称；省略时取邮箱前缀' }
				}),
				MailboxUpdate: objectSchema([], {
					name: { type: 'string', maxLength: 30, description: '新的显示名称' },
					deleted: { type: 'boolean', description: '传 false 恢复已软删除邮箱地址' }
				}),
				TempMailboxCreate: objectSchema(['userId'], {
					userId: { type: 'integer', minimum: 1, description: '临时邮箱所属用户 ID' },
					domain: { type: 'string', description: '已配置域名；省略时使用第一个域名' },
					prefix: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,19}$', default: 'temp', description: '随机地址前缀' },
					name: { type: 'string', maxLength: 30, description: '显示名称' },
					ttlMinutes: { type: 'integer', minimum: 1, maximum: 10080, default: 60, description: '有效分钟数，最长 7 天' }
				}),
				EmailUpdate: objectSchema([], {
					unread: { type: 'boolean', description: 'true 标记未读，false 标记已读' },
					deleted: { type: 'boolean', description: '传 false 恢复已软删除邮件' }
				}),
				EmailSend: objectSchema(['userId', 'accountId', 'to', 'subject'], {
					userId: { type: 'integer', minimum: 1, description: '发件用户 ID' },
					accountId: { type: 'integer', minimum: 1, description: '属于该用户的发件邮箱 ID' },
					fromName: { type: 'string', description: '发件人显示名称' },
					to: { type: 'array', minItems: 1, items: { type: 'string', format: 'email' }, description: '收件人列表' },
					subject: { type: 'string', minLength: 1, description: '邮件主题' },
					text: { type: 'string', description: '纯文本正文；text 与 html 至少提供一个' },
					html: { type: 'string', description: 'HTML 正文；text 与 html 至少提供一个' },
					attachments: {
						type: 'array',
						maxItems: 10,
						description: '最多 10 个附件',
						items: { $ref: '#/components/schemas/AttachmentInput' }
					}
				}),
				AttachmentInput: objectSchema(['filename', 'type', 'content'], {
					filename: { type: 'string', description: '带扩展名的文件名' },
					type: { type: 'string', description: 'MIME 类型，例如 application/pdf' },
					content: { type: 'string', format: 'byte', description: '不带 data URL 前缀的 base64 内容' }
				})
			}
		}
	};
}

function operation(tag, summary, scope, extra) {
	const responses = {
		...extra.responses,
		...(scope ? {
			400: { $ref: '#/components/responses/BadRequest' },
			401: { $ref: '#/components/responses/Unauthorized' },
			403: { $ref: '#/components/responses/Forbidden' },
			404: { $ref: '#/components/responses/NotFound' }
		} : {})
	};
	return {
		tags: [tag],
		summary,
		...(scope ? { 'x-scope': scope } : {}),
		...extra,
		responses
	};
}

function queryParameters(names) {
	return names.map(name => ({
		name,
		in: 'query',
		required: false,
		description: queryDescription(name),
		schema: querySchema(name)
	}));
}

function querySchema(name) {
	if (['page', 'pageSize', 'userId', 'accountId', 'status'].includes(name)) {
		return name === 'pageSize'
			? { type: 'integer', minimum: 1, maximum: 100, default: 20 }
			: { type: 'integer', minimum: name === 'status' ? 0 : 1, ...(name === 'page' ? { default: 1 } : {}) };
	}
	if (['deleted', 'unread'].includes(name)) {
		return { type: 'boolean' };
	}
	if (name === 'type') {
		return { type: 'string', enum: ['received', 'sent'] };
	}
	if (name === 'sort') {
		return { type: 'string', enum: ['asc', 'desc'], default: 'desc' };
	}
	return { type: 'string' };
}

function queryDescription(name) {
	return {
		page: '页码，从 1 开始',
		pageSize: '每页数量，最大 100',
		email: '按用户邮箱模糊搜索',
		status: '用户状态：0 正常，1 停用',
		deleted: 'true 只查询已软删除记录',
		sort: '按主键升序或降序',
		userId: '按用户 ID 过滤',
		accountId: '按邮箱 ID 过滤',
		type: '邮件类型：received 收件，sent 发件',
		from: '按发件地址模糊搜索',
		to: '按收件地址模糊搜索',
		subject: '按主题模糊搜索',
		unread: 'true 只查询未读，false 只查询已读',
		startTime: '起始时间，ISO 8601 或 YYYY-MM-DD HH:mm:ss',
		endTime: '结束时间，ISO 8601 或 YYYY-MM-DD HH:mm:ss'
	}[name] || '';
}

function objectSchema(required, properties) {
	return {
		type: 'object',
		additionalProperties: false,
		...(required.length ? { required } : {}),
		properties
	};
}
