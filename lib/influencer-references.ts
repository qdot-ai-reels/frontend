const DEFAULT_REFERENCE_SOURCE =
  process.env.NEXT_PUBLIC_INFLUENCER_REFERENCE_URLS ??
  process.env.NEXT_PUBLIC_INFLUENCER_REFERENCE_URL ??
  '';

export const DEFAULT_INFLUENCER_REFERENCE_URLS = DEFAULT_REFERENCE_SOURCE.split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .slice(0, 2);

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.test') ||
    normalized.endsWith('.invalid') ||
    normalized.endsWith('.example') ||
    isPrivateIpv4(normalized)
  );
}

export function validateInfluencerReferenceUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') {
      return 'HTTPS 공개 이미지 URL만 사용할 수 있습니다.';
    }
    if (url.username || url.password) {
      return '인증 정보가 포함된 URL은 사용할 수 없습니다.';
    }
    if (!url.hostname || isPrivateHostname(url.hostname)) {
      return 'localhost, 사설망, 테스트용 주소는 사용할 수 없습니다.';
    }
  } catch {
    return '올바른 HTTPS 이미지 URL을 입력해 주세요.';
  }

  return null;
}

export function activeInfluencerReferenceUrls(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean).slice(0, 2);
}
