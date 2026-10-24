import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTransport, type Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from '../logger';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Sends through any SMTP server, e.g. smtp://mailpit:1025 in Docker or a provider in production. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(url: string, from: string) {
    this.transport = createTransport(url);
    this.from = from;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Development fallback when SMTP_URL is empty: each email becomes an HTML file to open. */
export class OutboxMailer implements Mailer {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(this.dir, `${stamp}-${message.to.replace(/[^a-z0-9@._-]/gi, '_')}.html`);
    await writeFile(file, message.html);
    logger.info({ to: message.to, subject: message.subject, file }, 'Email saved to outbox');
  }
}

/** Keeps messages in memory; used by tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

export function createMailer(): Mailer {
  return config.smtpUrl
    ? new SmtpMailer(config.smtpUrl, config.mailFrom)
    : new OutboxMailer(config.outboxDir);
}
