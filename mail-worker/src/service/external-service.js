import dayjs from 'dayjs';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Resend } from 'resend';
import BizError from '../error/biz-error';
import orm from '../entity/orm';
import email from '../entity/email';
import { emailConst, isDel } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';
import settingService from './setting-service';

const externalService = {
	async sendEmail(c, params) {
		this.verifyApiKey(c);
		const to = params.to;
		if (!Array.isArray(to) || to.length === 0 || to.some(address => !verifyUtils.isEmail(address))) {
			throw new BizError('收件人邮箱不能为空或格式不正确', 400);
		}
		if (!params.subject || (!params.text && !params.html)) {
			throw new BizError('邮件主题和正文不能为空', 400);
		}

		const senderEmail = c.env.SYSTEM_SENDER_EMAIL;
		const senderName = params.fromName || c.env.SYSTEM_SENDER_NAME || 'System';
		if (!senderEmail) {
			throw new BizError('系统发件邮箱未配置', 500);
		}

		const { resendTokens } = await settingService.query(c);
		const resendToken = resendTokens[emailUtils.getDomain(senderEmail)];
		if (!resendToken) {
			throw new BizError('发件域名未配置 Resend Token', 500);
		}

		const response = await new Resend(resendToken).emails.send({
			from: `${senderName} <${senderEmail}>`,
			to,
			subject: params.subject,
			...(params.text ? { text: params.text } : {}),
			...(params.html ? { html: params.html } : {})
		});
		if (response.error) {
			throw new BizError(`发送邮件失败: ${response.error.message}`, 502);
		}

		return {
			messageId: response.data.id,
			sentTo: to,
			subject: params.subject,
			sentAt: new Date().toISOString()
		};
	},

	async queryEmail(c, params) {
		this.verifyApiKey(c);
		if (!verifyUtils.isEmail(params.toEmail)) {
			throw new BizError('收件邮箱地址不能为空或格式不正确', 400);
		}

		const size = Math.min(50, Math.max(1, Number(params.size) || 10));
		const conditions = [
			eq(email.toEmail, params.toEmail),
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL)
		];
		if (params.minutesAgo && Number(params.minutesAgo) > 0) {
			conditions.push(gte(email.createTime, dayjs().subtract(Number(params.minutesAgo), 'minute').format('YYYY-MM-DD HH:mm:ss')));
		} else {
			if (params.startTime) conditions.push(gte(email.createTime, params.startTime));
			if (params.endTime) conditions.push(lte(email.createTime, params.endTime));
		}
		if (params.fromEmail) conditions.push(eq(email.sendEmail, params.fromEmail));

		return orm(c).select({
			emailId: email.emailId,
			fromEmail: email.sendEmail,
			fromName: email.name,
			toEmail: email.toEmail,
			subject: email.subject,
			text: email.text,
			content: email.content,
			createTime: email.createTime
		}).from(email).where(and(...conditions)).orderBy(desc(email.emailId)).limit(size).all();
	},

	verifyApiKey(c) {
		const authorization = c.req.header('Authorization') || '';
		const provided = authorization.toLowerCase().startsWith('bearer ')
			? authorization.slice(7).trim()
			: c.req.header('X-API-KEY');
		if (!c.env.INTERNAL_API_KEY) {
			throw new BizError('系统 API Key 未配置', 500);
		}
		if (!provided || provided !== c.env.INTERNAL_API_KEY) {
			throw new BizError('API Key 无效', 401);
		}
	}
};

export default externalService;
