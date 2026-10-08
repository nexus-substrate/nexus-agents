/** File-local SARIF coverage diagnostics and strict Semgrep notification classification. */
import { z } from 'zod';
import type {
  ScannerParseDiagnostic,
  ScannerFileDiagnostic,
  SarifParseResult,
} from './sarif-types.js';

export const SarifNotificationSchema = z.object({
  descriptor: z.object({ id: z.string().optional() }).optional(),
  level: z.string().optional(),
  message: z.object({ text: z.string().optional() }).optional(),
});
/**
 * C0/C1 controls (incl. NUL, CR, LF, ESC) and Unicode line separators. A path
 * holding one cannot be a path the comparison can name or verify safely (#7294).
 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

export function hasControlCharacter(text: string): boolean {
  return text.replace(CONTROL_CHARACTERS, '') !== text;
}

/** Collapse each run of control characters in untrusted text to one space. */
export function stripControlCharacters(text: string): string {
  return text.replace(CONTROL_CHARACTERS, ' ');
}

/** Keep configuration failures fatal, regardless of a file-local-looking message. */
export function checkConfigurationNotifications(
  notifications: readonly z.infer<typeof SarifNotificationSchema>[] | undefined,
  errors: string[]
): void {
  for (const notification of notifications ?? []) {
    if (notification.level !== 'note' && notification.level !== 'none')
      errors.push(
        `Scanner configuration: ${notification.message?.text ?? 'unknown configuration error'}`
      );
  }
}

/** Preserve absent diagnostic fields on clean scans. */
export function diagnosticFields(
  parseDiagnostics: ScannerParseDiagnostic[],
  scannerDiagnostics: ScannerFileDiagnostic[]
): Pick<SarifParseResult, 'parseDiagnostics' | 'scannerDiagnostics'> {
  return {
    ...(parseDiagnostics.length > 0 ? { parseDiagnostics } : {}),
    ...(scannerDiagnostics.length > 0 ? { scannerDiagnostics } : {}),
  };
}

/** Retain coverage-affecting warnings instead of treating them as a clean scan. */
export function checkNotifications(
  notifications: readonly z.infer<typeof SarifNotificationSchema>[] | undefined,
  errors: string[],
  parseDiagnostics: ScannerParseDiagnostic[],
  scannerDiagnostics: ScannerFileDiagnostic[],
  scanner: string
): void {
  for (const notification of notifications ?? []) {
    const diagnostic = parseNotification(notification);
    const scannerDiagnostic = parseScannerNotification(notification, scanner);
    if (diagnostic !== undefined) parseDiagnostics.push(diagnostic);
    else if (scannerDiagnostic !== undefined) scannerDiagnostics.push(scannerDiagnostic);
    else if (notification.level !== 'note' && notification.level !== 'none')
      errors.push(`Scanner notification: ${notification.message?.text ?? 'unknown scanner error'}`);
  }
}

/** Only exact Semgrep file-local headers qualify; pathless/global failures remain errors. */
function parseScannerNotification(
  notification: z.infer<typeof SarifNotificationSchema>,
  scanner: string
): ScannerFileDiagnostic | undefined {
  const kind = fileErrorKind(notification.descriptor?.id, scanner);
  const message = notification.message?.text;
  if (kind === undefined || message === undefined) return undefined;
  const location = fileErrorLocation(message, kind);
  return location === undefined ? undefined : { ...location, kind, scanner, message };
}

function fileErrorLocation(
  message: string,
  kind: ScannerFileDiagnostic['kind']
): Pick<ScannerFileDiagnostic, 'file' | 'rule'> | undefined {
  const header =
    /^(Internal matching error|Timeout) (?:when running (\S+) on ([^\n]+)|at line ([^\n]+):\d+):\n/.exec(
      message
    );
  if (header?.[1] !== kind) return undefined;
  const file = header[3] ?? header[4];
  const rule = header[2];
  if (
    file === undefined ||
    hasControlCharacter(file) ||
    (kind === 'Internal matching error' && rule === undefined)
  )
    return undefined;
  return { file, ...(rule === undefined ? {} : { rule }) };
}

function fileErrorKind(
  kind: string | undefined,
  scanner: string
): ScannerFileDiagnostic['kind'] | undefined {
  if (!['semgrep', 'semgrep oss'].includes(scanner.toLowerCase())) return undefined;
  if (kind !== 'Internal matching error' && kind !== 'Timeout') return undefined;
  return kind;
}

/** Semgrep SARIF retains a descriptor and message but drops JSON parse tags/spans. */
function parseNotification(
  notification: z.infer<typeof SarifNotificationSchema>
): ScannerParseDiagnostic | undefined {
  if (!/^(?:Syntax error|Other syntax error)$/.test(notification.descriptor?.id ?? ''))
    return undefined;
  const message = notification.message?.text;
  if (message === undefined) return undefined;
  const file = /^(?:Syntax error|Other syntax error) at line (.+):(\d+):(?:\n|$| )/.exec(
    message
  )?.[1];
  return file === undefined || hasControlCharacter(file)
    ? undefined
    : { file, kind: 'parse', message };
}
