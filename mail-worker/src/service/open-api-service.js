import dayjs from 'dayjs';
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	like,
	lte,
	sql
} from 'drizzle-orm';
import BizError from '../error/biz-error';
import orm from '../entity/orm';
import user from '../entity/user';
import account from '../entity/account';
import email from '../entity/email';
import role from '../entity/role';
import { isDel, emailConst, userConst } from '../const/entity-const';
import KvConst from '../const/kv-const';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import accountService from './account-service';
import roleService from './role-service';
import emailService from './email-service';
import attService from './att-service';

const openApiService = {
	async listUsers(c, params) {
		const { page, pageSize, offset } = pagination(params);
		const conditions = [];
		validateSort(params.sort);

		if (params.email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${`%${params.email}%`}`);
		}
		if (params.status !== undefined) {
			const status = numberParam(params.status, 'status');
			if (![userConst.status.NORMAL, userConst.status.BAN].includes(status)) {
				throw new BizError('用户状态无效', 400);
			}
			conditions.push(eq(user.status, status));
		}
		conditions.push(eq(user.isDel, booleanParam(params.deleted, false) ? isDel.DELETE : isDel.NORMAL));

		const where = and(...conditions);
		const items = await orm(c).select({
			userId: user.userId,
			email: user.email,
			roleId: user.type,
			roleName: role.name,
			status: user.status,
			sendCount: user.sendCount,
			createTime: user.createTime,
			activeTime: user.activeTime,
			isDeleted: user.isDel
		}).from(user)
			.leftJoin(role, eq(role.roleId, user.type))
			.where(where)
			.orderBy(params.sort === 'asc' ? asc(user.userId) : desc(user.userId))
			.limit(pageSize)
			.offset(offset)
			.all();

		const totalRow = await orm(c).select({ total: count() }).from(user).where(where).get();
		return pageResult(items, totalRow.total, page, pageSize);
	},

	async getUser(c, userId) {
		const id = positiveId(userId, 'userId');
		const row = await orm(c).select({
			userId: user.userId,
			email: user.email,
			roleId: user.type,
			roleName: role.name,
			status: user.status,
			sendCount: user.sendCount,
			createTime: user.createTime,
			activeTime: user.activeTime,
			isDeleted: user.isDel
		}).from(user)
			.leftJoin(role, eq(role.roleId, user.type))
			.where(eq(user.userId, id))
			.get();

		if (!row) {
			throw new BizError('用户不存在', 404);
		}

		row.mailboxes = await this.listUserMailboxes(c, id, { deleted: true });
		return row;
	},

	async createUser(c, params) {
		const emailAddress = String(params.email || '').trim().toLowerCase();
		const password = String(params.password || '');
		if (!verifyUtils.isEmail(emailAddress)) {
			throw new BizError('邮箱格式不正确', 400);
		}
		if (!hasConfiguredDomain(c.env.domain, emailAddress)) {
			throw new BizError('邮箱不属于已配置域名', 400);
		}
		if (password.length < 6) {
			throw new BizError('密码至少需要 6 个字符', 400);
		}
		if (await accountService.selectByEmailIncludeDel(c, emailAddress)) {
			throw new BizError('用户或邮箱地址已存在', 409);
		}
		if (params.roleId !== undefined && !await roleService.selectById(c, Number(params.roleId))) {
			throw new BizError('角色不存在', 400);
		}

		await userService.add(c, {
			email: emailAddress,
			password,
			type: params.roleId === undefined ? undefined : Number(params.roleId)
		});
		const row = await userService.selectByEmail(c, emailAddress);
		return this.getUser(c, row.userId);
	},

	async updateUser(c, userId, params) {
		const id = positiveId(userId, 'userId');
		const row = await userService.selectByIdIncludeDel(c, id);
		if (!row) {
			throw new BizError('用户不存在', 404);
		}
		if (row.email === c.env.admin && (params.status !== undefined || params.deleted !== undefined)) {
			throw new BizError('不能停用或删除管理员账户', 400);
		}
		if (params.email !== undefined && String(params.email).toLowerCase() !== row.email.toLowerCase()) {
			throw new BizError('用户主邮箱不可修改，请新建用户后迁移数据', 400);
		}

		if (params.password !== undefined) {
			const password = String(params.password);
			if (password.length < 6) {
				throw new BizError('密码至少需要 6 个字符', 400);
			}
			await userService.setPwd(c, { userId: id, password });
		}
		if (params.status !== undefined) {
			const status = numberParam(params.status, 'status');
			if (![userConst.status.NORMAL, userConst.status.BAN].includes(status)) {
				throw new BizError('用户状态无效', 400);
			}
			await userService.setStatus(c, { userId: id, status });
		}
		if (params.roleId !== undefined) {
			const roleId = Number(params.roleId);
			if (!Number.isInteger(roleId) || roleId <= 0 || !await roleService.selectById(c, roleId)) {
				throw new BizError('角色不存在', 400);
			}
			await userService.setType(c, { userId: id, type: roleId });
		}
		if (params.deleted === false && row.isDel === isDel.DELETE) {
			await userService.restore(c, { userId: id, type: false });
		}

		return this.getUser(c, id);
	},

	async deleteUser(c, userId) {
		const id = positiveId(userId, 'userId');
		const row = await userService.selectByIdIncludeDel(c, id);
		if (!row) {
			throw new BizError('用户不存在', 404);
		}
		if (row.email === c.env.admin) {
			throw new BizError('不能删除管理员账户', 400);
		}

		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, id)).run();
		await c.env.kv.delete(KvConst.AUTH_INFO + id);
	},

	async listUserMailboxes(c, userId, params = {}) {
		const id = positiveId(userId, 'userId');
		if (!await userService.selectByIdIncludeDel(c, id)) {
			throw new BizError('用户不存在', 404);
		}
		const conditions = [eq(account.userId, id)];
		if (!booleanParam(params.deleted, false)) {
			conditions.push(eq(account.isDel, isDel.NORMAL));
		}
		return orm(c).select({
			accountId: account.accountId,
			email: account.email,
			name: account.name,
			status: account.status,
			latestEmailTime: account.latestEmailTime,
			createTime: account.createTime,
			isDeleted: account.isDel,
			isTemp: account.isTemp,
			expiresAt: account.expiresAt
		}).from(account).where(and(...conditions)).orderBy(asc(account.accountId)).all();
	},

	async createMailbox(c, userId, params, internalValues = {}) {
		const id = positiveId(userId, 'userId');
		const owner = await userService.selectById(c, id);
		if (!owner) {
			throw new BizError('用户不存在或已删除', 404);
		}

		const address = String(params.email || '').trim().toLowerCase();
		if (!verifyUtils.isEmail(address) || !hasConfiguredDomain(c.env.domain, address)) {
			throw new BizError('邮箱格式或域名无效', 400);
		}
		if (await accountService.selectByEmailIncludeDel(c, address)) {
			throw new BizError('邮箱地址已存在', 409);
		}

		if (address.includes('+')) {
			const baseAccount = await accountService.selectByEmailIncludeDel(c, emailUtils.getBaseEmail(address));
			if (!baseAccount || baseAccount.userId !== id) {
				throw new BizError('基础邮箱不属于该用户', 400);
			}
		}

		const ownerRole = await roleService.selectById(c, owner.type);
		if (!ownerRole) {
			throw new BizError('用户角色不存在', 409);
		}
		if (owner.email !== c.env.admin) {
			if (!roleService.hasAvailDomainPerm(ownerRole.availDomain, address)) {
				throw new BizError('该用户无权使用此域名', 403);
			}
			if (ownerRole.accountCount > 0 && await accountService.countUserAccount(c, id) >= ownerRole.accountCount) {
				throw new BizError('用户邮箱数量已达到上限', 403);
			}
		}

		return orm(c).insert(account).values({
			userId: id,
			email: address,
			name: String(params.name || emailUtils.getName(address)).slice(0, 30),
			...internalValues
		}).returning().get();
	},

	async createTempMailbox(c, params) {
		const userId = positiveId(params.userId, 'userId');
		const ttlMinutes = positiveIntegerParam(params.ttlMinutes, 'ttlMinutes', 60);
		if (ttlMinutes > 10080) {
			throw new BizError('ttlMinutes 不能超过 10080（7 天）', 400);
		}

		const domains = configuredDomains(c.env.domain);
		const domain = String(params.domain || domains[0] || '').trim().toLowerCase();
		if (!domains.includes(domain)) {
			throw new BizError('域名不在已配置域名列表中', 400);
		}

		const prefix = String(params.prefix || 'temp').trim().toLowerCase();
		if (!/^[a-z0-9][a-z0-9-]{0,19}$/.test(prefix)) {
			throw new BizError('prefix 只能包含小写字母、数字和连字符，长度为 1-20', 400);
		}

		const expiresAt = utcDateTime(Date.now() + ttlMinutes * 60 * 1000);
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const address = `${prefix}-${randomMailboxSuffix()}@${domain}`;
			try {
				const row = await this.createMailbox(c, userId, {
					email: address,
					name: params.name
				}, { isTemp: 1, expiresAt });
				return { ...row, ttlMinutes };
			} catch (error) {
				if (!isMailboxConflict(error)) throw error;
			}
		}

		throw new BizError('无法生成唯一临时邮箱，请重试', 409);
	},

	async cleanupTempMailbox(c, accountId) {
		const id = positiveId(accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) {
			throw new BizError('临时邮箱不存在', 404);
		}
		if (!row.isTemp) {
			throw new BizError('只能通过此接口清理临时邮箱', 400);
		}

		await accountService.physicsDelete(c, { accountId: id });
		return { accountId: id, deleted: true };
	},

	async updateMailbox(c, accountId, params) {
		const id = positiveId(accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) {
			throw new BizError('邮箱地址不存在', 404);
		}

		const values = {};
		if (params.name !== undefined) {
			const name = String(params.name).trim();
			if (!name || name.length > 30) {
				throw new BizError('邮箱名称不能为空且不能超过 30 个字符', 400);
			}
			values.name = name;
		}
		if (params.deleted !== undefined) {
			const owner = await userService.selectByIdIncludeDel(c, row.userId);
			if (booleanParam(params.deleted, false) && owner?.email === row.email) {
				throw new BizError('不能删除用户的主邮箱', 400);
			}
			values.isDel = booleanParam(params.deleted, false) ? isDel.DELETE : isDel.NORMAL;
		}

		if (Object.keys(values).length > 0) {
			await orm(c).update(account).set(values).where(eq(account.accountId, id)).run();
		}
		return orm(c).select().from(account).where(eq(account.accountId, id)).get();
	},

	async deleteMailbox(c, accountId) {
		return this.updateMailbox(c, accountId, { deleted: true });
	},

	async listEmails(c, params) {
		const { page, pageSize, offset } = pagination(params);
		const conditions = [];
		validateSort(params.sort);
		if (params.type !== undefined && !['received', 'sent'].includes(params.type)) {
			throw new BizError('type 必须是 received 或 sent', 400);
		}

		if (params.userId !== undefined) conditions.push(eq(email.userId, positiveId(params.userId, 'userId')));
		if (params.accountId !== undefined) conditions.push(eq(email.accountId, positiveId(params.accountId, 'accountId')));
		if (params.type === 'received') conditions.push(eq(email.type, emailConst.type.RECEIVE));
		if (params.type === 'sent') conditions.push(eq(email.type, emailConst.type.SEND));
		if (params.from) conditions.push(like(email.sendEmail, `%${params.from}%`));
		if (params.to) conditions.push(like(email.toEmail, `%${params.to}%`));
		if (params.subject) conditions.push(like(email.subject, `%${params.subject}%`));
		if (params.unread !== undefined) {
			conditions.push(eq(email.unread, booleanParam(params.unread, false) ? emailConst.unread.UNREAD : emailConst.unread.READ));
		}
		if (params.startTime) conditions.push(gte(email.createTime, validDate(params.startTime, 'startTime')));
		if (params.endTime) conditions.push(lte(email.createTime, validDate(params.endTime, 'endTime')));
		conditions.push(eq(email.isDel, booleanParam(params.deleted, false) ? isDel.DELETE : isDel.NORMAL));

		const where = and(...conditions);
		const items = await orm(c).select({
			emailId: email.emailId,
			userId: email.userId,
			accountId: email.accountId,
			from: email.sendEmail,
			fromName: email.name,
			to: email.toEmail,
			toName: email.toName,
			subject: email.subject,
			preview: sql`substr(coalesce(${email.text}, ''), 1, 300)`,
			type: email.type,
			status: email.status,
			unread: email.unread,
			createTime: email.createTime,
			isDeleted: email.isDel
		}).from(email)
			.where(where)
			.orderBy(params.sort === 'asc' ? asc(email.emailId) : desc(email.emailId))
			.limit(pageSize)
			.offset(offset)
			.all();

		const totalRow = await orm(c).select({ total: count() }).from(email).where(where).get();
		return pageResult(items, totalRow.total, page, pageSize);
	},

	async getEmail(c, emailId) {
		const id = positiveId(emailId, 'emailId');
		const row = await orm(c).select().from(email).where(eq(email.emailId, id)).get();
		if (!row) {
			throw new BizError('邮件不存在', 404);
		}
		row.attachments = await attService.selectByEmailIds(c, [id]);
		return row;
	},

	async sendEmail(c, params) {
		const userId = positiveId(params.userId, 'userId');
		const accountId = positiveId(params.accountId, 'accountId');
		const sender = await userService.selectById(c, userId);
		if (!sender) {
			throw new BizError('发件用户不存在或已删除', 404);
		}
		if (!await roleService.selectById(c, sender.type)) {
			throw new BizError('发件用户角色不存在', 409);
		}
		const senderAccount = await accountService.selectById(c, accountId);
		if (!senderAccount) {
			throw new BizError('发件邮箱不存在或已删除', 404);
		}
		if (senderAccount.userId !== userId) {
			throw new BizError('发件邮箱不属于指定用户', 400);
		}
		const recipients = Array.isArray(params.to) ? params.to : [params.to];
		if (recipients.length === 0 || recipients.some(address => !verifyUtils.isEmail(address))) {
			throw new BizError('收件人邮箱格式不正确', 400);
		}
		if (!params.subject || (!params.text && !params.html)) {
			throw new BizError('主题和邮件正文不能为空', 400);
		}
		const attachments = params.attachments || [];
		if (!Array.isArray(attachments) || attachments.length > 10 || attachments.some(item => (
			!item || !item.filename || !item.type || !item.content
		))) {
			throw new BizError('附件必须包含 filename、type、content，且不能超过 10 个', 400);
		}

		return emailService.send(c, {
			accountId,
			name: params.fromName,
			sendType: 'new',
			receiveEmail: recipients,
			text: params.text || '',
			content: params.html || '',
			subject: String(params.subject),
			attachments
		}, userId);
	},

	async updateEmail(c, emailId, params) {
		const id = positiveId(emailId, 'emailId');
		if (!await orm(c).select({ emailId: email.emailId }).from(email).where(eq(email.emailId, id)).get()) {
			throw new BizError('邮件不存在', 404);
		}

		const values = {};
		if (params.unread !== undefined) {
			values.unread = booleanParam(params.unread, false) ? emailConst.unread.UNREAD : emailConst.unread.READ;
		}
		if (params.deleted !== undefined) {
			values.isDel = booleanParam(params.deleted, false) ? isDel.DELETE : isDel.NORMAL;
		}
		if (Object.keys(values).length === 0) {
			throw new BizError('没有可更新的邮件字段', 400);
		}

		await orm(c).update(email).set(values).where(eq(email.emailId, id)).run();
		return this.getEmail(c, id);
	},

	async deleteEmail(c, emailId) {
		return this.updateEmail(c, emailId, { deleted: true });
	}
};

function pagination(params) {
	const page = positiveIntegerParam(params.page, 'page', 1);
	const pageSize = positiveIntegerParam(params.pageSize, 'pageSize', 20);
	if (pageSize > 100) {
		throw new BizError('pageSize 不能超过 100', 400);
	}
	return { page, pageSize, offset: (page - 1) * pageSize };
}

function pageResult(items, total, page, pageSize) {
	return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

function positiveId(value, name) {
	const id = Number(value);
	if (!Number.isInteger(id) || id <= 0) {
		throw new BizError(`${name} 必须是正整数`, 400);
	}
	return id;
}

function numberParam(value, name) {
	const number = Number(value);
	if (!Number.isFinite(number)) {
		throw new BizError(`${name} 必须是数字`, 400);
	}
	return number;
}

function positiveIntegerParam(value, name, defaultValue) {
	if (value === undefined || value === null || value === '') return defaultValue;
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number <= 0) {
		throw new BizError(`${name} 必须是正整数`, 400);
	}
	return number;
}

function validateSort(value) {
	if (value !== undefined && !['asc', 'desc'].includes(value)) {
		throw new BizError('sort 必须是 asc 或 desc', 400);
	}
}

function hasConfiguredDomain(value, emailAddress) {
	const domain = emailUtils.getDomain(emailAddress).toLowerCase();
	return configuredDomains(value).includes(domain);
}

function configuredDomains(value) {
	let domains = value;
	if (typeof domains === 'string') {
		try {
			const parsed = JSON.parse(domains);
			domains = Array.isArray(parsed) ? parsed : domains.split(',');
		} catch {
			domains = domains.split(',');
		}
	}
	return Array.isArray(domains)
		? domains.map(item => String(item).trim().toLowerCase()).filter(Boolean)
		: [];
}

function booleanParam(value, defaultValue) {
	if (value === undefined || value === null || value === '') return defaultValue;
	if (value === true || value === 'true' || value === 1 || value === '1') return true;
	if (value === false || value === 'false' || value === 0 || value === '0') return false;
	throw new BizError('布尔参数必须是 true 或 false', 400);
}

function validDate(value, name) {
	const date = dayjs(value);
	if (!date.isValid()) {
		throw new BizError(`${name} 时间格式无效`, 400);
	}
	return date.format('YYYY-MM-DD HH:mm:ss');
}

function randomMailboxSuffix() {
	return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}

function utcDateTime(value) {
	return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function isMailboxConflict(error) {
	return (error?.name === 'BizError' && error.code === 409)
		|| String(error?.message || '').includes('UNIQUE constraint failed: account.email');
}

export default openApiService;
