import BizError from '../error/biz-error';
import { Resend } from 'resend';
import emailUtils from '../utils/email-utils';
import settingService from './setting-service';
import { t } from '../i18n/i18n';

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
	}

};

export default externalService;