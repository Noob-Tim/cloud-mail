const DB_TIMESTAMP_DESCRIPTION = 'UTC 时间，格式为 YYYY-MM-DD HH:mm:ss';

export function createOpenApiSpec(origin) {
	const ref = name => ({ $ref: `#/components/schemas/${name}` });
	const success = (description, dataSchema, dataExample) => successResponse(description, dataSchema, dataExample);

	return {
		openapi: '3.1.0',
		info: {
			title: 'Cloud Mail API',
			version: '1.0.0',
			description: [
				'Cloud Mail 的稳定外部 API，适合服务集成和自动化 Agent。',
				'',
				'- 除健康检查和 OpenAPI 文档外，所有接口都需要 API Key。',
				'- API Key 可通过 `Authorization: Bearer <API_KEY>` 或 `X-API-Key: <API_KEY>` 传递。',
				'- 业务接口统一返回 `{ code, message, data }`；HTTP 状态码与 `code` 相同。',
				'- 数据库时间均为 UTC，格式为 `YYYY-MM-DD HH:mm:ss`。',
				'- 普通 DELETE 为软删除；临时邮箱 DELETE 会物理删除邮箱、邮件和附件。',
				'- 临时邮箱到期后立即拒收、禁止发信，并由每小时任务自动清理。'
			].join('\n')
		},
		externalDocs: {
			description: '机器可读 OpenAPI 3.1 JSON',
			url: `${origin}/api/open/v1/openapi.json`
		},
		servers: [{ url: `${origin}/api/open/v1`, description: '当前 Cloud Mail 实例' }],
		security: [{ BearerAuth: [] }, { ApiKeyHeader: [] }],
		tags: [
			{ name: 'System', description: '服务状态与机器可读接口文档' },
			{ name: 'Users', description: '用户查询、创建、更新、软删除和恢复' },
			{ name: 'Mailboxes', description: '普通邮箱和临时邮箱管理' },
			{ name: 'Emails', description: '邮件查询、正文读取、发送、状态更新和软删除' }
		],
		'x-agent-guidance': {
			authentication: '优先使用 Authorization: Bearer <API_KEY>。不要在日志或输出中显示完整 Key。',
			responseEnvelope: '先检查 HTTP 状态码，再读取 code；成功时 code=200，业务数据位于 data。',
			timestamps: DB_TIMESTAMP_DESCRIPTION,
				prerequisites: [
					'在 API 管理页面创建 Key。临时邮箱完整流程通常需要 users:read、mailboxes:write、emails:read 和 emails:send。',
					'如果不知道 userId，可先用 GET /users?email={email} 查询。',
					'域名没有公开发现接口，调用方必须从实例管理员处取得已配置域名。'
				],
			temporaryMailboxWorkflow: [
				{ step: 1, method: 'POST', path: '/temp-mailboxes', purpose: '创建随机临时邮箱并保存 accountId' },
				{ step: 2, method: 'GET', path: '/emails?accountId={accountId}&type=received&sort=desc', purpose: '轮询邮件摘要' },
				{ step: 3, method: 'GET', path: '/emails/{emailId}', purpose: '读取邮件正文和附件元数据' },
				{ step: 4, method: 'DELETE', path: '/temp-mailboxes/{accountId}', purpose: '任务完成后物理清理临时邮箱及其数据' }
			],
				polling: '邮件可能异步到达。建议每 1-3 秒查询一次，设置总超时时间，并按 emailId 去重；不要无间隔循环。',
				idempotency: '不支持 Idempotency-Key。临时邮箱创建或发信发生结果不明的超时时，不要自动重试；先查询邮箱或发件记录并人工/业务规则核对，否则可能产生重复资源或重复邮件。',
				retryPolicy: {
					readRequests: 'GET 遇到网络错误、500 或 502 时可使用有上限的指数退避重试。',
					clientErrors: '400、401、403、404、409 在修正参数、Key、权限或资源状态前不要重试。',
					writeRequests: 'PATCH 和 DELETE 应根据已知资源状态核对后再重试；POST 参照 idempotency 规则。'
				},
				limitations: [
					'没有增量游标；轮询方应保存已处理的 emailId，并在分页变化时自行去重。',
					'邮件详情只返回附件元数据；外部 API 暂不提供附件内容下载接口。'
				]
		},
		paths: {
			'/health': {
				get: operation('getHealth', 'System', '服务健康检查', null, {
					description: '不需要鉴权。用于部署探针和调用前连通性检查。',
					security: [],
					responses: {
						200: success('服务正常', ref('Health'), {
							status: 'ok',
							time: '2026-10-20T05:00:00.000Z'
						})
					}
				})
			},
			'/openapi.json': {
				get: operation('getOpenApiDocument', 'System', '获取 OpenAPI 3.1 文档', null, {
					description: '不需要鉴权。返回原始 OpenAPI 文档，不使用业务响应信封。',
					security: [],
					responses: {
						200: {
							description: 'OpenAPI 3.1 JSON',
							content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } }
						}
					}
				})
			},
			'/users': {
				get: operation('listUsers', 'Users', '获取用户列表', 'users:read', {
					description: '分页查询用户。默认只返回未删除用户。',
					parameters: queryParameters(['page', 'pageSize', 'email', 'status', 'deleted', 'sort']),
					responses: { 200: success('分页用户列表', ref('UserPage'), userPageExample()) }
				}),
				post: operation('createUser', 'Users', '创建用户', 'users:write', {
					description: '创建用户及其同名主邮箱。邮箱必须属于实例已配置域名。',
					requestBody: jsonBody('创建用户和同名主邮箱', 'UserCreate', {
						email: 'user@example.com', password: 'change-me', roleId: 1
					}),
					conflict: true,
					responses: { 200: success('创建后的用户详情', ref('UserDetail'), userDetailExample()) }
				})
			},
			'/users/{userId}': {
				get: operation('getUser', 'Users', '读取用户详情', 'users:read', {
					description: '返回用户及其全部邮箱，包括已软删除邮箱。',
					parameters: [idParameter('userId', '用户 ID')],
					responses: { 200: success('用户详情和邮箱地址', ref('UserDetail'), userDetailExample()) }
				}),
				patch: operation('updateUser', 'Users', '更新或恢复用户', 'users:write', {
					description: '按需更新密码、状态或角色。`deleted=false` 可恢复已软删除用户；主邮箱不可修改。',
					parameters: [idParameter('userId', '用户 ID')],
					requestBody: jsonBody('至少提供一个需要更新的字段', 'UserUpdate', { status: 0, roleId: 1 }),
					responses: { 200: success('更新后的用户详情', ref('UserDetail'), userDetailExample()) }
				}),
				delete: operation('deleteUser', 'Users', '软删除用户', 'users:write', {
					description: '软删除用户。管理员账户不能删除。成功时 data 为 null。',
					parameters: [idParameter('userId', '用户 ID')],
					responses: { 200: success('用户已标记删除', { type: 'null' }, null) }
				})
			},
			'/users/{userId}/mailboxes': {
				get: operation('listUserMailboxes', 'Mailboxes', '获取用户邮箱地址', 'mailboxes:read', {
					description: '返回指定用户的邮箱。默认只返回有效邮箱；`deleted=true` 时同时包含已软删除邮箱。',
					parameters: [
						idParameter('userId', '用户 ID'),
						queryParameter('deleted', 'true 同时包含已软删除邮箱', { type: 'boolean', default: false })
					],
					responses: { 200: success('邮箱地址列表', { type: 'array', items: ref('MailboxSummary') }, [mailboxSummaryExample()]) }
				}),
				post: operation('createMailbox', 'Mailboxes', '为用户添加邮箱地址', 'mailboxes:write', {
					description: '邮箱必须属于实例已配置域名，并受用户角色的域名和邮箱数量限制。',
					parameters: [idParameter('userId', '用户 ID')],
					requestBody: jsonBody('创建普通邮箱', 'MailboxCreate', { email: 'alias@example.com', name: 'Alias' }),
					conflict: true,
					responses: { 200: success('创建后的邮箱地址', ref('Mailbox'), mailboxExample()) }
				})
			},
			'/mailboxes/{accountId}': {
				patch: operation('updateMailbox', 'Mailboxes', '更新或恢复邮箱地址', 'mailboxes:write', {
					description: '更新显示名称；`deleted=false` 可恢复邮箱。主邮箱不能通过 `deleted=true` 删除。',
					parameters: [idParameter('accountId', '邮箱 ID')],
					requestBody: jsonBody('至少提供一个需要更新的字段', 'MailboxUpdate', { name: 'Support', deleted: false }),
					responses: { 200: success('更新后的邮箱地址', ref('Mailbox'), mailboxExample()) }
				}),
				delete: operation('deleteMailbox', 'Mailboxes', '软删除邮箱地址', 'mailboxes:write', {
					description: '软删除普通邮箱或别名。用户主邮箱不能删除。',
					parameters: [idParameter('accountId', '邮箱 ID')],
					responses: { 200: success('已软删除的邮箱地址', ref('Mailbox'), { ...mailboxExample(), isDel: 1 }) }
				})
			},
			'/temp-mailboxes': {
				post: operation('createTempMailbox', 'Mailboxes', '创建随机临时邮箱', 'mailboxes:write', {
					description: [
						'创建 `{prefix}-{12位随机十六进制}@{domain}` 地址。地址冲突时服务端最多重试 5 次。',
						'默认有效期 60 分钟，最长 7 天。到期后立即拒收和禁止发信；每小时清理任务会物理删除邮箱、邮件和附件。'
					].join('\n\n'),
					requestBody: jsonBody('创建临时邮箱', 'TempMailboxCreate', {
						userId: 1, domain: 'example.com', prefix: 'register', ttlMinutes: 30
					}),
					conflict: true,
					responses: { 200: success('创建后的临时邮箱和到期时间', ref('TempMailbox'), tempMailboxExample()) }
				})
			},
			'/temp-mailboxes/{accountId}': {
				delete: operation('deleteTempMailbox', 'Mailboxes', '清理临时邮箱及其数据', 'mailboxes:write', {
					description: '只接受临时邮箱 ID。立即物理删除该邮箱、所属邮件、附件和关联数据，此操作不可恢复。',
					parameters: [idParameter('accountId', '临时邮箱 ID')],
					responses: { 200: success('临时邮箱已清理', ref('DeleteResult'), { accountId: 42, deleted: true }) }
				})
			},
			'/emails': {
				get: operation('listEmails', 'Emails', '查询邮件列表', 'emails:read', {
					description: '分页返回邮件摘要，不包含完整 HTML 和附件。使用 `emailId` 调用详情接口读取正文。',
					parameters: queryParameters([
						'page', 'pageSize', 'userId', 'accountId', 'type', 'from', 'to', 'subject',
						'unread', 'deleted', 'startTime', 'endTime', 'sort'
					]),
					responses: { 200: success('分页邮件摘要', ref('EmailPage'), emailPageExample()) }
				})
			},
			'/emails/{emailId}': {
				get: operation('getEmail', 'Emails', '读取邮件正文和附件', 'emails:read', {
					description: '返回完整纯文本、HTML、投递信息和附件元数据。附件内容不内嵌在响应中。',
					parameters: [idParameter('emailId', '邮件 ID')],
					responses: { 200: success('完整邮件内容', ref('EmailDetail'), emailDetailExample()) }
				}),
				patch: operation('updateEmail', 'Emails', '更新邮件状态', 'emails:write', {
					description: '设置已读状态，或软删除/恢复邮件。至少提供一个字段。',
					parameters: [idParameter('emailId', '邮件 ID')],
					requestBody: jsonBody('更新邮件状态', 'EmailUpdate', { unread: false, deleted: false }),
					responses: { 200: success('更新后的完整邮件', ref('EmailDetail'), emailDetailExample()) }
				}),
				delete: operation('deleteEmail', 'Emails', '软删除邮件', 'emails:write', {
					description: '将邮件标记为已删除，邮件仍可通过 PATCH `deleted=false` 恢复。',
					parameters: [idParameter('emailId', '邮件 ID')],
					responses: { 200: success('已软删除的完整邮件', ref('EmailDetail'), { ...emailDetailExample(), isDel: 1 }) }
				})
			},
			'/emails/send': {
				post: operation('sendEmail', 'Emails', '发送邮件', 'emails:send', {
					description: [
						'使用指定用户所属邮箱发信，并保存发件记录。`text` 与 `html` 至少提供一个。',
						'同域收件人直接写入 Cloud Mail；站外投递需要实例已配置 Cloudflare Email 或对应域名的 Resend。',
						'接口不支持幂等键。请求超时后先查询发件记录，避免直接重复发送。'
					].join('\n\n'),
					requestBody: jsonBody('发送邮件；附件内容使用不带 data URL 前缀的 base64', 'EmailSend', {
						userId: 1,
						accountId: 1,
						to: ['recipient@example.net'],
						subject: 'Hello',
						text: 'Hello from Cloud Mail',
						attachments: [{ filename: 'hello.txt', type: 'text/plain', content: 'SGVsbG8=' }]
					}),
					conflict: true,
					responses: { 200: success('已保存的发件记录数组', { type: 'array', items: ref('SentEmail') }, [sentEmailExample()]) }
				})
			}
		},
		components: {
			securitySchemes: {
				BearerAuth: {
					type: 'http', scheme: 'bearer', bearerFormat: 'Cloud Mail API Key',
					description: '推荐方式：Authorization: Bearer <API_KEY>'
				},
				ApiKeyHeader: {
					type: 'apiKey', in: 'header', name: 'X-API-Key',
					description: '备用方式：X-API-Key: <API_KEY>'
				}
			},
			responses: {
				BadRequest: errorResponse(400, '请求参数或 JSON 无效', '请求参数无效'),
				Unauthorized: errorResponse(401, 'API Key 缺失、无效、停用或过期', '缺少 API Key'),
				Forbidden: errorResponse(403, 'API Key 缺少权限，或资源受角色策略限制', 'API Key 缺少权限：emails:read'),
				NotFound: errorResponse(404, '资源不存在', '资源不存在'),
				Conflict: errorResponse(409, '资源冲突或状态不允许当前操作', '邮箱地址已存在'),
				InternalServerError: errorResponse(500, '服务器内部错误', '服务器内部错误'),
				BadGateway: errorResponse(502, 'Cloudflare 绑定、数据库或上游服务不可用', '上游服务不可用')
			},
			schemas: {
				SuccessEnvelope: objectSchema(['code', 'message'], {
					code: { type: 'integer', const: 200, description: '业务状态码' },
					message: { type: 'string', const: 'success', description: '成功消息' }
				}),
				ErrorEnvelope: objectSchema(['code', 'message'], {
					code: { type: 'integer', minimum: 400, maximum: 599, description: '与 HTTP 状态码相同' },
					message: { type: 'string', description: '可用于诊断的错误消息' }
				}),
				Health: objectSchema(['status', 'time'], {
					status: { type: 'string', const: 'ok' },
					time: { type: 'string', format: 'date-time', description: 'ISO 8601 UTC 时间' }
				}),
				UserCreate: objectSchema(['email', 'password'], {
					email: { type: 'string', format: 'email', description: '用户登录邮箱，必须属于已配置域名' },
					password: { type: 'string', minLength: 6, writeOnly: true, description: '初始密码，至少 6 个字符' },
					roleId: { type: 'integer', minimum: 1, description: '角色 ID；省略时使用默认角色' }
				}),
				UserUpdate: objectSchema([], {
					password: { type: 'string', minLength: 6, writeOnly: true, description: '新密码，至少 6 个字符' },
					status: { type: 'integer', enum: [0, 1], description: '0 正常，1 停用' },
					roleId: { type: 'integer', minimum: 1, description: '新角色 ID' },
					deleted: { type: 'boolean', enum: [false], description: '传 false 恢复已软删除用户' }
				}, { minProperties: 1 }),
				UserSummary: objectSchema(['userId', 'email', 'roleId', 'status', 'sendCount', 'createTime', 'isDeleted'], {
					userId: { type: 'integer', minimum: 1 },
					email: { type: 'string', format: 'email' },
					roleId: { type: 'integer', minimum: 1 },
					roleName: nullableString('角色名称'),
					status: { type: 'integer', enum: [0, 1], description: '0 正常，1 停用' },
					sendCount: { type: ['integer', 'string'], description: '累计或当日发信计数，取决于角色策略' },
					createTime: dbTimestamp('创建时间'),
					activeTime: nullableTimestamp('最近活跃时间'),
					isDeleted: { type: 'integer', enum: [0, 1], description: '0 有效，1 已软删除' }
				}),
				UserDetail: {
					allOf: [
						ref('UserSummary'),
						objectSchema(['mailboxes'], {
							mailboxes: { type: 'array', items: ref('MailboxSummary'), description: '包含已软删除邮箱' }
						})
					]
				},
				UserPage: pageSchema(ref('UserSummary')),
				MailboxCreate: objectSchema(['email'], {
					email: { type: 'string', format: 'email', description: '完整邮箱地址，必须属于已配置域名' },
					name: { type: 'string', maxLength: 30, description: '显示名称；省略时取邮箱前缀' }
				}),
				MailboxUpdate: objectSchema([], {
					name: { type: 'string', minLength: 1, maxLength: 30, description: '新的显示名称' },
					deleted: { type: 'boolean', description: 'true 软删除，false 恢复；主邮箱不能删除' }
				}, { minProperties: 1 }),
				MailboxSummary: objectSchema(['accountId', 'email', 'name', 'status', 'isDeleted', 'isTemp'], {
					accountId: { type: 'integer', minimum: 1 },
					email: { type: 'string', format: 'email' },
					name: { type: 'string' },
					status: { type: 'integer', description: '邮箱状态值' },
					latestEmailTime: nullableTimestamp('最近收信时间'),
					createTime: dbTimestamp('创建时间'),
					isDeleted: { type: 'integer', enum: [0, 1], description: '0 有效，1 已软删除' },
					isTemp: { type: 'integer', enum: [0, 1], description: '0 普通邮箱，1 临时邮箱' },
					expiresAt: nullableTimestamp('临时邮箱到期时间；普通邮箱为 null')
				}),
				Mailbox: objectSchema(['accountId', 'userId', 'email', 'name', 'status', 'allReceive', 'sort', 'isDel', 'isTemp'], {
					accountId: { type: 'integer', minimum: 1 },
					userId: { type: 'integer', minimum: 1 },
					email: { type: 'string', format: 'email' },
					name: { type: 'string' },
					status: { type: 'integer', description: '邮箱状态值' },
					latestEmailTime: nullableTimestamp('最近收信时间'),
					createTime: dbTimestamp('创建时间'),
					allReceive: { type: 'integer', enum: [0, 1], description: '是否接收该域名的全部邮件' },
					sort: { type: 'integer', description: '排序值' },
					isDel: { type: 'integer', enum: [0, 1], description: '0 有效，1 已软删除' },
					isTemp: { type: 'integer', enum: [0, 1], description: '0 普通邮箱，1 临时邮箱' },
					expiresAt: nullableTimestamp('临时邮箱到期时间；普通邮箱为 null')
				}),
				TempMailboxCreate: objectSchema(['userId'], {
					userId: { type: 'integer', minimum: 1, description: '临时邮箱所属用户 ID' },
					domain: { type: 'string', description: '已配置域名；省略时使用第一个域名' },
					prefix: {
						type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,19}$', default: 'temp',
						description: '随机地址前缀，1-20 个小写字母、数字或连字符'
					},
					name: { type: 'string', maxLength: 30, description: '显示名称' },
					ttlMinutes: { type: 'integer', minimum: 1, maximum: 10080, default: 60, description: '有效分钟数，最长 7 天' }
				}),
				TempMailbox: {
					allOf: [
						ref('Mailbox'),
						objectSchema(['ttlMinutes'], {
							ttlMinutes: { type: 'integer', minimum: 1, maximum: 10080 }
						})
					]
				},
				DeleteResult: objectSchema(['accountId', 'deleted'], {
					accountId: { type: 'integer', minimum: 1 },
					deleted: { type: 'boolean', const: true }
				}),
				EmailUpdate: objectSchema([], {
					unread: { type: 'boolean', description: 'true 标记未读，false 标记已读' },
					deleted: { type: 'boolean', description: 'true 软删除，false 恢复' }
				}, { minProperties: 1 }),
				EmailSend: objectSchema(['userId', 'accountId', 'to', 'subject'], {
					userId: { type: 'integer', minimum: 1, description: '发件用户 ID' },
					accountId: { type: 'integer', minimum: 1, description: '属于该用户的发件邮箱 ID' },
					fromName: { type: 'string', description: '发件人显示名称；省略时取邮箱前缀' },
					to: { type: 'array', minItems: 1, items: { type: 'string', format: 'email' }, description: '收件人列表' },
					subject: { type: 'string', minLength: 1, description: '邮件主题' },
					text: { type: 'string', description: '纯文本正文；text 与 html 至少提供一个' },
					html: { type: 'string', description: 'HTML 正文；text 与 html 至少提供一个' },
					attachments: { type: 'array', maxItems: 10, description: '最多 10 个附件', items: ref('AttachmentInput') }
				}, { anyOf: [{ required: ['text'] }, { required: ['html'] }] }),
				AttachmentInput: objectSchema(['filename', 'type', 'content'], {
					filename: { type: 'string', minLength: 1, description: '带扩展名的文件名' },
					type: { type: 'string', minLength: 1, description: 'MIME 类型，例如 application/pdf' },
					content: { type: 'string', format: 'byte', minLength: 1, writeOnly: true, description: '不带 data URL 前缀的 base64 内容' }
				}),
				Attachment: objectSchema(['attId', 'userId', 'emailId', 'accountId', 'filename', 'mimeType', 'size'], {
					attId: { type: 'integer', minimum: 1 },
					userId: { type: 'integer', minimum: 1 },
					emailId: { type: 'integer', minimum: 1 },
					accountId: { type: 'integer', minimum: 1 },
					key: { type: 'string', description: '附件存储键' },
					filename: { type: 'string' },
					mimeType: { type: 'string' },
					size: { type: 'integer', minimum: 0, description: '字节数' },
					status: { type: ['integer', 'string'] },
					type: { type: 'integer', description: '0 普通附件，1 内嵌附件' },
					disposition: nullableString('Content-Disposition'),
					related: nullableString('关联信息'),
					contentId: nullableString('内嵌附件 Content-ID'),
					encoding: nullableString('传输编码'),
					createTime: dbTimestamp('创建时间')
				}),
				EmailSummary: objectSchema(['emailId', 'userId', 'accountId', 'from', 'to', 'subject', 'type', 'status', 'unread', 'createTime', 'isDeleted'], {
					emailId: { type: 'integer', minimum: 1 },
					userId: { type: 'integer', minimum: 1 },
					accountId: { type: 'integer', minimum: 1 },
					from: nullableString('发件地址'),
					fromName: nullableString('发件人名称'),
					to: { type: 'string', description: '收件地址' },
					toName: { type: 'string', description: '收件人名称' },
					subject: nullableString('邮件主题'),
					preview: { type: 'string', description: '纯文本预览，最多 300 个字符' },
					type: { type: 'integer', enum: [0, 1], description: '0 收件，1 发件' },
					status: { type: 'integer', description: '投递状态值' },
					unread: { type: 'integer', enum: [0, 1], description: '0 已读，1 未读' },
					createTime: dbTimestamp('创建时间'),
					isDeleted: { type: 'integer', enum: [0, 1], description: '0 有效，1 已软删除' }
				}),
				EmailPage: pageSchema(ref('EmailSummary')),
				EmailDetail: objectSchema(['emailId', 'userId', 'accountId', 'toEmail', 'type', 'status', 'unread', 'createTime', 'isDel'], {
					emailId: { type: 'integer', minimum: 1 },
					sendEmail: nullableString('发件地址'),
					name: nullableString('发件人名称'),
					accountId: { type: 'integer', minimum: 1 },
					userId: { type: 'integer', minimum: 1 },
					subject: nullableString('邮件主题'),
					code: { type: 'string', description: '原始邮件或处理代码' },
					text: nullableString('纯文本正文'),
					content: nullableString('HTML 正文'),
					cc: { type: 'string', description: 'JSON 字符串形式的抄送列表' },
					bcc: { type: 'string', description: 'JSON 字符串形式的密送列表' },
					recipient: nullableString('JSON 字符串形式的收件人列表'),
					toEmail: { type: 'string', description: '收件地址' },
					toName: { type: 'string', description: '收件人名称' },
					inReplyTo: nullableString('回复的 Message-ID'),
					relation: nullableString('关联 Message-ID'),
					messageId: nullableString('邮件 Message-ID'),
					type: { type: 'integer', enum: [0, 1], description: '0 收件，1 发件' },
					status: { type: 'integer', description: '投递状态值' },
					resendEmailId: nullableString('上游投递 ID'),
					message: nullableString('投递消息'),
					unread: { type: 'integer', enum: [0, 1], description: '0 已读，1 未读' },
					createTime: dbTimestamp('创建时间'),
					isDel: { type: 'integer', enum: [0, 1], description: '0 有效，1 已软删除' },
					attachments: { type: 'array', items: ref('Attachment') }
				}),
				SentEmail: {
					allOf: [
						ref('EmailDetail'),
						objectSchema(['attList'], {
							attList: { type: 'array', items: ref('Attachment'), description: '发送接口使用的附件字段' }
						})
					]
				}
			}
		}
	};
}

function operation(operationId, tag, summary, scope, extra) {
	const { conflict = false, responses = {}, ...operationFields } = extra;
	return {
		operationId,
		tags: [tag],
		summary,
		...(scope ? { 'x-scope': scope } : {}),
		...operationFields,
		responses: { ...responses, ...(scope ? commonErrorResponses(conflict) : {}) }
	};
}

function commonErrorResponses(includeConflict) {
	return {
		400: { $ref: '#/components/responses/BadRequest' },
		401: { $ref: '#/components/responses/Unauthorized' },
		403: { $ref: '#/components/responses/Forbidden' },
		404: { $ref: '#/components/responses/NotFound' },
		...(includeConflict ? { 409: { $ref: '#/components/responses/Conflict' } } : {}),
		500: { $ref: '#/components/responses/InternalServerError' },
		502: { $ref: '#/components/responses/BadGateway' }
	};
}

function successResponse(description, dataSchema, dataExample) {
	return {
		description,
		content: {
			'application/json': {
				schema: {
					allOf: [
						{ $ref: '#/components/schemas/SuccessEnvelope' },
						objectSchema(['data'], { data: dataSchema })
					]
				},
				example: { code: 200, message: 'success', data: dataExample }
			}
		}
	};
}

function errorResponse(code, description, message) {
	return {
		description,
		content: {
			'application/json': {
				schema: { $ref: '#/components/schemas/ErrorEnvelope' },
				example: { code, message }
			}
		}
	};
}

function idParameter(name, description) {
	return { name, in: 'path', required: true, description, schema: { type: 'integer', minimum: 1 }, example: 1 };
}

function queryParameter(name, description, schema) {
	return { name, in: 'query', required: false, description, schema };
}

function jsonBody(description, schemaName, example) {
	return {
		required: true,
		description,
		content: {
			'application/json': {
				schema: { $ref: `#/components/schemas/${schemaName}` },
				example
			}
		}
	};
}

function queryParameters(names) {
	return names.map(name => queryParameter(name, queryDescription(name), querySchema(name)));
}

function querySchema(name) {
	if (name === 'page') return { type: 'integer', minimum: 1, default: 1 };
	if (name === 'pageSize') return { type: 'integer', minimum: 1, maximum: 100, default: 20 };
	if (['userId', 'accountId'].includes(name)) return { type: 'integer', minimum: 1 };
	if (name === 'status') return { type: 'integer', enum: [0, 1] };
	if (name === 'deleted') return { type: 'boolean', default: false };
	if (name === 'unread') return { type: 'boolean' };
	if (name === 'type') return { type: 'string', enum: ['received', 'sent'] };
	if (name === 'sort') return { type: 'string', enum: ['asc', 'desc'], default: 'desc' };
	if (['startTime', 'endTime'].includes(name)) return { type: 'string', example: '2026-10-20 05:00:00' };
	return { type: 'string' };
}

function queryDescription(name) {
	return {
		page: '页码，从 1 开始',
		pageSize: '每页数量，最大 100',
		email: '按用户邮箱模糊搜索',
		status: '用户状态：0 正常，1 停用',
		deleted: 'true 只查询已软删除记录，false 只查询有效记录',
		sort: '按主键升序或降序',
		userId: '按用户 ID 过滤',
		accountId: '按邮箱 ID 过滤',
		type: '邮件类型：received 收件，sent 发件',
		from: '按发件地址模糊搜索',
		to: '按收件地址模糊搜索',
		subject: '按主题模糊搜索',
		unread: 'true 只查询未读，false 只查询已读',
		startTime: `起始时间（含），${DB_TIMESTAMP_DESCRIPTION}`,
		endTime: `结束时间（含），${DB_TIMESTAMP_DESCRIPTION}`
	}[name] || '';
}

function objectSchema(required, properties, extra = {}) {
	return {
		type: 'object',
		...(required.length ? { required } : {}),
		properties,
		...extra
	};
}

function pageSchema(itemSchema) {
	return objectSchema(['items', 'page', 'pageSize', 'total', 'totalPages'], {
		items: { type: 'array', items: itemSchema },
		page: { type: 'integer', minimum: 1 },
		pageSize: { type: 'integer', minimum: 1, maximum: 100 },
		total: { type: 'integer', minimum: 0 },
		totalPages: { type: 'integer', minimum: 0 }
	});
}

function dbTimestamp(description) {
	return { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$', description: `${description}；${DB_TIMESTAMP_DESCRIPTION}` };
}

function nullableTimestamp(description) {
	return { type: ['string', 'null'], description: `${description}；非空时为 UTC YYYY-MM-DD HH:mm:ss` };
}

function nullableString(description) {
	return { type: ['string', 'null'], description };
}

function mailboxExample() {
	return {
		accountId: 2,
		userId: 1,
		email: 'alias@example.com',
		name: 'Alias',
		status: 0,
		latestEmailTime: null,
		createTime: '2026-10-20 05:00:00',
		allReceive: 0,
		sort: 0,
		isDel: 0,
		isTemp: 0,
		expiresAt: null
	};
}

function mailboxSummaryExample() {
	const { userId, allReceive, sort, isDel, ...example } = mailboxExample();
	return { ...example, isDeleted: isDel };
}

function tempMailboxExample() {
	return {
		...mailboxExample(),
		accountId: 42,
		email: 'register-a1b2c3d4e5f6@example.com',
		name: 'register-a1b2c3d4e5f6',
		isTemp: 1,
		expiresAt: '2026-10-20 05:30:00',
		ttlMinutes: 30
	};
}

function userSummaryExample() {
	return {
		userId: 1,
		email: 'user@example.com',
		roleId: 1,
		roleName: 'User',
		status: 0,
		sendCount: '0',
		createTime: '2026-10-20 05:00:00',
		activeTime: null,
		isDeleted: 0
	};
}

function userDetailExample() {
	return { ...userSummaryExample(), mailboxes: [mailboxSummaryExample()] };
}

function userPageExample() {
	return { items: [userSummaryExample()], page: 1, pageSize: 20, total: 1, totalPages: 1 };
}

function emailSummaryExample() {
	return {
		emailId: 101,
		userId: 1,
		accountId: 42,
		from: 'sender@example.net',
		fromName: 'Sender',
		to: 'register-a1b2c3d4e5f6@example.com',
		toName: 'register-a1b2c3d4e5f6',
		subject: 'Verification code',
		preview: 'Your verification code is 123456',
		type: 0,
		status: 0,
		unread: 1,
		createTime: '2026-10-20 05:01:00',
		isDeleted: 0
	};
}

function emailPageExample() {
	return { items: [emailSummaryExample()], page: 1, pageSize: 20, total: 1, totalPages: 1 };
}

function emailDetailExample() {
	return {
		emailId: 101,
		sendEmail: 'sender@example.net',
		name: 'Sender',
		accountId: 42,
		userId: 1,
		subject: 'Verification code',
		code: '',
		text: 'Your verification code is 123456',
		content: '<p>Your verification code is <strong>123456</strong></p>',
		cc: '[]',
		bcc: '[]',
		recipient: null,
		toEmail: 'register-a1b2c3d4e5f6@example.com',
		toName: 'register-a1b2c3d4e5f6',
		inReplyTo: '',
		relation: '',
		messageId: '<example-message-id@example.net>',
		type: 0,
		status: 0,
		resendEmailId: null,
		message: null,
		unread: 1,
		createTime: '2026-10-20 05:01:00',
		isDel: 0,
		attachments: []
	};
}

function sentEmailExample() {
	const { attachments, ...example } = emailDetailExample();
	return {
		...example,
		emailId: 102,
		sendEmail: 'user@example.com',
		accountId: 1,
		toEmail: '',
		toName: '',
		recipient: '[{"address":"recipient@example.net","name":""}]',
		subject: 'Hello',
		text: 'Hello from Cloud Mail',
		content: '',
		type: 1,
		unread: 0,
		attList: []
	};
}
