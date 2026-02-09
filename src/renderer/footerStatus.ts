export type FooterStatusSource = {
  status: 'available' | 'missing';
  message: string;
};

export type AiAvailability =
  | {
      enabled: true;
      reason: 'ok';
      message: string;
    }
  | {
      enabled: false;
      reason: 'offline' | 'provocations-disabled' | 'auth-unavailable';
      message: string;
    };

export const deriveFooterStatusLabel = (input: {
  sourceStatus: FooterStatusSource;
  aiAvailability: AiAvailability;
}): string => {
  const { sourceStatus, aiAvailability } = input;
  if (sourceStatus?.status === 'missing') {
    return `Status: ${sourceStatus.message}`;
  }

  if (aiAvailability.reason === 'offline') {
    return 'Status: offline';
  }

  if (!aiAvailability.enabled) {
    return `Status: AI ${aiAvailability.reason}`;
  }

  return 'Status: ok';
};
