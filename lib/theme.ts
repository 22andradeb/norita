import { useColorScheme } from 'react-native';

// Light and dark palettes. Text colours meet WCAG AA (4.5:1) on both `bg` and `card`.
const light = {
  dark: false,
  bg: '#F4F3EF',
  card: '#FFFFFF',
  cardAlt: '#ECEAE4',
  text: '#15171C',
  muted: '#575C66',
  border: '#E2DFD8',
  track: '#E6E3DC',
  primary: '#1F5FBF',
  onPrimary: '#FFFFFF',
  primarySoft: '#E3ECFA',
  success: '#1B7A50',
  successSoft: '#E1F3EA',
  warning: '#8F5400',
  warningSoft: '#FCEFD9',
  danger: '#B42318',
  dangerSoft: '#FDE7E4',
};

const dark: typeof light = {
  dark: true,
  bg: '#0E1013',
  card: '#181B20',
  cardAlt: '#22262D',
  text: '#F2F3F5',
  muted: '#A6ACB7',
  border: '#2B3038',
  track: '#2B3038',
  primary: '#7AA5FF',
  onPrimary: '#0B1226',
  primarySoft: '#1B2A47',
  success: '#5FD39B',
  successSoft: '#123326',
  warning: '#F4BB55',
  warningSoft: '#3A2A0E',
  danger: '#FF7A6B',
  dangerSoft: '#3D1714',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Category colours: mid-tones that read on both light and dark cards. */
export const accents = {
  wellbeing: '#3E7BFA',
  meds: '#30A46C',
  fluids: '#05A2C2',
  meals: '#F76B15',
  bloodPressure: '#E5484D',
  heartRate: '#D6409F',
  spo2: '#0090FF',
  glucose: '#8E4EC6',
  temperature: '#F76B15',
  weight: '#AD7F58',
  respiration: '#12A594',
  pain: '#6E56CF',
  sleep: '#5B5BD6',
  neutral: '#8B8D98',
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
