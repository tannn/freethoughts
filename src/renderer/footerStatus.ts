export type FooterStatusSource = {
  status: 'available' | 'missing';
  message: string;
};

export type FooterStatusAiAvailability = {
  enabled: boolean;
  reason: 'ok' | 'offline' | 'provocations-disabled' | 'auth-unavailable';
};

export const deriveFooterStatusLabel = (input: {
  sourceStatus?: FooterStatusSource;
  aiAvailability: FooterStatusAiAvailability;
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
