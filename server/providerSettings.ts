import fs from 'node:fs';
import path from 'node:path';

type ProviderSettings = {
  geminiApiKey?: string;
  preferredTtsQuality: 'full' | 'lite';
  ttsVoiceCharacter: 'auto' | 'feminine' | 'masculine';
  ttsVoiceStyle: 'natural' | 'warm' | 'calm' | 'energetic' | 'narrator';
  ttsVoiceSpeed: 'slow' | 'normal' | 'brisk';
  ttsPauseStyle: 'brief' | 'natural' | 'relaxed';
  ttsProviderMode: 'auto' | 'gemini' | 'polly';
  chatProviderMode: 'auto' | 'gemini' | 'bedrock';
  awsCredentialMode: 'profile' | 'access_keys';
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
  awsProfileName: string;
};

export type AIProviderSettingsUpdate = Omit<
  Partial<ProviderSettings>,
  'geminiApiKey' | 'awsAccessKeyId' | 'awsSecretAccessKey' | 'awsSessionToken'
> & {
  geminiApiKey?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  awsSessionToken?: string | null;
};

const settingsPath = path.join(process.env.LUMINABOARD_DATA_DIR || path.join(process.cwd(), 'data'), 'ai-provider-settings.json');
const defaults: ProviderSettings = {
  preferredTtsQuality: 'full',
  ttsVoiceCharacter: 'auto',
  ttsVoiceStyle: 'natural',
  ttsVoiceSpeed: 'normal',
  ttsPauseStyle: 'natural',
  ttsProviderMode: 'auto',
  chatProviderMode: 'auto',
  awsCredentialMode: 'profile',
  awsProfileName: process.env.AWS_PROFILE || 'luminaboard',
};

function readSettings(): ProviderSettings {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...defaults, ...(parsed as Partial<ProviderSettings>) };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Could not read AI provider settings; using defaults.');
    }
  }
  return { ...defaults };
}

export function getAIProviderSettings(): ProviderSettings {
  const settings = readSettings();
  const geminiApiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (geminiApiKey) process.env.GEMINI_API_KEY = geminiApiKey;
  return {
    ...settings,
    ...(geminiApiKey ? { geminiApiKey } : {}),
    awsAccessKeyId: settings.awsAccessKeyId,
    awsSecretAccessKey: settings.awsSecretAccessKey,
    awsSessionToken: settings.awsSessionToken,
  };
}

export function getPublicAIProviderSettings() {
  const settings = getAIProviderSettings();
  const awsCredentialsConfigured = Boolean(settings.awsAccessKeyId && settings.awsSecretAccessKey);
  return {
    geminiKeyConfigured: Boolean(settings.geminiApiKey),
    geminiKeySource: settings.geminiApiKey ? (readSettings().geminiApiKey ? 'app' : 'environment') : 'missing',
    preferredTtsQuality: settings.preferredTtsQuality,
    ttsVoiceCharacter: settings.ttsVoiceCharacter,
    ttsVoiceStyle: settings.ttsVoiceStyle,
    ttsVoiceSpeed: settings.ttsVoiceSpeed,
    ttsPauseStyle: settings.ttsPauseStyle,
    ttsProviderMode: settings.ttsProviderMode,
    chatProviderMode: settings.chatProviderMode,
    awsCredentialMode: settings.awsCredentialMode,
    awsCredentialsConfigured,
    awsSessionTokenConfigured: Boolean(settings.awsSessionToken),
    awsProfileName: settings.awsProfileName,
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  } as const;
}

export function saveAIProviderSettings(updates: AIProviderSettingsUpdate): void {
  const current = readSettings();
  const next: ProviderSettings = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      delete (next as unknown as Record<string, unknown>)[key];
    } else if (value !== undefined) {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
  }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, settingsPath);
  if (next.geminiApiKey) process.env.GEMINI_API_KEY = next.geminiApiKey;
  else delete process.env.GEMINI_API_KEY;
}

// Load locally saved provider secrets before any AI routes run.
getAIProviderSettings();
