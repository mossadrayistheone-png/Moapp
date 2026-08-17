// ── Visual themes for each app mode ──────────────────────────────────────────

// Shared theme for Settings and Notes (Captured) screens.
// Deep crimson background with gold accents — distinct from the carousel modes.
export const UtilityTheme = {
  bg:           '#0E0202' as const,
  card:         'rgba(180,20,20,0.10)' as const,
  cardBorder:   'rgba(200,30,30,0.22)' as const,
  divider:      'rgba(180,20,20,0.18)' as const,
  accent:       '#C9A84C' as const,
  accentSoft:   'rgba(201,168,76,0.10)' as const,
  accentMedium: 'rgba(201,168,76,0.20)' as const,
  chipBorder:   'rgba(200,30,30,0.28)' as const,
  text:         'rgba(255,255,255,0.88)' as const,
  textSub:      'rgba(255,255,255,0.34)' as const,
  textMuted:    'rgba(255,255,255,0.14)' as const,
  danger:       '#e05252' as const,
};

export const DailyTheme = {
  bg:           '#EEF4FF' as const,
  bgGradient:   ['#E8F0FF', '#F4F8FF', '#FFFFFF'] as const,
  card:         '#FFFFFF' as const,
  cardBorder:   'rgba(59,123,248,0.10)' as const,
  accent:       '#3B7BF8' as const,
  accentSoft:   'rgba(59,123,248,0.10)' as const,
  accentMedium: 'rgba(59,123,248,0.22)' as const,
  text:         '#1A1D2E' as const,
  textSub:      '#5B6278' as const,
  textMuted:    'rgba(26,29,46,0.35)' as const,
  success:      '#22C55E' as const,
  warning:      '#F59E0B' as const,
  danger:       '#EF4444' as const,
  divider:      'rgba(59,123,248,0.08)' as const,
};

export const ExecutiveTheme = {
  bg:           '#0B0D14' as const,
  bgGradient:   ['#0B0D14', '#0E1120', '#0B0D14'] as const,
  card:         'rgba(255,255,255,0.045)' as const,
  cardBorder:   'rgba(255,255,255,0.085)' as const,
  accent:       '#8B96CC' as const,
  accentSoft:   'rgba(139,150,204,0.12)' as const,
  accentMedium: 'rgba(139,150,204,0.22)' as const,
  text:         '#DDE2F4' as const,
  textSub:      'rgba(221,226,244,0.42)' as const,
  textMuted:    'rgba(221,226,244,0.18)' as const,
  highlight:    '#4ADE80' as const,
  danger:       '#F87171' as const,
  divider:      'rgba(255,255,255,0.06)' as const,
};

export const LuxuryTheme = {
  bg:           '#000000' as const,
  bgGradient:   ['#000000', '#080808', '#000000'] as const,
  card:         'rgba(201,168,76,0.05)' as const,
  cardBorder:   'rgba(201,168,76,0.16)' as const,
  accent:       '#C9A84C' as const,
  accentLight:  '#D4B96A' as const,
  accentSoft:   'rgba(201,168,76,0.10)' as const,
  accentMedium: 'rgba(201,168,76,0.20)' as const,
  text:         'rgba(255,255,255,0.88)' as const,
  textSub:      'rgba(255,255,255,0.34)' as const,
  textMuted:    'rgba(255,255,255,0.14)' as const,
  divider:      'rgba(201,168,76,0.10)' as const,
};
