import nodemailer, { type Transporter } from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env["SMTP_PORT"] ?? 587),
    secure: process.env["SMTP_SECURE"] === "true",
    user,
    pass,
  };
}

let transporter: Transporter | null = null;

export function isMailerConfigured(): boolean {
  return readSmtpConfig() !== null && Boolean(process.env["MAIL_FROM"]);
}

function getTransporter(): Transporter {
  const config = readSmtpConfig();
  if (!config) throw new Error("MAIL_NOT_CONFIGURED");
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }
  return transporter;
}

export interface MailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export async function sendMail(input: MailInput): Promise<boolean> {
  const from = process.env["MAIL_FROM"];
  if (!readSmtpConfig() || !from) {
    console.warn(
      `[mailer] SMTP not configured; skipping email "${input.subject}" to ${Array.isArray(input.to) ? input.to.join(", ") : input.to}`,
    );
    return false;
  }

  await getTransporter().sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html !== undefined ? { html: input.html } : {}),
    ...(input.replyTo !== undefined ? { replyTo: input.replyTo } : {}),
  });
  return true;
}

export interface IncidentAlertInput {
  recipients: string[];
  incidentType: string;
  severity: string;
  plateNumber: string;
  companyName: string;
  latitude: number;
  longitude: number;
  detectedAt: Date;
  description?: string;
}

export function buildIncidentAlertEmail(input: IncidentAlertInput): MailInput {
  const mapsLink = `https://www.google.com/maps?q=${input.latitude},${input.longitude}`;
  const lines = [
    `TRANSIT EMERGENCY ALERT`,
    ``,
    `Company:   ${input.companyName}`,
    `Vehicle:   ${input.plateNumber}`,
    `Incident:  ${input.incidentType}`,
    `Severity:  ${input.severity}`,
    `Detected:  ${input.detectedAt.toISOString()}`,
    `Location:  ${input.latitude}, ${input.longitude}`,
    `Map:       ${mapsLink}`,
    input.description ? `Details:   ${input.description}` : ``,
    ``,
    `Log in to the command dashboard for live status and dispatch tracking.`,
  ].filter((line) => line !== "");

  return {
    to: input.recipients,
    subject: `[TRANSIT] ${input.incidentType} detected on ${input.plateNumber}`,
    text: lines.join("\n"),
  };
}

export async function sendIncidentAlert(input: IncidentAlertInput): Promise<boolean> {
  if (input.recipients.length === 0) return false;
  return sendMail(buildIncidentAlertEmail(input));
}

export interface JourneyCompletedInput {
  recipients: string[];
  companyName: string;
  plateNumber: string;
  routeCode: string | null;
  routeName: string | null;
  journeyId: number;
  completedAt: Date;
}

export function buildJourneyCompletedEmail(input: JourneyCompletedInput): MailInput {
  const route = [input.routeCode, input.routeName].filter(Boolean).join(" · ");
  const lines = [
    `TRANSIT JOURNEY COMPLETE`,
    ``,
    `Company:    ${input.companyName}`,
    `Vehicle:    ${input.plateNumber}`,
    `Journey:    #${input.journeyId}`,
    `Route:      ${route || "—"}`,
    `Completed:  ${input.completedAt.toISOString()}`,
    ``,
    `The bus reached its destination. The journey was completed automatically`,
    `and the vehicle is now available in the command dashboard.`,
  ];

  return {
    to: input.recipients,
    subject: `[TRANSIT] Journey #${input.journeyId} completed — ${input.plateNumber}`,
    text: lines.join("\n"),
  };
}

export async function sendJourneyCompletedEmail(
  input: JourneyCompletedInput,
): Promise<boolean> {
  if (input.recipients.length === 0) return false;
  return sendMail(buildJourneyCompletedEmail(input));
}
