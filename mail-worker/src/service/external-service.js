import BizError from '../error/biz-error';
import { Resend } from 'resend';
import emailUtils from '../utils/email-utils';
import settingService from './setting-service';
import { t } from '../i18n/i18n';
import orm from '../entity/orm';
import email from '../entity/email';
import { and, desc, eq, gte, lte, like } from 'drizzle-orm';
import { emailConst, isDel } from '../const/entity-const';
import dayjs from 'dayjs';

const externalService = {

	async sendEmail(c, params) {
		
		// 验证API Key
		await this.verifyApiKey(c);

		let {
			to,           // 收件人邮箱 (必填)
			subject,      // 邮件主题 (必填) 
			text,         // 纯文本内容 (可选)
			html,         // HTML内容 (可选)
			fromName      // 发件人名称 (可选，使用环境变量默认值)
		} = params;

		// 参数验证
		if (!to || !Array.isArray(to) || to.length === 0) {
			throw new BizError('收件人邮箱不能为空');
		}

		if (!subject) {
			throw new BizError('邮件主题不能为空');
		}

		if (!text && !html) {
			throw new BizError('邮件内容不能为空');
		}

		// 验证邮箱格式
		for (const email of to) {
			if (!this.isValidEmail(email)) {
				throw new BizError(`邮箱格式不正确: ${email}`);
			}
		}

		// 获取系统发件配置
		const senderEmail = c.env.SYSTEM_SENDER_EMAIL;
		const senderName = fromName || c.env.SYSTEM_SENDER_NAME || 'System';

		if (!senderEmail) {
			throw new BizError('系统发件邮箱未配置');
		}

		// 获取对应域名的Resend Token
		const { resendTokens } = await settingService.query(c);
		const domain = emailUtils.getDomain(senderEmail);
		const resendToken = resendTokens[domain];

		if (!resendToken) {
			throw new BizError('发件域名未配置Resend Token');
		}

		// 发送邮件
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${senderName} <${senderEmail}>`,
			to: to,
			subject: subject
		};

		if (text) sendForm.text = text;
		if (html) sendForm.html = html;

		try {
			const resendResult = await resend.emails.send(sendForm);
			
			if (resendResult.error) {
				throw new BizError(resendResult.error.message);
			}

			return {
				messageId: resendResult.data.id,
				sentTo: to,
				subject: subject,
				sentAt: new Date().toISOString()
			};

		} catch (error) {
			throw new BizError(`发送邮件失败: ${error.message}`);
		}
	},

	async verifyApiKey(c) {
		const apiKey = c.req.header('X-API-KEY') || c.req.header('Authorization')?.replace('Bearer ', '');
		const validApiKey = c.env.INTERNAL_API_KEY;

		if (!validApiKey) {
			throw new BizError('系统API Key未配置', 500);
		}

		if (!apiKey || apiKey !== validApiKey) {
			throw new BizError('API Key无效', 401);
		}
	},

	isValidEmail(email) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	},

	async queryEmail(c, params) {
		// 验证API Key
		await this.verifyApiKey(c);

		let {
			toEmail,      // 收件邮箱地址 (必填)
			fromEmail,    // 发件人邮箱筛选 (可选)
			startTime,    // 开始时间 (可选)
			endTime,      // 结束时间 (可选)
			minutesAgo,   // 查询最近N分钟 (可选，优先于startTime/endTime)
			size          // 返回数量限制 (可选，默认10，最大50)
		} = params;

		// 参数验证
		if (!toEmail) {
			throw new BizError('收件邮箱地址不能为空');
		}

		if (!this.isValidEmail(toEmail)) {
			throw new BizError(`收件邮箱格式不正确: ${toEmail}`);
		}

		// 处理数量限制
		size = Number(size) || 10;
		if (size > 50) {
			size = 50;
		}

		// 构建查询条件
		const conditions = [
			eq(email.toEmail, toEmail),
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL)
		];

		// 处理时间范围
		if (minutesAgo) {
			const minutesAgoNum = Number(minutesAgo);
			if (minutesAgoNum > 0) {
				const startTimeCalc = dayjs().subtract(minutesAgoNum, 'minute').format('YYYY-MM-DD HH:mm:ss');
				conditions.push(gte(email.createTime, startTimeCalc));
			}
		} else {
			if (startTime) {
				conditions.push(gte(email.createTime, startTime));
			}
			if (endTime) {
				conditions.push(lte(email.createTime, endTime));
			}
		}

		// 发件人筛选
		if (fromEmail) {
			conditions.push(eq(email.sendEmail, fromEmail));
		}

		// 执行查询
		const list = await orm(c)
			.select({
				emailId: email.emailId,
				fromEmail: email.sendEmail,
				fromName: email.name,
				toEmail: email.toEmail,
				subject: email.subject,
				text: email.text,
				content: email.content,
				createTime: email.createTime
			})
			.from(email)
			.where(and(...conditions))
			.orderBy(desc(email.emailId))
			.limit(size)
			.all();

		return list;
	}

};

export default externalService;