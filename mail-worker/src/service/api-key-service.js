import dayjs from 'dayjs';
import { desc, eq } from 'drizzle-orm';
import BizError from '../error/biz-error';
import orm from '../entity/orm';
import apiKey from '../entity/api-key';
import { apiKeyStatus } from '../const/api-key-const';
import {
	generateApiKey,
	hashApiKey,
	parseApiScopes,
	validateApiScopes
} from '../utils/api-key-utils';

const apiKeyService = {
	async list(c) {
		const rows = await orm(c).select({
			apiKeyId: apiKey.apiKeyId,
			name: apiKey.name,
			prefix: apiKey.prefix,
			scopes: apiKey.scopes,
			status: apiKey.status,
			expiresAt: apiKey.expiresAt,
			lastUsedAt: apiKey.lastUsedAt,
			createdBy: apiKey.createdBy,
			createdAt: apiKey.createdAt
		}).from(apiKey).orderBy(desc(apiKey.apiKeyId)).all();

		return rows.map(row => ({ ...row, scopes: parseApiScopes(row.scopes) }));
	},

	async create(c, params, userId) {
		const name = String(params.name || '').trim();
		const scopes = [...new Set(params.scopes || [])];
		const expiresAt = normalizeExpiresAt(params.expiresAt);

		if (!name || name.length > 60) {
			throw new BizError('API Key 名称不能为空且不能超过 60 个字符', 400);
		}

		if (!validateApiScopes(scopes)) {
			throw new BizError('请选择有效的 API 权限范围', 400);
		}

		const rawKey = generateApiKey();
		const keyHash = await hashApiKey(rawKey);
		const prefix = rawKey.slice(0, 11);
		const row = await orm(c).insert(apiKey).values({
			name,
			prefix,
			keyHash,
			scopes: JSON.stringify(scopes),
			expiresAt,
			createdBy: userId
		}).returning({
			apiKeyId: apiKey.apiKeyId,
			name: apiKey.name,
			prefix: apiKey.prefix,
			scopes: apiKey.scopes,
			status: apiKey.status,
			expiresAt: apiKey.expiresAt,
			createdAt: apiKey.createdAt
		}).get();

		return { ...row, scopes, key: rawKey };
	},

	async update(c, apiKeyId, params) {
		const row = await this.selectById(c, apiKeyId);
		if (!row) {
			throw new BizError('API Key 不存在', 404);
		}

		const values = {};
		if (params.name !== undefined) {
			const name = String(params.name).trim();
			if (!name || name.length > 60) {
				throw new BizError('API Key 名称不能为空且不能超过 60 个字符', 400);
			}
			values.name = name;
		}

		if (params.scopes !== undefined) {
			const scopes = [...new Set(params.scopes || [])];
			if (!validateApiScopes(scopes)) {
				throw new BizError('请选择有效的 API 权限范围', 400);
			}
			values.scopes = JSON.stringify(scopes);
		}

		if (params.status !== undefined) {
			const status = Number(params.status);
			if (![apiKeyStatus.ACTIVE, apiKeyStatus.DISABLED].includes(status)) {
				throw new BizError('API Key 状态无效', 400);
			}
			values.status = status;
		}

		if (params.expiresAt !== undefined) {
			values.expiresAt = normalizeExpiresAt(params.expiresAt);
		}

		if (Object.keys(values).length > 0) {
			await orm(c).update(apiKey).set(values).where(eq(apiKey.apiKeyId, Number(apiKeyId))).run();
		}

		return this.selectSafeById(c, apiKeyId);
	},

	async delete(c, apiKeyId) {
		const row = await this.selectById(c, apiKeyId);
		if (!row) {
			throw new BizError('API Key 不存在', 404);
		}
		await orm(c).delete(apiKey).where(eq(apiKey.apiKeyId, Number(apiKeyId))).run();
	},

	selectById(c, apiKeyId) {
		return orm(c).select().from(apiKey).where(eq(apiKey.apiKeyId, Number(apiKeyId))).get();
	},

	async selectSafeById(c, apiKeyId) {
		const row = await this.selectById(c, apiKeyId);
		if (!row) {
			return null;
		}
		delete row.keyHash;
		row.scopes = parseApiScopes(row.scopes);
		return row;
	},

	async authenticate(c, requiredScope) {
		const rawKey = extractApiKey(c);
		if (!rawKey) {
			throw new BizError('缺少 API Key', 401);
		}

		const keyHash = await hashApiKey(rawKey);
		const row = await orm(c).select().from(apiKey).where(eq(apiKey.keyHash, keyHash)).get();

		if (!row || row.status !== apiKeyStatus.ACTIVE) {
			throw new BizError('API Key 无效或已停用', 401);
		}

		if (row.expiresAt && dayjs(row.expiresAt).isBefore(dayjs())) {
			throw new BizError('API Key 已过期', 401);
		}

		const scopes = parseApiScopes(row.scopes);
		if (requiredScope && !scopes.includes(requiredScope)) {
			throw new BizError(`API Key 缺少权限：${requiredScope}`, 403);
		}

		if (!row.lastUsedAt || dayjs().diff(dayjs(row.lastUsedAt), 'minute') >= 5) {
			const lastUsedAt = dayjs().format('YYYY-MM-DD HH:mm:ss');
			c.executionCtx.waitUntil(
				orm(c).update(apiKey).set({ lastUsedAt }).where(eq(apiKey.apiKeyId, row.apiKeyId)).run()
			);
		}

		c.set('apiKey', { ...row, scopes });
		return row;
	}
};

function extractApiKey(c) {
	const authorization = c.req.header('Authorization') || '';
	if (authorization.toLowerCase().startsWith('bearer ')) {
		return authorization.slice(7).trim();
	}
	return c.req.header('X-API-Key')?.trim();
}

function normalizeExpiresAt(value) {
	if (!value) {
		return null;
	}

	const date = dayjs(value);
	if (!date.isValid() || date.isBefore(dayjs())) {
		throw new BizError('API Key 有效期必须晚于当前时间', 400);
	}
	return date.format('YYYY-MM-DD HH:mm:ss');
}

export default apiKeyService;
